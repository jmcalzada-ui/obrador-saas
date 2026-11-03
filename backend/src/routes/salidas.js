// Salidas de lotes a clientes (módulo opcional, lo activa el gestor en
// Configuración). Cada salida es un pedido a un cliente con sus líneas:
// producto, lote (de producción final o interna, o anotado a mano) y cantidad.
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermiso, db } from "../auth/middleware.js";
import { ruta, validar } from "../lib/utiles.js";

export const salidasRouter = Router();
export const clientesRouter = Router();

/** Solo con el módulo activado. */
async function moduloActivo(req, res, next) {
  try {
    const activo = await db(req, async (c) => (await c.query("SELECT modulo_salidas FROM obradores")).rows[0]?.modulo_salidas);
    if (!activo) return res.status(403).json({ error: "Las salidas a clientes no están activadas. El gestor puede activarlas en Más → Configuración." });
    next();
  } catch (e) { next(e); }
}
for (const r of [salidasRouter, clientesRouter]) r.use(requireAuth, moduloActivo);

const fallo = (msg, status) => Object.assign(new Error(msg), { status });

// ---------- Clientes ----------
const CAMPOS_CLIENTE = "id, nombre, cif, contacto, direccion, activo";
clientesRouter.get(
  "/",
  ruta(async (req, res) => {
    const clientes = await db(req, async (c) => (await c.query(
      `SELECT ${CAMPOS_CLIENTE}, (SELECT count(*)::int FROM salidas s WHERE s.cliente_id = cl.id) AS salidas
         FROM clientes cl ORDER BY lower(nombre)`
    )).rows);
    res.json({ clientes });
  })
);
const esquemaCliente = z.object({
  nombre: z.string().trim().min(1, "Escribe el nombre del cliente.").max(160),
  cif: z.string().trim().max(20).nullable().optional(),
  contacto: z.string().trim().max(240).nullable().optional(),
  direccion: z.string().trim().max(240).nullable().optional(),
  activo: z.boolean().optional(),
});
clientesRouter.post(
  "/",
  requirePermiso("registrar"),
  ruta(async (req, res) => {
    const d = validar(esquemaCliente, req.body, res);
    if (!d) return;
    try {
      const cliente = await db(req, async (c) => (await c.query(
        `INSERT INTO clientes (obrador_id, nombre, cif, contacto, direccion) VALUES ($1,$2,$3,$4,$5) RETURNING ${CAMPOS_CLIENTE}`,
        [req.usuario.obrador_id, d.nombre, d.cif ?? null, d.contacto ?? null, d.direccion ?? null]
      )).rows[0]);
      res.status(201).json({ cliente });
    } catch (e) {
      if (e.code === "23505") return res.status(409).json({ error: "Ya hay un cliente con ese nombre." });
      throw e;
    }
  })
);
clientesRouter.patch(
  "/:id",
  requirePermiso("editar"),
  ruta(async (req, res) => {
    const d = validar(esquemaCliente.partial(), req.body, res);
    if (!d) return;
    const campos = Object.keys(d).filter((k) => d[k] !== undefined);
    if (!campos.length) return res.status(400).json({ error: "No hay cambios." });
    try {
      const cliente = await db(req, async (c) => (await c.query(
        `UPDATE clientes SET ${campos.map((k, i) => `${k} = $${i + 2}`).join(", ")} WHERE id = $1 RETURNING ${CAMPOS_CLIENTE}`,
        [req.params.id, ...campos.map((k) => d[k])]
      )).rows[0]);
      if (!cliente) return res.status(404).json({ error: "Cliente no encontrado." });
      res.json({ cliente });
    } catch (e) {
      if (e.code === "23505") return res.status(409).json({ error: "Ya hay otro cliente con ese nombre." });
      throw e;
    }
  })
);
clientesRouter.delete(
  "/:id",
  requirePermiso("borrar"),
  ruta(async (req, res) => {
    try {
      const n = await db(req, async (c) => (await c.query("DELETE FROM clientes WHERE id = $1", [req.params.id])).rowCount);
      if (!n) return res.status(404).json({ error: "Cliente no encontrado." });
      res.status(204).end();
    } catch (e) {
      if (e.code === "23503") return res.status(409).json({ error: "Este cliente tiene salidas registradas: no se puede eliminar. Puedes darlo de baja." });
      throw e;
    }
  })
);

// ---------- Salidas (pedidos) ----------
export const SELECT_SALIDA = `
  SELECT s.id, s.fecha, s.num_pedido, s.cliente_id, cl.nombre AS cliente, s.observaciones, s.creado_en, s.modificado_en,
         uc.nombre AS creado_por_nombre, um.nombre AS modificado_por_nombre,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'id', l.id, 'producto_id', l.producto_id, 'producto', p.nombre, 'num_lote', l.num_lote,
                    'cantidad', l.cantidad, 'unidad', l.unidad,
                    'origen', CASE WHEN l.produccion_id IS NOT NULL THEN 'produccion' WHEN l.preparado_id IS NOT NULL THEN 'preparado' ELSE 'manual' END,
                    'lote_id', COALESCE(l.produccion_id, l.preparado_id))
                  ORDER BY l.orden)
             FROM salida_lineas l JOIN productos p ON p.id = l.producto_id
            WHERE l.salida_id = s.id), '[]') AS lineas
    FROM salidas s
    JOIN clientes cl ON cl.id = s.cliente_id
    LEFT JOIN usuarios uc ON uc.id = s.creado_por
    LEFT JOIN usuarios um ON um.id = s.modificado_por`;

export const esquemaFiltroSalidas = z.object({
  q: z.string().trim().max(80).optional(),
  desde: z.string().date().optional(),
  hasta: z.string().date().optional(),
  cliente_id: z.string().uuid().optional(),
  limite: z.coerce.number().int().min(1).max(5000).default(500),
});

/** Filtros: la lupa busca por producto, lote, cliente o nº de pedido. */
export function filtrosSalidas(f) {
  const cond = [];
  const params = [];
  if (f.q) {
    const i = params.push(`%${f.q}%`);
    cond.push(`(cl.nombre ILIKE $${i} OR s.num_pedido ILIKE $${i} OR EXISTS (
      SELECT 1 FROM salida_lineas l JOIN productos p ON p.id = l.producto_id
       WHERE l.salida_id = s.id AND (p.nombre ILIKE $${i} OR l.num_lote ILIKE $${i})))`);
  }
  if (f.desde) cond.push(`s.fecha >= $${params.push(f.desde)}`);
  if (f.hasta) cond.push(`s.fecha <= $${params.push(f.hasta)}`);
  if (f.cliente_id) cond.push(`s.cliente_id = $${params.push(f.cliente_id)}`);
  return { where: cond.length ? `WHERE ${cond.join(" AND ")}` : "", params };
}

salidasRouter.get(
  "/",
  ruta(async (req, res) => {
    const f = validar(esquemaFiltroSalidas, req.query, res);
    if (!f) return;
    const { where, params } = filtrosSalidas(f);
    const salidas = await db(req, async (c) => (await c.query(
      `${SELECT_SALIDA} ${where} ORDER BY s.fecha DESC, s.creado_en DESC LIMIT $${params.push(f.limite)}`, params
    )).rows);
    res.json({ salidas });
  })
);

// Nº de pedido propuesto: P-AAMMDD-n (el n se cuenta por día).
salidasRouter.get(
  "/siguiente-pedido",
  ruta(async (req, res) => {
    const f = validar(z.object({ fecha: z.string().date().optional() }), req.query, res);
    if (!f) return;
    const fecha = f.fecha || new Date().toISOString().slice(0, 10);
    const base = `P-${fecha.slice(2, 4)}${fecha.slice(5, 7)}${fecha.slice(8, 10)}`;
    const num = await db(req, async (c) => {
      const { rows } = await c.query("SELECT num_pedido FROM salidas WHERE num_pedido ILIKE $1", [`${base}-%`]);
      const usados = new Set(rows.map((r) => r.num_pedido.toUpperCase()));
      let n = 1;
      while (usados.has(`${base}-${n}`)) n += 1;
      return `${base}-${n}`;
    });
    res.json({ num_pedido: num });
  })
);

// Los tres últimos lotes de cada producto elaborado (final e interno), para elegir en las líneas.
salidasRouter.get(
  "/ultimos-lotes",
  ruta(async (req, res) => {
    const lotes = await db(req, async (c) => (await c.query(
      `SELECT origen, id, producto_id, num_lote, fecha, caducidad, unidad, cantidad, unidades, unidades_tipo FROM (
         SELECT 'produccion' AS origen, pp.id, pp.producto_id, pp.num_lote, pp.fecha, pp.caducidad, pp.unidad, pp.cantidad,
                pp.unidades, pp.unidades_tipo,
                row_number() OVER (PARTITION BY pp.producto_id ORDER BY pp.fecha DESC, pp.creado_en DESC) AS n
           FROM producciones pp WHERE pp.activo
         UNION ALL
         SELECT 'preparado', pi.id, pi.producto_id, pi.num_lote, pi.fecha, pi.caducidad, pi.unidad, pi.cantidad,
                pi.unidades, pi.unidades_tipo,
                row_number() OVER (PARTITION BY pi.producto_id ORDER BY pi.fecha DESC, pi.creado_en DESC)
           FROM preparados pi WHERE pi.activo
       ) t WHERE n <= 3 ORDER BY producto_id, fecha DESC, n`
    )).rows);
    res.json({ lotes });
  })
);

salidasRouter.get(
  "/:id",
  ruta(async (req, res) => {
    const salida = await db(req, async (c) => (await c.query(`${SELECT_SALIDA} WHERE s.id = $1`, [req.params.id])).rows[0]);
    if (!salida) return res.status(404).json({ error: "Salida no encontrada." });
    res.json({ salida });
  })
);

const esquemaLinea = z.object({
  producto_id: z.string().uuid("Elige el producto de cada línea."),
  origen: z.enum(["produccion", "preparado", "manual"]).default("manual"),
  lote_id: z.string().uuid().nullable().optional(),
  num_lote: z.string().trim().max(80).default(""),
  cantidad: z.number({ invalid_type_error: "Indica la cantidad de cada línea." }).positive("La cantidad de cada línea debe ser mayor que 0."),
  unidad: z.string().trim().max(40).default(""),
});
const esquemaSalida = z.object({
  fecha: z.string().date("La fecha no es válida."),
  num_pedido: z.string().trim().min(1, "Indica el nº de pedido.").max(60),
  cliente_id: z.string().uuid("Elige el cliente."),
  observaciones: z.string().max(2000).default(""),
  lineas: z.array(esquemaLinea).min(1, "Añade al menos un producto.").max(200),
});

/** Guarda las líneas; si eligen un lote, el producto y el nº de lote salen del lote. */
async function guardarLineas(c, obradorId, salidaId, lineas) {
  await c.query("DELETE FROM salida_lineas WHERE salida_id = $1", [salidaId]);
  for (const [i, l] of lineas.entries()) {
    let { producto_id: productoId, num_lote: numLote } = l;
    let produccionId = null;
    let preparadoId = null;
    if (l.origen !== "manual") {
      if (!l.lote_id) throw fallo("Falta el lote de una línea.", 400);
      const tabla = l.origen === "produccion" ? "producciones" : "preparados";
      const { rows: [lote] } = await c.query(`SELECT producto_id, num_lote FROM ${tabla} WHERE id = $1`, [l.lote_id]);
      if (!lote) throw fallo("Uno de los lotes elegidos no existe.", 400);
      productoId = lote.producto_id;
      numLote = lote.num_lote;
      if (l.origen === "produccion") produccionId = l.lote_id; else preparadoId = l.lote_id;
    }
    await c.query(
      `INSERT INTO salida_lineas (obrador_id, salida_id, producto_id, produccion_id, preparado_id, num_lote, cantidad, unidad, orden)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [obradorId, salidaId, productoId, produccionId, preparadoId, numLote, l.cantidad, l.unidad, i]
    );
  }
}

const errorSalida = (res, e) => {
  if (e.status) return res.status(e.status).json({ error: e.message });
  if (e.code === "23505") return res.status(409).json({ error: "Ya existe un pedido con ese número.", campo: "num_pedido" });
  if (e.code === "23503") return res.status(400).json({ error: "El cliente o alguno de los productos no existe." });
  throw e;
};

salidasRouter.post(
  "/",
  requirePermiso("registrar"),
  ruta(async (req, res) => {
    const d = validar(esquemaSalida, req.body, res);
    if (!d) return;
    try {
      const salida = await db(req, async (c) => {
        const { rows: [{ id }] } = await c.query(
          `INSERT INTO salidas (obrador_id, fecha, num_pedido, cliente_id, observaciones, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [req.usuario.obrador_id, d.fecha, d.num_pedido, d.cliente_id, d.observaciones, req.usuario.id]
        );
        await guardarLineas(c, req.usuario.obrador_id, id, d.lineas);
        return (await c.query(`${SELECT_SALIDA} WHERE s.id = $1`, [id])).rows[0];
      });
      res.status(201).json({ salida });
    } catch (e) { return errorSalida(res, e); }
  })
);

salidasRouter.patch(
  "/:id",
  requirePermiso("editar"),
  ruta(async (req, res) => {
    const d = validar(esquemaSalida.partial(), req.body, res);
    if (!d) return;
    try {
      const salida = await db(req, async (c) => {
        const { rows: [actual] } = await c.query("SELECT id FROM salidas WHERE id = $1 FOR UPDATE", [req.params.id]);
        if (!actual) throw fallo("Salida no encontrada.", 404);
        const { lineas, ...campos } = d;
        const claves = Object.keys(campos).filter((k) => campos[k] !== undefined);
        const sets = [...claves.map((k, i) => `${k} = $${i + 2}`), `modificado_por = $${claves.length + 2}`, "modificado_en = now()"];
        await c.query(`UPDATE salidas SET ${sets.join(", ")} WHERE id = $1`, [req.params.id, ...claves.map((k) => campos[k]), req.usuario.id]);
        if (lineas) await guardarLineas(c, req.usuario.obrador_id, req.params.id, lineas);
        return (await c.query(`${SELECT_SALIDA} WHERE s.id = $1`, [req.params.id])).rows[0];
      });
      res.json({ salida });
    } catch (e) { return errorSalida(res, e); }
  })
);

salidasRouter.delete(
  "/:id",
  requirePermiso("borrar"),
  ruta(async (req, res) => {
    const n = await db(req, async (c) => (await c.query("DELETE FROM salidas WHERE id = $1", [req.params.id])).rowCount);
    if (!n) return res.status(404).json({ error: "Salida no encontrada." });
    res.status(204).end();
  })
);
