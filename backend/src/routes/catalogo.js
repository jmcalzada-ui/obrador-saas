import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermiso, db } from "../auth/middleware.js";
import { ruta, validar } from "../lib/utiles.js";

export const catalogoRouter = Router();
catalogoRouter.use(requireAuth);

const UNIDADES = ["kg", "g", "l", "ml", "ud"];
export const ALERGENOS = [
  "gluten", "crustaceos", "huevo", "pescado", "cacahuetes", "soja", "leche",
  "frutos_cascara", "apio", "mostaza", "sesamo", "sulfitos", "altramuces", "moluscos",
];

// Todos los roles leen el catálogo (lo necesitan para registrar).
catalogoRouter.get(
  "/productos",
  ruta(async (req, res) => {
    const productos = await db(req, async (c) => {
      const { rows } = await c.query(
        `SELECT p.id, p.nombre, p.tipo, p.unidad_medida, p.alergenos, p.activo,
                COALESCE(json_agg(json_build_object('id', m.id, 'nombre', m.nombre, 'unidad', m.unidad,
                         'alergenos', m.alergenos, 'composicion', m.composicion, 'activo', m.activo)
                         ORDER BY m.nombre) FILTER (WHERE m.id IS NOT NULL), '[]') AS marcas
           FROM productos p LEFT JOIN marcas m ON m.producto_id = p.id
          GROUP BY p.id ORDER BY lower(p.nombre)`
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
});

// Dar de alta productos: el gestor siempre; quien registra también puede
// crear una materia prima nueva al vuelo desde la recepción (como en la
// app actual), pero no preparados ni elaborados.
catalogoRouter.post(
  "/productos",
  requirePermiso("registrar"),
  ruta(async (req, res) => {
    const datos = validar(esquemaProducto, req.body, res);
    if (!datos) return;
    if (req.usuario.rol !== "gestor" && datos.tipo !== "materia_prima") {
      return res.status(403).json({ error: "Solo el gestor puede crear preparados y productos elaborados." });
    }
    const producto = await db(req, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO productos (obrador_id, nombre, tipo, unidad_medida, alergenos)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.usuario.obrador_id, datos.nombre, datos.tipo, datos.unidad_medida, datos.alergenos]
      );
      return { ...rows[0], marcas: [] };
    });
    res.status(201).json({ producto });
  })
);

catalogoRouter.patch(
  "/productos/:id",
  requirePermiso("catalogo"),
  ruta(async (req, res) => {
    const datos = validar(esquemaProducto.partial().extend({ activo: z.boolean().optional() }), req.body, res);
    if (!datos) return;
    const campos = Object.keys(datos).filter((k) => datos[k] !== undefined);
    if (!campos.length) return res.status(400).json({ error: "No hay cambios." });
    const sets = campos.map((k, i) => `${k} = $${i + 2}`).join(", ");
    const producto = await db(req, async (c) => {
      const { rows } = await c.query(`UPDATE productos SET ${sets} WHERE id = $1 RETURNING *`, [
        req.params.id,
        ...campos.map((k) => datos[k]),
      ]);
      return rows[0];
    });
    if (!producto) return res.status(404).json({ error: "Producto no encontrado." });
    res.json({ producto });
  })
);

catalogoRouter.delete(
  "/productos/:id",
  requirePermiso("catalogo"),
  ruta(async (req, res) => {
    const n = await db(req, async (c) => (await c.query("DELETE FROM productos WHERE id = $1", [req.params.id])).rowCount);
    if (!n) return res.status(404).json({ error: "Producto no encontrado." });
    res.status(204).end();
  })
);

const esquemaMarca = z.object({
  nombre: z.string().trim().min(1, "Escribe el nombre de la marca.").max(120),
  composicion: z.string().max(4000).default(""),
  alergenos: z.array(z.enum(ALERGENOS)).default([]),
  unidad: z.enum(UNIDADES).nullable().optional(),
});

catalogoRouter.post(
  "/productos/:id/marcas",
  requirePermiso("registrar"),
  ruta(async (req, res) => {
    const datos = validar(esquemaMarca, req.body, res);
    if (!datos) return;
    const marca = await db(req, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO marcas (obrador_id, producto_id, nombre, composicion, alergenos, unidad)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.usuario.obrador_id, req.params.id, datos.nombre, datos.composicion, datos.alergenos, datos.unidad ?? null]
      );
      return rows[0];
    });
    res.status(201).json({ marca });
  })
);

catalogoRouter.patch(
  "/marcas/:id",
  requirePermiso("catalogo"),
  ruta(async (req, res) => {
    const datos = validar(esquemaMarca.partial().extend({ activo: z.boolean().optional() }), req.body, res);
    if (!datos) return;
    const campos = Object.keys(datos).filter((k) => datos[k] !== undefined);
    if (!campos.length) return res.status(400).json({ error: "No hay cambios." });
    const sets = campos.map((k, i) => `${k} = $${i + 2}`).join(", ");
    const marca = await db(req, async (c) => {
      const { rows } = await c.query(`UPDATE marcas SET ${sets} WHERE id = $1 RETURNING *`, [
        req.params.id,
        ...campos.map((k) => datos[k]),
      ]);
      return rows[0];
    });
    if (!marca) return res.status(404).json({ error: "Marca no encontrada." });
    res.json({ marca });
  })
);

catalogoRouter.delete(
  "/marcas/:id",
  requirePermiso("catalogo"),
  ruta(async (req, res) => {
    const n = await db(req, async (c) => (await c.query("DELETE FROM marcas WHERE id = $1", [req.params.id])).rowCount);
    if (!n) return res.status(404).json({ error: "Marca no encontrada." });
    res.status(204).end();
  })
);

// Proveedores: lista y alta al vuelo desde la recepción.
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
    const datos = validar(z.object({ nombre: z.string().trim().min(1, "Escribe el nombre del proveedor.").max(160) }), req.body, res);
    if (!datos) return;
    const proveedor = await db(req, async (c) => {
      const { rows } = await c.query(
        "INSERT INTO proveedores (obrador_id, nombre) VALUES ($1, $2) RETURNING id, nombre, cif, contacto, activo",
        [req.usuario.obrador_id, datos.nombre]
      );
      return rows[0];
    });
    res.status(201).json({ proveedor });
  })
);
