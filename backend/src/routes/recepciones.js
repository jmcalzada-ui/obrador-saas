import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermiso, db } from "../auth/middleware.js";
import { ruta, validar } from "../lib/utiles.js";

export const recepcionesRouter = Router();
recepcionesRouter.use(requireAuth);

const SELECT = `
  SELECT r.id, r.fecha, r.producto_id, p.nombre AS producto, r.marca_id, m.nombre AS marca,
         r.proveedor_id, pr.nombre AS proveedor, r.num_lote, r.caducidad, r.factura, r.temp_entrada,
         r.estado_entrada, r.cantidad, r.unidad, r.bultos, r.precio_total,
         r.control_envase, r.control_etiquetado, r.control_transporte,
         CASE WHEN r.cantidad > 0 AND r.precio_total IS NOT NULL THEN round(r.precio_total / r.cantidad, 4) END AS precio_unidad,
         s.disponible, r.observaciones, r.activo, r.creado_en, r.modificado_en,
         uc.nombre AS creado_por_nombre, um.nombre AS modificado_por_nombre
    FROM recepciones r
    JOIN productos p ON p.id = r.producto_id
    LEFT JOIN marcas m ON m.id = r.marca_id
    LEFT JOIN proveedores pr ON pr.id = r.proveedor_id
    LEFT JOIN usuarios uc ON uc.id = r.creado_por
    LEFT JOIN usuarios um ON um.id = r.modificado_por
    JOIN stock_lotes s ON s.origen = 'recepcion' AND s.id = r.id`;

const esquemaFiltro = z.object({
  desde: z.string().date().optional(),
  hasta: z.string().date().optional(),
  q: z.string().trim().max(80).optional(),
  con_stock: z.enum(["1", "0"]).optional(),
  limite: z.coerce.number().int().min(1).max(500).default(100),
});

recepcionesRouter.get(
  "/",
  ruta(async (req, res) => {
    const f = validar(esquemaFiltro, req.query, res);
    if (!f) return;
    const cond = [];
    const params = [];
    if (f.desde) cond.push(`r.fecha >= $${params.push(f.desde)}`);
    if (f.hasta) cond.push(`r.fecha <= $${params.push(f.hasta)}`);
    if (f.q) cond.push(`(p.nombre ILIKE $${params.push(`%${f.q}%`)} OR r.num_lote ILIKE $${params.length} OR pr.nombre ILIKE $${params.length})`);
    if (f.con_stock === "1") cond.push("s.disponible > 0 AND r.activo");
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    const recepciones = await db(req, async (c) => {
      const { rows } = await c.query(`${SELECT} ${where} ORDER BY r.fecha DESC, r.creado_en DESC LIMIT $${params.push(f.limite)}`, params);
      return rows;
    });
    res.json({ recepciones });
  })
);

recepcionesRouter.get(
  "/:id",
  ruta(async (req, res) => {
    const datos = await db(req, async (c) => {
      const { rows: [recepcion] } = await c.query(`${SELECT} WHERE r.id = $1`, [req.params.id]);
      if (!recepcion) return null;
      // Trazabilidad hacia delante: dónde se ha usado este lote.
      const { rows: usos } = await c.query(
        `SELECT c.cantidad, c.unidad, c.fase,
                COALESCE(pp.num_lote, pd.num_lote) AS lote_destino,
                CASE WHEN c.preparado_id IS NOT NULL THEN 'preparado' ELSE 'produccion' END AS destino_tipo,
                COALESCE(c.preparado_id, c.produccion_id) AS destino_id,
                COALESCE(pp.fecha, pd.fecha) AS fecha
           FROM consumos c
           LEFT JOIN preparados pp ON pp.id = c.preparado_id
           LEFT JOIN producciones pd ON pd.id = c.produccion_id
          WHERE c.origen_recepcion = $1 ORDER BY fecha DESC`,
        [req.params.id]
      );
      return { recepcion, usos };
    });
    if (!datos) return res.status(404).json({ error: "Recepción no encontrada." });
    res.json(datos);
  })
);

const esquemaRecepcion = z.object({
  fecha: z.string().date("La fecha no es válida."),
  producto_id: z.string().uuid("Elige un producto."),
  marca_id: z.string().uuid().nullable().optional(),
  proveedor_id: z.string().uuid().nullable().optional(),
  num_lote: z.string().trim().max(80).default(""),
  caducidad: z.string().date().nullable().optional(),
  factura: z.string().trim().max(80).default(""),
  temp_entrada: z.number().min(-40).max(99).nullable().optional(),
  estado_entrada: z.enum(["conforme", "no_conforme", "conforme_con_incidencia"]).default("conforme"),
  cantidad: z.number({ invalid_type_error: "Indica la cantidad." }).positive("La cantidad debe ser mayor que 0."),
  bultos: z.number().int().positive().nullable().optional(),
  // Precio: total sin impuestos o por unidad de medida (se guarda el total).
  precio_total: z.number().min(0).nullable().optional(),
  precio_unidad: z.number().min(0).nullable().optional(),
  control_envase: z.boolean().nullable().optional(),
  control_etiquetado: z.boolean().nullable().optional(),
  control_transporte: z.boolean().nullable().optional(),
  observaciones: z.string().max(2000).default(""),
});

recepcionesRouter.post(
  "/",
  requirePermiso("registrar"),
  ruta(async (req, res) => {
    const d = validar(esquemaRecepcion, req.body, res);
    if (!d) return;
    const recepcion = await db(req, async (c) => {
      // La unidad la fija el producto.
      const { rows: [p] } = await c.query("SELECT unidad_medida FROM productos WHERE id = $1", [d.producto_id]);
      if (!p) return null;
      const precioTotal = d.precio_total ?? (d.precio_unidad != null ? Math.round(d.precio_unidad * d.cantidad * 100) / 100 : null);
      const { rows: [{ id }] } = await c.query(
        `INSERT INTO recepciones (obrador_id, fecha, producto_id, marca_id, proveedor_id, num_lote, caducidad, factura,
                                  temp_entrada, estado_entrada, cantidad, unidad, bultos, precio_total, observaciones,
                                  control_envase, control_etiquetado, control_transporte, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
        [req.usuario.obrador_id, d.fecha, d.producto_id, d.marca_id ?? null, d.proveedor_id ?? null, d.num_lote,
         d.caducidad ?? null, d.factura, d.temp_entrada ?? null, d.estado_entrada, d.cantidad, p.unidad_medida,
         d.bultos ?? null, precioTotal, d.observaciones, d.control_envase ?? null, d.control_etiquetado ?? null,
         d.control_transporte ?? null, req.usuario.id]
      );
      return (await c.query(`${SELECT} WHERE r.id = $1`, [id])).rows[0];
    });
    if (!recepcion) return res.status(400).json({ error: "Elige un producto del catálogo." });
    res.status(201).json({ recepcion });
  })
);

// Editar lo ya guardado: jefe de producción y gestor (el operario no).
recepcionesRouter.patch(
  "/:id",
  requirePermiso("editar"),
  ruta(async (req, res) => {
    const d = validar(esquemaRecepcion.partial().omit({ producto_id: true }).extend({ activo: z.boolean().optional() }), req.body, res);
    if (!d) return;
    if (d.precio_unidad != null && d.precio_total == null && d.cantidad != null) d.precio_total = Math.round(d.precio_unidad * d.cantidad * 100) / 100;
    delete d.precio_unidad;
    const campos = Object.keys(d).filter((k) => d[k] !== undefined);
    if (!campos.length) return res.status(400).json({ error: "No hay cambios." });
    const r = await db(req, async (c) => {
      if (d.cantidad !== undefined) {
        // No se puede bajar la cantidad por debajo de lo ya consumido.
        const { rows: [s] } = await c.query("SELECT cantidad - disponible AS usado FROM stock_lotes WHERE origen = 'recepcion' AND id = $1", [req.params.id]);
        if (s && d.cantidad < s.usado) return { error: `Ya se han usado ${s.usado} de este lote; la cantidad no puede ser menor.` };
      }
      const sets = [...campos.map((k, i) => `${k} = $${i + 2}`), `modificado_por = $${campos.length + 2}`, "modificado_en = now()"].join(", ");
      const { rowCount } = await c.query(`UPDATE recepciones SET ${sets} WHERE id = $1`, [
        req.params.id, ...campos.map((k) => d[k]), req.usuario.id,
      ]);
      if (!rowCount) return null;
      return { recepcion: (await c.query(`${SELECT} WHERE r.id = $1`, [req.params.id])).rows[0] };
    });
    if (!r) return res.status(404).json({ error: "Recepción no encontrada." });
    if (r.error) return res.status(409).json({ error: r.error });
    res.json(r);
  })
);

recepcionesRouter.delete(
  "/:id",
  requirePermiso("borrar"),
  ruta(async (req, res) => {
    const n = await db(req, async (c) => (await c.query("DELETE FROM recepciones WHERE id = $1", [req.params.id])).rowCount);
    if (!n) return res.status(404).json({ error: "Recepción no encontrada." });
    res.status(204).end();
  })
);
