// Preparados internos: elaboraciones propias que generan un lote con stock
// y se usan después como ingrediente. Cada preparado tiene un nombre
// guardado (producto de tipo "preparado"); si lleva proceso térmico, se
// registran cocción y abatimiento con sus objetivos de control.
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermiso, db } from "../auth/middleware.js";
import { ruta, validar } from "../lib/utiles.js";
import { insertarProducto, UNIDADES } from "./catalogo.js";

export const preparadosRouter = Router();
preparadosRouter.use(requireAuth);

/** Estado del control térmico de un lote frente a los objetivos de su preparado. */
export function evaluarTermico(p) {
  if (!p.proceso_termico) return { estado: "no_aplica" };
  const coccionOk = p.coccion_temp != null ? Number(p.coccion_temp) >= Number(p.coccion_temp_min) : null;
  let abatMinutos = null;
  let abatOk = null;
  if (p.abat_hora_inicio && p.abat_hora_fin && p.abat_temp_fin != null) {
    abatMinutos = Math.round((new Date(p.abat_hora_fin) - new Date(p.abat_hora_inicio)) / 60000);
    abatOk = Number(p.abat_temp_fin) <= Number(p.abatimiento_temp_max) && abatMinutos <= Number(p.abatimiento_minutos_max);
  }
  let estado = "ok";
  if (coccionOk === false || abatOk === false) estado = "fuera_de_rango";
  else if (coccionOk === null || abatOk === null) estado = "pendiente";
  return { estado, coccion_ok: coccionOk, abat_ok: abatOk, abat_minutos: abatMinutos };
}

const SELECT = `
  SELECT pp.id, pp.fecha, pp.producto_id, p.nombre AS producto, pp.num_lote, pp.responsable, pp.cantidad, pp.unidad,
         pp.caducidad, pp.observaciones, pp.activo, s.disponible,
         p.proceso_termico, p.coccion_temp_min, p.abatimiento_temp_max, p.abatimiento_minutos_max,
         pp.coccion_temp, pp.coccion_minutos, pp.abat_temp_inicio, pp.abat_hora_inicio, pp.abat_temp_fin, pp.abat_hora_fin,
         pp.medida_correctora, pp.creado_en, pp.modificado_en,
         uc.nombre AS creado_por_nombre, um.nombre AS modificado_por_nombre
    FROM preparados pp
    JOIN productos p ON p.id = pp.producto_id
    JOIN stock_lotes s ON s.origen = 'preparado' AND s.id = pp.id
    LEFT JOIN usuarios uc ON uc.id = pp.creado_por
    LEFT JOIN usuarios um ON um.id = pp.modificado_por`;

const conTermico = (r) => ({ ...r, control_termico: evaluarTermico(r) });

preparadosRouter.get(
  "/",
  ruta(async (req, res) => {
    const f = validar(z.object({
      q: z.string().trim().max(80).optional(),
      con_stock: z.enum(["1", "0"]).optional(),
      producto_id: z.string().uuid().optional(),
      limite: z.coerce.number().int().min(1).max(500).default(100),
    }), req.query, res);
    if (!f) return;
    const cond = [];
    const params = [];
    if (f.q) cond.push(`(p.nombre ILIKE $${params.push(`%${f.q}%`)} OR pp.num_lote ILIKE $${params.length})`);
    if (f.con_stock === "1") cond.push("s.disponible > 0 AND pp.activo");
    if (f.producto_id) cond.push(`pp.producto_id = $${params.push(f.producto_id)}`);
    const preparados = await db(req, async (c) =>
      (await c.query(`${SELECT} ${cond.length ? `WHERE ${cond.join(" AND ")}` : ""} ORDER BY pp.fecha DESC, pp.creado_en DESC LIMIT $${params.push(f.limite)}`, params)).rows
    );
    res.json({ preparados: preparados.map(conTermico) });
  })
);

// Propuesta de nº de lote: iniciales del preparado + fecha + contador del día.
preparadosRouter.get(
  "/siguiente-lote",
  ruta(async (req, res) => {
    const f = validar(z.object({ producto_id: z.string().uuid().optional(), nombre: z.string().max(120).optional(), fecha: z.string().date().optional() }), req.query, res);
    if (!f) return;
    const lote = await db(req, async (c) => {
      let nombre = f.nombre || "";
      if (f.producto_id) nombre = (await c.query("SELECT nombre FROM productos WHERE id = $1", [f.producto_id])).rows[0]?.nombre || nombre;
      const iniciales = nombre.normalize("NFD").replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 3) || "PR";
      const fecha = (f.fecha || new Date().toISOString().slice(0, 10)).replace(/-/g, "").slice(2);
      const base = `${iniciales}-${fecha}`;
      const { rows } = await c.query("SELECT num_lote FROM preparados WHERE num_lote LIKE $1", [`${base}%`]);
      const usados = new Set(rows.map((r) => r.num_lote));
      let n = 1;
      while (usados.has(`${base}-${n}`)) n++;
      return `${base}-${n}`;
    });
    res.json({ num_lote: lote });
  })
);

preparadosRouter.get(
  "/:id",
  ruta(async (req, res) => {
    const datos = await db(req, async (c) => {
      const { rows: [preparado] } = await c.query(`${SELECT} WHERE pp.id = $1`, [req.params.id]);
      if (!preparado) return null;
      // Trazabilidad hacia atrás: ingredientes y sus lotes de origen.
      const { rows: ingredientes } = await c.query(
        `SELECT c.id, c.producto_id, p.nombre AS producto, c.num_lote, c.cantidad, c.unidad,
                CASE WHEN c.origen_recepcion IS NOT NULL THEN 'recepcion' WHEN c.origen_preparado IS NOT NULL THEN 'preparado' ELSE 'manual' END AS origen,
                COALESCE(c.origen_recepcion, c.origen_preparado) AS lote_id,
                m.nombre AS marca, pr.nombre AS proveedor, r.caducidad
           FROM consumos c
           JOIN productos p ON p.id = c.producto_id
           LEFT JOIN recepciones r ON r.id = c.origen_recepcion
           LEFT JOIN marcas m ON m.id = r.marca_id
           LEFT JOIN proveedores pr ON pr.id = r.proveedor_id
          WHERE c.preparado_id = $1 ORDER BY p.nombre`,
        [req.params.id]
      );
      // Trazabilidad hacia delante: dónde se ha usado este lote.
      const { rows: usos } = await c.query(
        `SELECT c.cantidad, c.unidad, COALESCE(pp.num_lote, pd.num_lote) AS lote_destino,
                CASE WHEN c.preparado_id IS NOT NULL THEN 'preparado' ELSE 'produccion' END AS destino_tipo,
                COALESCE(c.preparado_id, c.produccion_id) AS destino_id, COALESCE(pp.fecha, pd.fecha) AS fecha,
                COALESCE(p1.nombre, p2.nombre) AS producto_destino
           FROM consumos c
           LEFT JOIN preparados pp ON pp.id = c.preparado_id LEFT JOIN productos p1 ON p1.id = pp.producto_id
           LEFT JOIN producciones pd ON pd.id = c.produccion_id LEFT JOIN productos p2 ON p2.id = pd.producto_id
          WHERE c.origen_preparado = $1 ORDER BY fecha DESC`,
        [req.params.id]
      );
      return { preparado: conTermico(preparado), ingredientes, usos };
    });
    if (!datos) return res.status(404).json({ error: "Preparado no encontrado." });
    res.json(datos);
  })
);

// ---------- Alta ----------
const num = (min, max) => z.number().min(min).max(max).nullable().optional();
const esquemaIngrediente = z.discriminatedUnion("origen", [
  z.object({ origen: z.enum(["recepcion", "preparado"]), lote_id: z.string().uuid(), cantidad: z.number().positive("Indica la cantidad usada de cada ingrediente.") }),
  z.object({ origen: z.literal("manual"), producto_id: z.string().uuid(), num_lote: z.string().trim().max(80).default(""), cantidad: z.number().positive("Indica la cantidad usada de cada ingrediente.") }),
]);
const camposTermicos = {
  coccion_temp: num(-50, 400),
  coccion_minutos: z.number().int().min(0).max(2880).nullable().optional(),
  abat_temp_inicio: num(-50, 400),
  abat_hora_inicio: z.string().datetime({ offset: true }).nullable().optional(),
  abat_temp_fin: num(-50, 400),
  abat_hora_fin: z.string().datetime({ offset: true }).nullable().optional(),
  medida_correctora: z.string().trim().max(1000).optional(),
};
const esquemaAlta = z.object({
  producto_id: z.string().uuid().optional(),
  nuevo: z.object({
    nombre: z.string().trim().min(1, "Escribe el nombre del preparado.").max(120),
    unidad_medida: z.enum(UNIDADES),
    proceso_termico: z.boolean({ required_error: "Indica si el preparado lleva proceso térmico." }),
    vida_util_dias: z.number().int().min(1).max(3650).nullable().optional(),
    conservacion: z.enum(["ambiente", "refrigerado", "congelado"]).nullable().optional(),
  }).optional(),
  fecha: z.string().date("La fecha no es válida."),
  num_lote: z.string().trim().min(1, "Indica el nº de lote.").max(80),
  cantidad: z.number({ invalid_type_error: "Indica la cantidad obtenida." }).positive("La cantidad obtenida debe ser mayor que 0."),
  caducidad: z.string().date().nullable().optional(),
  responsable: z.string().trim().max(80).default(""),
  observaciones: z.string().max(2000).default(""),
  ingredientes: z.array(esquemaIngrediente).min(1, "Añade al menos un ingrediente.").max(60),
  ...camposTermicos,
}).refine((d) => Boolean(d.producto_id) !== Boolean(d.nuevo), { message: "Elige un preparado guardado o crea uno nuevo." });

/**
 * Comprueba stock y guarda los consumos. Bloquea los lotes de origen
 * mientras dura la transacción: dos personas a la vez no pueden gastar
 * el mismo stock dos veces.
 */
async function guardarConsumos(c, obradorId, preparadoId, ingredientes) {
  const porLote = new Map();
  for (const i of ingredientes) if (i.origen !== "manual") porLote.set(i.lote_id, { origen: i.origen, cantidad: (porLote.get(i.lote_id)?.cantidad || 0) + i.cantidad });
  const faltas = [];
  const lotes = new Map();
  for (const [loteId, { origen, cantidad }] of porLote) {
    const tabla = origen === "recepcion" ? "recepciones" : "preparados";
    const { rows: [bloq] } = await c.query(`SELECT id FROM ${tabla} WHERE id = $1 FOR UPDATE`, [loteId]);
    if (!bloq) throw Object.assign(new Error("Uno de los lotes elegidos no existe."), { status: 400 });
    const { rows: [l] } = await c.query(
      `SELECT s.*, p.nombre AS producto FROM stock_lotes s JOIN productos p ON p.id = s.producto_id WHERE s.origen = $1 AND s.id = $2`,
      [origen, loteId]
    );
    if (loteId === preparadoId) throw Object.assign(new Error("Un preparado no puede usarse a sí mismo como ingrediente."), { status: 400 });
    if (cantidad > Number(l.disponible) + 1e-9) faltas.push(`${l.producto} (lote ${l.num_lote || "sin nº"}): pides ${cantidad} ${l.unidad} y quedan ${l.disponible}`);
    lotes.set(loteId, l);
  }
  if (faltas.length) {
    throw Object.assign(new Error(`No hay stock suficiente: ${faltas.join("; ")}.`), { status: 409, codigo: "sin_stock" });
  }
  const productos = new Set();
  for (const i of ingredientes) {
    if (i.origen === "manual") {
      const { rows: [p] } = await c.query("SELECT unidad_medida FROM productos WHERE id = $1", [i.producto_id]);
      if (!p) throw Object.assign(new Error("Uno de los ingredientes no está en el catálogo."), { status: 400 });
      await c.query(
        `INSERT INTO consumos (obrador_id, preparado_id, producto_id, num_lote, cantidad, unidad) VALUES ($1,$2,$3,$4,$5,$6)`,
        [obradorId, preparadoId, i.producto_id, i.num_lote, i.cantidad, p.unidad_medida]
      );
      productos.add(i.producto_id);
    } else {
      const l = lotes.get(i.lote_id);
      await c.query(
        `INSERT INTO consumos (obrador_id, preparado_id, origen_recepcion, origen_preparado, producto_id, num_lote, cantidad, unidad)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [obradorId, preparadoId, i.origen === "recepcion" ? i.lote_id : null, i.origen === "preparado" ? i.lote_id : null,
         l.producto_id, l.num_lote, i.cantidad, l.unidad]
      );
      productos.add(l.producto_id);
    }
  }
  return [...productos];
}

/** Si el control térmico está completo y fuera de rango, exige medida correctora. */
function exigirCorrectora(producto, d) {
  const t = evaluarTermico({ ...producto, ...d });
  if (t.estado === "fuera_de_rango" && !(d.medida_correctora || "").trim()) {
    throw Object.assign(new Error("El control térmico está fuera de rango: anota la medida correctora aplicada."), { status: 400, campo: "medida_correctora" });
  }
  if (producto.proceso_termico && d.coccion_temp == null) {
    throw Object.assign(new Error("Este preparado lleva proceso térmico: anota la temperatura de cocción."), { status: 400, campo: "coccion_temp" });
  }
}

const enviarError = (res, e) => res.status(e.status).json({ error: e.message, codigo: e.codigo, campo: e.campo });

preparadosRouter.post(
  "/",
  requirePermiso("registrar"),
  ruta(async (req, res) => {
    const d = validar(esquemaAlta, req.body, res);
    if (!d) return;
    try {
      const preparado = await db(req, async (c) => {
        let producto;
        if (d.nuevo) {
          producto = await insertarProducto(c, req.usuario.obrador_id, { ...d.nuevo, tipo: "preparado", alergenos: [] });
        } else {
          producto = (await c.query("SELECT * FROM productos WHERE id = $1 AND tipo = 'preparado'", [d.producto_id])).rows[0];
          if (!producto) throw Object.assign(new Error("Ese preparado no existe."), { status: 400 });
        }
        exigirCorrectora(producto, d);
        const caducidad = d.caducidad ?? (producto.vida_util_dias
          ? new Date(new Date(d.fecha).getTime() + producto.vida_util_dias * 86400000).toISOString().slice(0, 10) : null);
        const { rows: [{ id }] } = await c.query(
          `INSERT INTO preparados (obrador_id, fecha, producto_id, num_lote, responsable, cantidad, unidad, caducidad, observaciones,
                                   coccion_temp, coccion_minutos, abat_temp_inicio, abat_hora_inicio, abat_temp_fin, abat_hora_fin,
                                   medida_correctora, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
          [req.usuario.obrador_id, d.fecha, producto.id, d.num_lote, d.responsable || req.usuario.nombre, d.cantidad,
           producto.unidad_medida, caducidad, d.observaciones, d.coccion_temp ?? null, d.coccion_minutos ?? null,
           d.abat_temp_inicio ?? null, d.abat_hora_inicio ?? null, d.abat_temp_fin ?? null, d.abat_hora_fin ?? null,
           d.medida_correctora ?? "", req.usuario.id]
        );
        const usados = await guardarConsumos(c, req.usuario.obrador_id, id, d.ingredientes);
        // Para proponer los mismos ingredientes la próxima vez.
        await c.query("UPDATE productos SET ingredientes_habituales = $2 WHERE id = $1", [producto.id, JSON.stringify(usados.map((x) => ({ producto_id: x })))]);
        return (await c.query(`${SELECT} WHERE pp.id = $1`, [id])).rows[0];
      });
      res.status(201).json({ preparado: conTermico(preparado) });
    } catch (e) {
      if (e.status) return enviarError(res, e);
      if (e.code === "23505") return res.status(409).json({ error: "Ya existe un preparado con ese nº de lote.", campo: "num_lote" });
      throw e;
    }
  })
);

// Completar el abatimiento más tarde (quien registra puede rellenar lo que
// faltaba, pero no cambiar lo ya anotado).
preparadosRouter.post(
  "/:id/abatimiento",
  requirePermiso("registrar"),
  ruta(async (req, res) => {
    const d = validar(z.object({
      abat_temp_fin: z.number().min(-50).max(400),
      abat_hora_fin: z.string().datetime({ offset: true }),
      abat_temp_inicio: num(-50, 400),
      abat_hora_inicio: z.string().datetime({ offset: true }).nullable().optional(),
      medida_correctora: z.string().trim().max(1000).optional(),
    }), req.body, res);
    if (!d) return;
    try {
      const preparado = await db(req, async (c) => {
        const { rows: [actual] } = await c.query(`${SELECT} WHERE pp.id = $1 FOR UPDATE OF pp`, [req.params.id]);
        if (!actual) throw Object.assign(new Error("Preparado no encontrado."), { status: 404 });
        if (!actual.proceso_termico) throw Object.assign(new Error("Este preparado no lleva proceso térmico."), { status: 400 });
        if (actual.abat_hora_fin) throw Object.assign(new Error("El abatimiento ya está registrado."), { status: 409 });
        const nuevo = {
          ...actual,
          abat_temp_inicio: actual.abat_temp_inicio ?? d.abat_temp_inicio ?? null,
          abat_hora_inicio: actual.abat_hora_inicio ?? d.abat_hora_inicio ?? null,
          abat_temp_fin: d.abat_temp_fin, abat_hora_fin: d.abat_hora_fin,
          medida_correctora: actual.medida_correctora || d.medida_correctora || "",
        };
        if (!nuevo.abat_hora_inicio) throw Object.assign(new Error("Falta la hora de inicio del abatimiento."), { status: 400, campo: "abat_hora_inicio" });
        exigirCorrectora(actual, nuevo);
        await c.query(
          `UPDATE preparados SET abat_temp_inicio = $2, abat_hora_inicio = $3, abat_temp_fin = $4, abat_hora_fin = $5, medida_correctora = $6 WHERE id = $1`,
          [req.params.id, nuevo.abat_temp_inicio, nuevo.abat_hora_inicio, nuevo.abat_temp_fin, nuevo.abat_hora_fin, nuevo.medida_correctora]
        );
        return (await c.query(`${SELECT} WHERE pp.id = $1`, [req.params.id])).rows[0];
      });
      res.json({ preparado: conTermico(preparado) });
    } catch (e) {
      if (e.status) return enviarError(res, e);
      throw e;
    }
  })
);

// Editar lo ya guardado: jefe de producción y gestor.
preparadosRouter.patch(
  "/:id",
  requirePermiso("editar"),
  ruta(async (req, res) => {
    const d = validar(z.object({
      fecha: z.string().date().optional(),
      num_lote: z.string().trim().min(1).max(80).optional(),
      cantidad: z.number().positive().optional(),
      caducidad: z.string().date().nullable().optional(),
      responsable: z.string().trim().max(80).optional(),
      observaciones: z.string().max(2000).optional(),
      activo: z.boolean().optional(),
      ingredientes: z.array(esquemaIngrediente).min(1).max(60).optional(),
      ...camposTermicos,
    }), req.body, res);
    if (!d) return;
    try {
      const preparado = await db(req, async (c) => {
        const { rows: [actual] } = await c.query(`${SELECT} WHERE pp.id = $1 FOR UPDATE OF pp`, [req.params.id]);
        if (!actual) throw Object.assign(new Error("Preparado no encontrado."), { status: 404 });
        const { ingredientes, ...campos } = d;
        const claves = Object.keys(campos).filter((k) => campos[k] !== undefined);
        if (d.cantidad !== undefined) {
          const usado = Number(actual.cantidad) - Number(actual.disponible);
          if (d.cantidad < usado) throw Object.assign(new Error(`Ya se han usado ${usado} ${actual.unidad} de este lote; la cantidad no puede ser menor.`), { status: 409 });
        }
        if (actual.proceso_termico && claves.some((k) => k.startsWith("coccion") || k.startsWith("abat"))) exigirCorrectora(actual, { ...actual, ...campos });
        if (claves.length) {
          const sets = [...claves.map((k, i) => `${k} = $${i + 2}`), `modificado_por = $${claves.length + 2}`, "modificado_en = now()"];
          await c.query(`UPDATE preparados SET ${sets.join(", ")} WHERE id = $1`, [req.params.id, ...claves.map((k) => campos[k]), req.usuario.id]);
        }
        if (ingredientes) {
          // Se devuelve al stock lo consumido antes y se descuenta lo nuevo.
          await c.query("DELETE FROM consumos WHERE preparado_id = $1", [req.params.id]);
          await guardarConsumos(c, req.usuario.obrador_id, req.params.id, ingredientes);
          await c.query("UPDATE preparados SET modificado_por = $2, modificado_en = now() WHERE id = $1", [req.params.id, req.usuario.id]);
        }
        return (await c.query(`${SELECT} WHERE pp.id = $1`, [req.params.id])).rows[0];
      });
      res.json({ preparado: conTermico(preparado) });
    } catch (e) {
      if (e.status) return enviarError(res, e);
      if (e.code === "23505") return res.status(409).json({ error: "Ya existe un preparado con ese nº de lote.", campo: "num_lote" });
      throw e;
    }
  })
);

preparadosRouter.delete(
  "/:id",
  requirePermiso("borrar"),
  ruta(async (req, res) => {
    const n = await db(req, async (c) => (await c.query("DELETE FROM preparados WHERE id = $1", [req.params.id])).rowCount);
    if (!n) return res.status(404).json({ error: "Preparado no encontrado." });
    res.status(204).end();
  })
);

// Lotes disponibles para usar como ingrediente (recepciones y preparados con stock).
export const stockRouter = Router();
stockRouter.use(requireAuth);
stockRouter.get(
  "/lotes",
  ruta(async (req, res) => {
    const f = validar(z.object({ producto_id: z.string().uuid().optional() }), req.query, res);
    if (!f) return;
    const lotes = await db(req, async (c) =>
      (await c.query(
        `SELECT s.origen, s.id, s.producto_id, p.nombre AS producto, s.num_lote, s.fecha, s.caducidad, s.unidad, s.cantidad, s.disponible,
                m.nombre AS marca
           FROM stock_lotes s JOIN productos p ON p.id = s.producto_id
           LEFT JOIN recepciones r ON r.id = s.id AND s.origen = 'recepcion'
           LEFT JOIN marcas m ON m.id = r.marca_id
          WHERE s.activo AND s.disponible > 0 ${f.producto_id ? "AND s.producto_id = $1" : ""}
          ORDER BY p.nombre, s.caducidad NULLS LAST, s.fecha`,
        f.producto_id ? [f.producto_id] : []
      )).rows
    );
    res.json({ lotes });
  })
);

// Ajuste manual de stock de un lote (gestor), con motivo y sin perder el histórico.
stockRouter.post(
  "/ajustes",
  requirePermiso("stock"),
  ruta(async (req, res) => {
    const d = validar(z.object({
      origen: z.enum(["recepcion", "preparado"]),
      lote_id: z.string().uuid(),
      disponible_real: z.number().min(0),
      motivo: z.string().trim().min(2, "Indica el motivo del ajuste.").max(200),
      nota: z.string().trim().max(500).default(""),
    }), req.body, res);
    if (!d) return;
    const r = await db(req, async (c) => {
      const { rows: [l] } = await c.query("SELECT disponible FROM stock_lotes WHERE origen = $1 AND id = $2", [d.origen, d.lote_id]);
      if (!l) return null;
      const delta = Math.round((d.disponible_real - Number(l.disponible)) * 1000) / 1000;
      if (delta === 0) return { delta };
      await c.query(
        `INSERT INTO ajustes_stock (obrador_id, origen_recepcion, origen_preparado, delta, motivo, nota, usuario_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [req.usuario.obrador_id, d.origen === "recepcion" ? d.lote_id : null, d.origen === "preparado" ? d.lote_id : null, delta, d.motivo, d.nota, req.usuario.id]
      );
      return { delta };
    });
    if (!r) return res.status(404).json({ error: "Lote no encontrado." });
    res.json(r);
  })
);
