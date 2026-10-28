// Productos (nombre general), marcas (marca particular, con ficha técnica
// en PDF y precio de referencia) y proveedores.
import express, { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermiso, db } from "../auth/middleware.js";
import { ruta, validar } from "../lib/utiles.js";

export const catalogoRouter = Router();
catalogoRouter.use(requireAuth);

export const UNIDADES = ["kg", "g", "l", "ml", "ud"];
export const ALERGENOS = [
  "gluten", "crustaceos", "huevo", "pescado", "cacahuetes", "soja", "leche",
  "frutos_cascara", "apio", "mostaza", "sesamo", "sulfitos", "altramuces", "moluscos",
];
const TAM_MAX_FICHA = 6 * 1024 * 1024;

// Lista de productos con sus marcas, el último precio pagado y si la marca tiene ficha.
catalogoRouter.get(
  "/productos",
  ruta(async (req, res) => {
    const f = validar(z.object({ tipo: z.enum(["materia_prima", "preparado", "elaborado"]).optional() }), req.query, res);
    if (!f) return;
    const productos = await db(req, async (c) => {
      const { rows } = await c.query(
        `SELECT p.id, p.nombre, p.tipo, p.unidad_medida, p.alergenos, p.categoria, p.conservacion, p.activo,
                p.proceso_termico, p.coccion_temp_min, p.abatimiento_temp_max, p.abatimiento_minutos_max,
                p.vida_util_dias, p.ingredientes_habituales, p.creado_en,
                (SELECT round(r.precio_total / r.cantidad, 4) FROM recepciones r
                  WHERE r.producto_id = p.id AND r.precio_total IS NOT NULL ORDER BY r.fecha DESC, r.creado_en DESC LIMIT 1) AS ultimo_precio,
                COALESCE((
                  SELECT json_agg(json_build_object(
                           'id', m.id, 'nombre', m.nombre, 'unidad', m.unidad, 'alergenos', m.alergenos, 'trazas', m.trazas,
                           'composicion', m.composicion, 'activo', m.activo, 'formato', m.formato,
                           'proveedor_id', m.proveedor_id, 'proveedor', pr.nombre,
                           'precio_referencia', m.precio_referencia, 'precio_ref_fecha', m.precio_ref_fecha,
                           'tiene_ficha', m.ficha_id IS NOT NULL, 'ficha_nombre', a.nombre,
                           'ultimo_precio', (SELECT round(r.precio_total / r.cantidad, 4) FROM recepciones r
                                              WHERE r.marca_id = m.id AND r.precio_total IS NOT NULL
                                              ORDER BY r.fecha DESC, r.creado_en DESC LIMIT 1))
                         ORDER BY lower(m.nombre))
                    FROM marcas m
                    LEFT JOIN proveedores pr ON pr.id = m.proveedor_id
                    LEFT JOIN archivos a ON a.id = m.ficha_id
                   WHERE m.producto_id = p.id), '[]') AS marcas,
                -- Proveedores que han traído este producto (para poder corregir su nombre desde la ficha).
                COALESCE((
                  SELECT json_agg(json_build_object('id', pr.id, 'nombre', pr.nombre) ORDER BY lower(pr.nombre))
                    FROM proveedores pr
                   WHERE pr.id IN (SELECT r.proveedor_id FROM recepciones r WHERE r.producto_id = p.id)), '[]') AS proveedores
           FROM productos p
          ${f.tipo ? "WHERE p.tipo = $1" : ""}
          ORDER BY lower(p.nombre)`,
        f.tipo ? [f.tipo] : []
      );
      return rows;
    });
    res.json({ productos });
  })
);

const esquemaProducto = z.object({
  nombre: z.string().trim().min(1, "Escribe el nombre del producto.").max(120),
  tipo: z.enum(["materia_prima", "preparado", "elaborado"]).default("materia_prima"),
  unidad_medida: z.enum(UNIDADES).default("kg"),
  alergenos: z.array(z.enum(ALERGENOS)).default([]),
  trazas: z.array(z.enum(ALERGENOS)).default([]),
  categoria: z.string().trim().max(60).nullable().optional(),
  conservacion: z.enum(["ambiente", "refrigerado", "congelado"]).nullable().optional(),
  proceso_termico: z.boolean().nullable().optional(),
  coccion_temp_min: z.number().min(0).max(300).nullable().optional(),
  abatimiento_temp_max: z.number().min(-40).max(60).nullable().optional(),
  abatimiento_minutos_max: z.number().int().min(1).max(1440).nullable().optional(),
  vida_util_dias: z.number().int().min(1).max(3650).nullable().optional(),
});

// Objetivos por defecto de un preparado con proceso térmico (el gestor puede ajustarlos):
// cocción ≥ 75 °C en el centro y abatimiento hasta ≤ 10 °C en menos de 2 horas.
export const OBJETIVOS_TERMICOS = { coccion_temp_min: 75, abatimiento_temp_max: 10, abatimiento_minutos_max: 120 };

export async function insertarProducto(c, obradorId, d) {
  // Producción interna (preparado) y final (elaborado) pueden llevar proceso térmico.
  const elaborado = d.tipo === "preparado" || d.tipo === "elaborado";
  const termico = elaborado && d.proceso_termico === true;
  const { rows } = await c.query(
    `INSERT INTO productos (obrador_id, nombre, tipo, unidad_medida, alergenos, categoria, conservacion, proceso_termico,
                            coccion_temp_min, abatimiento_temp_max, abatimiento_minutos_max, vida_util_dias, trazas)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [obradorId, d.nombre, d.tipo, d.unidad_medida, d.alergenos ?? [], d.categoria ?? null, d.conservacion ?? null,
     elaborado ? Boolean(d.proceso_termico) : null,
     termico ? d.coccion_temp_min ?? OBJETIVOS_TERMICOS.coccion_temp_min : null,
     termico ? d.abatimiento_temp_max ?? OBJETIVOS_TERMICOS.abatimiento_temp_max : null,
     termico ? d.abatimiento_minutos_max ?? OBJETIVOS_TERMICOS.abatimiento_minutos_max : null,
     d.vida_util_dias ?? null, d.trazas ?? []]
  );
  return { ...rows[0], marcas: [] };
}

// Dar de alta productos: el gestor siempre; quien registra también puede
// crear un ingrediente o un preparado nuevo al vuelo mientras registra.
catalogoRouter.post(
  "/productos",
  requirePermiso("registrar"),
  ruta(async (req, res) => {
    const d = validar(esquemaProducto, req.body, res);
    if (!d) return;
    if (d.tipo === "elaborado" && req.usuario.rol !== "gestor") {
      return res.status(403).json({ error: "Solo el gestor puede crear productos elaborados." });
    }
    const producto = await db(req, (c) => insertarProducto(c, req.usuario.obrador_id, d));
    res.status(201).json({ producto });
  })
);

catalogoRouter.patch(
  "/productos/:id",
  requirePermiso("catalogo"),
  ruta(async (req, res) => {
    const d = validar(esquemaProducto.partial().extend({
      activo: z.boolean().optional(),
      // Cambiar la unidad cuando ya hay registros y no se puede convertir (p. ej. kg → ud): hay que confirmarlo.
      confirmar_unidad: z.boolean().optional(),
    }).omit({ tipo: true }), req.body, res);
    if (!d) return;
    const { confirmar_unidad, ...cambios } = d;
    const campos = Object.keys(cambios).filter((k) => cambios[k] !== undefined);
    if (!campos.length) return res.status(400).json({ error: "No hay cambios." });
    try {
      const r = await db(req, async (c) => {
        const { rows: [actual] } = await c.query("SELECT unidad_medida FROM productos WHERE id = $1 FOR UPDATE", [req.params.id]);
        if (!actual) return null;
        let conversion = null;
        if (cambios.unidad_medida && cambios.unidad_medida !== actual.unidad_medida) {
          const usado = (await c.query(
            `SELECT EXISTS (SELECT 1 FROM recepciones WHERE producto_id = $1) OR EXISTS (SELECT 1 FROM preparados WHERE producto_id = $1)
                 OR EXISTS (SELECT 1 FROM producciones WHERE producto_id = $1) OR EXISTS (SELECT 1 FROM consumos WHERE producto_id = $1) AS usado`,
            [req.params.id]
          )).rows[0].usado;
          if (usado) {
            const factor = FACTOR_UNIDAD[`${actual.unidad_medida}>${cambios.unidad_medida}`];
            if (!factor && !confirmar_unidad) {
              return { error: `Ya hay registros en ${actual.unidad_medida} y no se pueden pasar a ${cambios.unidad_medida} automáticamente. Si continúas, las cantidades guardadas se quedan con el mismo número y pasan a leerse en ${cambios.unidad_medida}.`, codigo: "unidad_sin_conversion" };
            }
            conversion = { factor: factor || 1, unidad: cambios.unidad_medida };
          }
        }
        const sets = campos.map((k, i) => `${k} = $${i + 2}`).join(", ");
        const { rows } = await c.query(`UPDATE productos SET ${sets} WHERE id = $1 RETURNING *`, [req.params.id, ...campos.map((k) => cambios[k])]);
        if (conversion) {
          // Se convierten todas las cantidades ya registradas (kg ↔ g, l ↔ ml); el importe total no cambia.
          const { factor, unidad } = conversion;
          for (const t of ["recepciones", "preparados", "producciones", "consumos"]) {
            await c.query(`UPDATE ${t} SET cantidad = round(cantidad * $2, 3), unidad = $3 WHERE producto_id = $1`, [req.params.id, factor, unidad]);
          }
          await c.query("UPDATE marcas SET precio_referencia = round(precio_referencia / $2, 4) WHERE producto_id = $1 AND precio_referencia IS NOT NULL", [req.params.id, factor]);
        }
        return { producto: rows[0] };
      });
      if (!r) return res.status(404).json({ error: "Producto no encontrado." });
      if (r.error) return res.status(409).json({ error: r.error, codigo: r.codigo });
      res.json(r);
    } catch (e) {
      if (e.code === "23505") return res.status(409).json({ error: "Ya hay otro producto con ese nombre." });
      throw e;
    }
  })
);

catalogoRouter.delete(
  "/productos/:id",
  requirePermiso("borrar"),
  ruta(async (req, res) => {
    const n = await db(req, async (c) => (await c.query("DELETE FROM productos WHERE id = $1", [req.params.id])).rowCount);
    if (!n) return res.status(404).json({ error: "Producto no encontrado." });
    res.status(204).end();
  })
);

// Conversión de cantidades al cambiar la unidad de un producto con registros.
const FACTOR_UNIDAD = { "kg>g": 1000, "g>kg": 0.001, "l>ml": 1000, "ml>l": 0.001 };

// ---------- Marcas ----------
const esquemaMarca = z.object({
  nombre: z.string().trim().min(1, "Escribe el nombre de la marca.").max(120),
  composicion: z.string().max(4000).default(""),
  alergenos: z.array(z.enum(ALERGENOS)).default([]),
  trazas: z.array(z.enum(ALERGENOS)).default([]),
  unidad: z.enum(UNIDADES).nullable().optional(),
  formato: z.string().trim().max(80).nullable().optional(),
  proveedor_id: z.string().uuid().nullable().optional(),
  precio_referencia: z.number().min(0).max(100000).nullable().optional(),
});

catalogoRouter.post(
  "/productos/:id/marcas",
  requirePermiso("registrar"),
  ruta(async (req, res) => {
    const d = validar(esquemaMarca, req.body, res);
    if (!d) return;
    const marca = await db(req, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO marcas (obrador_id, producto_id, nombre, composicion, alergenos, trazas, unidad, formato, proveedor_id,
                             precio_referencia, precio_ref_fecha)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, CASE WHEN $10::numeric IS NULL THEN NULL ELSE current_date END) RETURNING *`,
        [req.usuario.obrador_id, req.params.id, d.nombre, d.composicion, d.alergenos, d.trazas, d.unidad ?? null, d.formato ?? null,
         d.proveedor_id ?? null, d.precio_referencia ?? null]
      );
      return { ...rows[0], tiene_ficha: false };
    });
    res.status(201).json({ marca });
  })
);

catalogoRouter.patch(
  "/marcas/:id",
  requirePermiso("catalogo"),
  ruta(async (req, res) => {
    const d = validar(esquemaMarca.partial().extend({ activo: z.boolean().optional() }), req.body, res);
    if (!d) return;
    const campos = Object.keys(d).filter((k) => d[k] !== undefined);
    if (!campos.length) return res.status(400).json({ error: "No hay cambios." });
    const sets = campos.map((k, i) => `${k} = $${i + 2}`);
    if (campos.includes("precio_referencia")) sets.push("precio_ref_fecha = current_date");
    let marca;
    try {
      marca = await db(req, async (c) => {
        const { rows } = await c.query(`UPDATE marcas SET ${sets.join(", ")} WHERE id = $1 RETURNING *`, [req.params.id, ...campos.map((k) => d[k])]);
        return rows[0];
      });
    } catch (e) {
      if (e.code === "23505") return res.status(409).json({ error: "Este producto ya tiene otra marca con ese nombre." });
      throw e;
    }
    if (!marca) return res.status(404).json({ error: "Marca no encontrada." });
    res.json({ marca });
  })
);

catalogoRouter.delete(
  "/marcas/:id",
  requirePermiso("borrar"),
  ruta(async (req, res) => {
    const n = await db(req, async (c) => (await c.query("DELETE FROM marcas WHERE id = $1", [req.params.id])).rowCount);
    if (!n) return res.status(404).json({ error: "Marca no encontrada." });
    res.status(204).end();
  })
);

// Ficha técnica en PDF de cada marca (se envía en base64).
catalogoRouter.put(
  "/marcas/:id/ficha",
  express.json({ limit: "9mb" }),
  requirePermiso("registrar"),
  ruta(async (req, res) => {
    const d = validar(z.object({
      nombre: z.string().trim().min(1).max(160),
      mime_type: z.literal("application/pdf", { errorMap: () => ({ message: "La ficha técnica debe ser un PDF." }) }),
      base64: z.string().min(10),
    }), req.body, res);
    if (!d) return;
    const contenido = Buffer.from(d.base64, "base64");
    if (contenido.length > TAM_MAX_FICHA) return res.status(413).json({ error: "El PDF supera los 6 MB." });
    if (contenido.subarray(0, 4).toString() !== "%PDF") return res.status(400).json({ error: "El archivo no es un PDF válido." });
    const ok = await db(req, async (c) => {
      const { rows: [m] } = await c.query("SELECT ficha_id FROM marcas WHERE id = $1", [req.params.id]);
      if (!m) return false;
      const { rows: [a] } = await c.query(
        `INSERT INTO archivos (obrador_id, nombre, mime_type, tamano_bytes, contenido, subido_por)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [req.usuario.obrador_id, d.nombre, d.mime_type, contenido.length, contenido, req.usuario.id]
      );
      await c.query("UPDATE marcas SET ficha_id = $2 WHERE id = $1", [req.params.id, a.id]);
      if (m.ficha_id) await c.query("DELETE FROM archivos WHERE id = $1", [m.ficha_id]);
      return true;
    });
    if (!ok) return res.status(404).json({ error: "Marca no encontrada." });
    res.json({ ok: true });
  })
);

catalogoRouter.get(
  "/marcas/:id/ficha",
  ruta(async (req, res) => {
    const a = await db(req, async (c) =>
      (await c.query("SELECT a.nombre, a.mime_type, a.contenido FROM marcas m JOIN archivos a ON a.id = m.ficha_id WHERE m.id = $1", [req.params.id])).rows[0]
    );
    if (!a) return res.status(404).json({ error: "Esta marca no tiene ficha técnica." });
    res.set("Content-Type", a.mime_type);
    res.set("Content-Disposition", `inline; filename="${encodeURIComponent(a.nombre)}"`);
    res.send(a.contenido);
  })
);

// ---------- Proveedores ----------
catalogoRouter.get(
  "/proveedores",
  ruta(async (req, res) => {
    const proveedores = await db(req, async (c) => (await c.query("SELECT id, nombre, cif, contacto, activo FROM proveedores ORDER BY lower(nombre)")).rows);
    res.json({ proveedores });
  })
);

catalogoRouter.post(
  "/proveedores",
  requirePermiso("registrar"),
  ruta(async (req, res) => {
    const d = validar(z.object({ nombre: z.string().trim().min(1, "Escribe el nombre del proveedor.").max(160) }), req.body, res);
    if (!d) return;
    const proveedor = await db(req, async (c) => {
      const { rows } = await c.query(
        "INSERT INTO proveedores (obrador_id, nombre) VALUES ($1, $2) RETURNING id, nombre, cif, contacto, activo",
        [req.usuario.obrador_id, d.nombre]
      );
      return rows[0];
    });
    res.status(201).json({ proveedor });
  })
);

catalogoRouter.patch(
  "/proveedores/:id",
  requirePermiso("catalogo"),
  ruta(async (req, res) => {
    const d = validar(z.object({
      nombre: z.string().trim().min(1, "Escribe el nombre del proveedor.").max(160).optional(),
      cif: z.string().trim().max(20).nullable().optional(),
      contacto: z.string().trim().max(240).nullable().optional(),
      activo: z.boolean().optional(),
    }), req.body, res);
    if (!d) return;
    const campos = Object.keys(d).filter((k) => d[k] !== undefined);
    if (!campos.length) return res.status(400).json({ error: "No hay cambios." });
    try {
      const proveedor = await db(req, async (c) => (await c.query(
        `UPDATE proveedores SET ${campos.map((k, i) => `${k} = $${i + 2}`).join(", ")} WHERE id = $1 RETURNING id, nombre, cif, contacto, activo`,
        [req.params.id, ...campos.map((k) => d[k])]
      )).rows[0]);
      if (!proveedor) return res.status(404).json({ error: "Proveedor no encontrado." });
      res.json({ proveedor });
    } catch (e) {
      if (e.code === "23505") return res.status(409).json({ error: "Ya hay otro proveedor con ese nombre." });
      throw e;
    }
  })
);

catalogoRouter.delete(
  "/proveedores/:id",
  requirePermiso("borrar"),
  ruta(async (req, res) => {
    try {
      const n = await db(req, async (c) => (await c.query("DELETE FROM proveedores WHERE id = $1", [req.params.id])).rowCount);
      if (!n) return res.status(404).json({ error: "Proveedor no encontrado." });
      res.status(204).end();
    } catch (e) {
      if (e.code === "23503") return res.status(409).json({ error: "Este proveedor tiene entradas registradas: no se puede eliminar. Puedes darlo de baja." });
      throw e;
    }
  })
);
