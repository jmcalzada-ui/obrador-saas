// Producción intermedia y producto final.
//
//  · Producción intermedia (tabla preparados, productos de tipo "preparado"):
//    lo que se elabora pero no se vende; genera un lote con stock que se
//    usa como ingrediente (un sofrito, una salsa, una crema pastelera…).
//  · Producto final (tabla producciones, productos de tipo "elaborado"):
//    lo que se vende; usa lotes de entradas y de producción intermedia.
//
// Las dos comparten casi todo (ingredientes con lote y stock, nombre
// guardado, proceso térmico opcional con cocción y abatimiento, caducidad),
// así que se construyen con la misma fábrica de rutas.
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermiso, db } from "../auth/middleware.js";
import { ruta, validar } from "../lib/utiles.js";
import { insertarProducto, UNIDADES } from "./catalogo.js";
import { config } from "../config.js";
import { generarDeclaracion } from "../lib/declaracion.js";

/** Estado del control térmico de un lote frente a los objetivos de su producto. */
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

const conTermico = (r) => ({ ...r, control_termico: evaluarTermico(r) });
const fallo = (msg, status, extra = {}) => Object.assign(new Error(msg), { status, ...extra });
const enviarError = (res, e) => res.status(e.status).json({ error: e.message, codigo: e.codigo, campo: e.campo });

const CONFIG = {
  intermedia: {
    clave: "intermedia",
    tabla: "preparados", tipo: "preparado", fk: "preparado_id", conStock: true, prefijo: "PI",
    plural: "preparados", singular: "preparado", nombre: "producción intermedia", articulo: "Esta producción intermedia",
  },
  final: {
    clave: "final",
    tabla: "producciones", tipo: "elaborado", fk: "produccion_id", conStock: false, prefijo: "PF",
    plural: "producciones", singular: "produccion", nombre: "producto final", articulo: "Este producto final",
  },
};

/** Columnas comunes de un lote elaborado, para listados, fichas e informes. */
export function selectElaboracion(cfg) {
  return `
  SELECT pp.id, pp.fecha, pp.producto_id, p.nombre AS producto, pp.num_lote, pp.responsable, pp.cantidad, pp.unidad,
         ${cfg.tabla === "producciones" ? "pp.unidades" : "NULL::int AS unidades"},
         pp.caducidad, pp.observaciones, pp.activo, ${cfg.conStock ? "s.disponible" : "NULL::numeric AS disponible"},
         p.proceso_termico, p.coccion_temp_min, p.abatimiento_temp_max, p.abatimiento_minutos_max,
         pp.coccion_temp, pp.coccion_minutos, pp.abat_temp_inicio, pp.abat_hora_inicio, pp.abat_temp_fin, pp.abat_hora_fin,
         pp.medida_correctora, pp.declaracion_ingredientes, pp.creado_en, pp.modificado_en,
         uc.nombre AS creado_por_nombre, um.nombre AS modificado_por_nombre
    FROM ${cfg.tabla} pp
    JOIN productos p ON p.id = pp.producto_id
    ${cfg.conStock ? "JOIN stock_lotes s ON s.origen = 'preparado' AND s.id = pp.id" : ""}
    LEFT JOIN usuarios uc ON uc.id = pp.creado_por
    LEFT JOIN usuarios um ON um.id = pp.modificado_por`;
}

/** Filtros comunes: producto (lo que empieza o contiene lo escrito), lote y fechas. */
export function filtrosElaboracion(f, cfg) {
  const cond = [];
  const params = [];
  if (f.q) cond.push(`(p.nombre ILIKE $${params.push(`%${f.q}%`)} OR pp.num_lote ILIKE $${params.length})`);
  if (f.desde) cond.push(`pp.fecha >= $${params.push(f.desde)}`);
  if (f.hasta) cond.push(`pp.fecha <= $${params.push(f.hasta)}`);
  if (f.con_stock === "1" && cfg.conStock) cond.push("s.disponible > 0 AND pp.activo");
  if (f.producto_id) cond.push(`pp.producto_id = $${params.push(f.producto_id)}`);
  return { where: cond.length ? `WHERE ${cond.join(" AND ")}` : "", params };
}

/** Ingredientes (trazabilidad hacia atrás) de un lote elaborado. */
export async function ingredientesDe(c, cfg, id) {
  const { rows } = await c.query(
    `SELECT c.id, c.producto_id, p.nombre AS producto, c.num_lote, c.cantidad, c.unidad,
            CASE WHEN c.origen_recepcion IS NOT NULL THEN 'recepcion' WHEN c.origen_preparado IS NOT NULL THEN 'preparado' ELSE 'manual' END AS origen,
            COALESCE(c.origen_recepcion, c.origen_preparado) AS lote_id,
            m.nombre AS marca, pr.nombre AS proveedor, COALESCE(r.caducidad, pi.caducidad) AS caducidad
       FROM consumos c
       JOIN productos p ON p.id = c.producto_id
       LEFT JOIN recepciones r ON r.id = c.origen_recepcion
       LEFT JOIN preparados pi ON pi.id = c.origen_preparado
       LEFT JOIN marcas m ON m.id = r.marca_id
       LEFT JOIN proveedores pr ON pr.id = r.proveedor_id
      WHERE c.${cfg.fk} = $1 ORDER BY p.nombre`,
    [id]
  );
  return rows;
}

export const esquemaFiltros = z.object({
  q: z.string().trim().max(80).optional(),
  desde: z.string().date().optional(),
  hasta: z.string().date().optional(),
  con_stock: z.enum(["1", "0"]).optional(),
  producto_id: z.string().uuid().optional(),
  limite: z.coerce.number().int().min(1).max(2000).default(200),
});

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

// Columnas que tienen los dos tipos de lote (para pasar un lote de uno a otro).
const COLUMNAS_LOTE = ["obrador_id", "fecha", "producto_id", "num_lote", "responsable", "cantidad", "unidad", "observaciones", "activo",
  "caducidad", "coccion_temp", "coccion_minutos", "abat_temp_inicio", "abat_hora_inicio", "abat_temp_fin", "abat_hora_fin",
  "medida_correctora", "declaracion_ingredientes", "creado_por", "creado_en"];

/**
 * Pasa un lote de producción interna a final o al revés, con sus
 * ingredientes. Una interna que ya se ha usado como ingrediente no puede
 * pasar a final (se rompería la trazabilidad).
 */
async function moverLote(c, id, de, a) {
  const { rows: [l] } = await c.query(`SELECT * FROM ${de.tabla} WHERE id = $1 FOR UPDATE`, [id]);
  if (!l) throw fallo("Lote no encontrado.", 404);
  if (de.clave === "intermedia") {
    const { rowCount } = await c.query("SELECT 1 FROM consumos WHERE origen_preparado = $1 LIMIT 1", [id]);
    if (rowCount) throw fallo("Este lote ya se ha usado como ingrediente en otra producción: no puede pasar a producción final.", 409);
  }
  const cols = [...COLUMNAS_LOTE, ...(a.tabla === "producciones" ? ["estado"] : [])];
  const valores = cols.map((k) => (k === "estado" ? "completada" : l[k]));
  await c.query(`INSERT INTO ${a.tabla} (id, ${cols.join(", ")}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")})`, [id, ...valores]);
  await c.query(`UPDATE consumos SET ${a.fk} = $1, ${de.fk} = NULL WHERE ${de.fk} = $1`, [id]);
  await c.query(`DELETE FROM ${de.tabla} WHERE id = $1`, [id]);
  await c.query("UPDATE productos SET tipo = $2 WHERE id = $1", [l.producto_id, a.tipo]);
}

function crearRouter(cfg) {
  const router = Router();
  router.use(requireAuth);
  const SELECT = selectElaboracion(cfg);

  router.get(
    "/",
    ruta(async (req, res) => {
      const f = validar(esquemaFiltros, req.query, res);
      if (!f) return;
      const { where, params } = filtrosElaboracion(f, cfg);
      const filas = await db(req, async (c) =>
        (await c.query(`${SELECT} ${where} ORDER BY pp.fecha DESC, pp.creado_en DESC LIMIT $${params.push(f.limite)}`, params)).rows
      );
      res.json({ [cfg.plural]: filas.map(conTermico) });
    })
  );

  // Propuesta de nº de lote: iniciales del producto + fecha + contador del día.
  router.get(
    "/siguiente-lote",
    ruta(async (req, res) => {
      const f = validar(z.object({ producto_id: z.string().uuid().optional(), nombre: z.string().max(120).optional(), fecha: z.string().date().optional() }), req.query, res);
      if (!f) return;
      const lote = await db(req, async (c) => {
        let nombre = f.nombre || "";
        if (f.producto_id) nombre = (await c.query("SELECT nombre FROM productos WHERE id = $1", [f.producto_id])).rows[0]?.nombre || nombre;
        const iniciales = nombre.normalize("NFD").replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 3) || cfg.prefijo;
        const fecha = (f.fecha || new Date().toISOString().slice(0, 10)).replace(/-/g, "").slice(2);
        const base = `${iniciales}-${fecha}`;
        // El nº de lote no se repite entre intermedia y final.
        const { rows } = await c.query(
          "SELECT num_lote FROM preparados WHERE num_lote LIKE $1 UNION SELECT num_lote FROM producciones WHERE num_lote LIKE $1",
          [`${base}%`]
        );
        const usados = new Set(rows.map((r) => r.num_lote));
        let n = 1;
        while (usados.has(`${base}-${n}`)) n++;
        return `${base}-${n}`;
      });
      res.json({ num_lote: lote });
    })
  );

  router.get(
    "/:id",
    ruta(async (req, res) => {
      const datos = await db(req, async (c) => {
        const { rows: [lote] } = await c.query(`${SELECT} WHERE pp.id = $1`, [req.params.id]);
        if (!lote) return null;
        const ingredientes = await ingredientesDe(c, cfg, req.params.id);
        let usos = [];
        if (cfg.conStock) {
          // Trazabilidad hacia delante: dónde se ha usado este lote.
          ({ rows: usos } = await c.query(
            `SELECT c.cantidad, c.unidad, COALESCE(pp.num_lote, pd.num_lote) AS lote_destino,
                    CASE WHEN c.preparado_id IS NOT NULL THEN 'preparado' ELSE 'produccion' END AS destino_tipo,
                    COALESCE(c.preparado_id, c.produccion_id) AS destino_id, COALESCE(pp.fecha, pd.fecha) AS fecha,
                    COALESCE(p1.nombre, p2.nombre) AS producto_destino
               FROM consumos c
               LEFT JOIN preparados pp ON pp.id = c.preparado_id LEFT JOIN productos p1 ON p1.id = pp.producto_id
               LEFT JOIN producciones pd ON pd.id = c.produccion_id LEFT JOIN productos p2 ON p2.id = pd.producto_id
              WHERE c.origen_preparado = $1 ORDER BY fecha DESC`,
            [req.params.id]
          ));
        }
        const auto = await generarDeclaracion(c, cfg.fk, req.params.id);
        return { [cfg.singular]: conTermico(lote), ingredientes, usos, declaracion: { auto: auto.texto, ajustada: lote.declaracion_ingredientes } };
      });
      if (!datos) return res.status(404).json({ error: "Lote no encontrado." });
      res.json(datos);
    })
  );

  const esquemaAlta = z.object({
    producto_id: z.string().uuid().optional(),
    nuevo: z.object({
      nombre: z.string().trim().min(1, "Escribe el nombre del producto.").max(120),
      unidad_medida: z.enum(UNIDADES),
      proceso_termico: z.boolean({ required_error: "Indica si lleva proceso térmico." }),
      vida_util_dias: z.number().int().min(1).max(3650).nullable().optional(),
      conservacion: z.enum(["ambiente", "refrigerado", "congelado"]).nullable().optional(),
    }).optional(),
    fecha: z.string().date("La fecha no es válida."),
    num_lote: z.string().trim().min(1, "Indica el nº de lote.").max(80),
    cantidad: z.number({ invalid_type_error: "Indica la cantidad obtenida." }).positive("La cantidad obtenida debe ser mayor que 0."),
    unidades: z.number().int().min(0).max(10000000).nullable().optional(),
    caducidad: z.string().date().nullable().optional(),
    responsable: z.string().trim().max(80).default(""),
    observaciones: z.string().max(2000).default(""),
    ingredientes: z.array(esquemaIngrediente).min(1, "Añade al menos un ingrediente.").max(60),
    ...camposTermicos,
  }).refine((d) => Boolean(d.producto_id) !== Boolean(d.nuevo), { message: "Elige un producto guardado o crea uno nuevo." });

  /**
   * Comprueba stock y guarda los consumos. Bloquea los lotes de origen
   * mientras dura la transacción: dos personas a la vez no pueden gastar
   * el mismo stock dos veces.
   */
  async function guardarConsumos(c, obradorId, loteId, ingredientes, dest = cfg) {
    const porLote = new Map();
    for (const i of ingredientes) if (i.origen !== "manual") porLote.set(i.lote_id, { origen: i.origen, cantidad: (porLote.get(i.lote_id)?.cantidad || 0) + i.cantidad });
    const faltas = [];
    const lotes = new Map();
    for (const [origenId, { origen, cantidad }] of porLote) {
      if (dest.conStock && origenId === loteId) throw fallo("Un lote no puede usarse a sí mismo como ingrediente.", 400);
      const tabla = origen === "recepcion" ? "recepciones" : "preparados";
      const { rows: [bloq] } = await c.query(`SELECT id FROM ${tabla} WHERE id = $1 FOR UPDATE`, [origenId]);
      if (!bloq) throw fallo("Uno de los lotes elegidos no existe.", 400);
      const { rows: [l] } = await c.query(
        "SELECT s.*, p.nombre AS producto FROM stock_lotes s JOIN productos p ON p.id = s.producto_id WHERE s.origen = $1 AND s.id = $2",
        [origen, origenId]
      );
      if (cantidad > Number(l.disponible) + 1e-9) faltas.push(`${l.producto} (lote ${l.num_lote || "sin nº"}): pides ${cantidad} ${l.unidad} y quedan ${l.disponible}`);
      lotes.set(origenId, l);
    }
    if (faltas.length && config.controlStock) throw fallo(`No hay stock suficiente: ${faltas.join("; ")}.`, 409, { codigo: "sin_stock" });
    const productos = new Set();
    for (const i of ingredientes) {
      if (i.origen === "manual") {
        const { rows: [p] } = await c.query("SELECT unidad_medida FROM productos WHERE id = $1", [i.producto_id]);
        if (!p) throw fallo("Uno de los ingredientes no está en el catálogo.", 400);
        await c.query(
          `INSERT INTO consumos (obrador_id, ${dest.fk}, producto_id, num_lote, cantidad, unidad) VALUES ($1,$2,$3,$4,$5,$6)`,
          [obradorId, loteId, i.producto_id, i.num_lote, i.cantidad, p.unidad_medida]
        );
        productos.add(i.producto_id);
      } else {
        const l = lotes.get(i.lote_id);
        await c.query(
          `INSERT INTO consumos (obrador_id, ${dest.fk}, origen_recepcion, origen_preparado, producto_id, num_lote, cantidad, unidad)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [obradorId, loteId, i.origen === "recepcion" ? i.lote_id : null, i.origen === "preparado" ? i.lote_id : null,
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
      throw fallo("El control térmico está fuera de rango: anota la medida correctora aplicada.", 400, { campo: "medida_correctora" });
    }
    if (producto.proceso_termico && d.coccion_temp == null) {
      throw fallo(`${cfg.articulo} lleva proceso térmico: anota la temperatura de cocción.`, 400, { campo: "coccion_temp" });
    }
  }

  async function loteRepetido(c, numLote, excluirId) {
    const { rowCount } = await c.query(
      "SELECT 1 FROM preparados WHERE num_lote = $1 AND id IS DISTINCT FROM $2 UNION ALL SELECT 1 FROM producciones WHERE num_lote = $1 AND id IS DISTINCT FROM $2",
      [numLote, excluirId ?? null]
    );
    if (rowCount) throw fallo("Ya existe un lote con ese número.", 409, { campo: "num_lote" });
  }

  router.post(
    "/",
    requirePermiso("registrar"),
    ruta(async (req, res) => {
      const d = validar(esquemaAlta, req.body, res);
      if (!d) return;
      try {
        const lote = await db(req, async (c) => {
          await loteRepetido(c, d.num_lote);
          let producto;
          if (d.nuevo) {
            producto = await insertarProducto(c, req.usuario.obrador_id, { ...d.nuevo, tipo: cfg.tipo, alergenos: [] });
          } else {
            producto = (await c.query("SELECT * FROM productos WHERE id = $1 AND tipo IN ('preparado', 'elaborado')", [d.producto_id])).rows[0];
            if (!producto) throw fallo("Ese producto no existe.", 400);
            // La casilla "producción interna" manda: el nombre guardado recuerda la última elección.
            if (producto.tipo !== cfg.tipo) await c.query("UPDATE productos SET tipo = $2 WHERE id = $1", [producto.id, cfg.tipo]);
          }
          exigirCorrectora(producto, d);
          const caducidad = d.caducidad ?? (producto.vida_util_dias
            ? new Date(new Date(d.fecha).getTime() + producto.vida_util_dias * 86400000).toISOString().slice(0, 10) : null);
          const extraCol = cfg.tabla === "producciones" ? ", unidades, estado" : "";
          const extraVal = cfg.tabla === "producciones" ? ", $18, 'completada'" : "";
          const valores = [req.usuario.obrador_id, d.fecha, producto.id, d.num_lote, d.responsable || req.usuario.nombre, d.cantidad,
            producto.unidad_medida, caducidad, d.observaciones, d.coccion_temp ?? null, d.coccion_minutos ?? null,
            d.abat_temp_inicio ?? null, d.abat_hora_inicio ?? null, d.abat_temp_fin ?? null, d.abat_hora_fin ?? null,
            d.medida_correctora ?? "", req.usuario.id];
          if (cfg.tabla === "producciones") valores.push(d.unidades ?? null);
          const { rows: [{ id }] } = await c.query(
            `INSERT INTO ${cfg.tabla} (obrador_id, fecha, producto_id, num_lote, responsable, cantidad, unidad, caducidad, observaciones,
                                       coccion_temp, coccion_minutos, abat_temp_inicio, abat_hora_inicio, abat_temp_fin, abat_hora_fin,
                                       medida_correctora, creado_por${extraCol})
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17${extraVal}) RETURNING id`,
            valores
          );
          const usados = await guardarConsumos(c, req.usuario.obrador_id, id, d.ingredientes);
          // Para proponer los mismos ingredientes la próxima vez.
          await c.query("UPDATE productos SET ingredientes_habituales = $2 WHERE id = $1", [producto.id, JSON.stringify(usados.map((x) => ({ producto_id: x })))]);
          return (await c.query(`${SELECT} WHERE pp.id = $1`, [id])).rows[0];
        });
        res.status(201).json({ [cfg.singular]: conTermico(lote) });
      } catch (e) {
        if (e.status) return enviarError(res, e);
        if (e.code === "23505") return res.status(409).json({ error: "Ya existe un lote con ese número.", campo: "num_lote" });
        throw e;
      }
    })
  );

  // Completar el abatimiento más tarde (quien registra puede rellenar lo que
  // faltaba, pero no cambiar lo ya anotado).
  router.post(
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
        const lote = await db(req, async (c) => {
          const { rows: [actual] } = await c.query(`${SELECT} WHERE pp.id = $1 FOR UPDATE OF pp`, [req.params.id]);
          if (!actual) throw fallo("Lote no encontrado.", 404);
          if (!actual.proceso_termico) throw fallo(`${cfg.articulo} no lleva proceso térmico.`, 400);
          if (actual.abat_hora_fin) throw fallo("El abatimiento ya está registrado.", 409);
          const nuevo = {
            ...actual,
            abat_temp_inicio: actual.abat_temp_inicio ?? d.abat_temp_inicio ?? null,
            abat_hora_inicio: actual.abat_hora_inicio ?? d.abat_hora_inicio ?? null,
            abat_temp_fin: d.abat_temp_fin, abat_hora_fin: d.abat_hora_fin,
            medida_correctora: actual.medida_correctora || d.medida_correctora || "",
          };
          if (!nuevo.abat_hora_inicio) throw fallo("Falta la hora de inicio del abatimiento.", 400, { campo: "abat_hora_inicio" });
          exigirCorrectora(actual, nuevo);
          await c.query(
            `UPDATE ${cfg.tabla} SET abat_temp_inicio = $2, abat_hora_inicio = $3, abat_temp_fin = $4, abat_hora_fin = $5, medida_correctora = $6 WHERE id = $1`,
            [req.params.id, nuevo.abat_temp_inicio, nuevo.abat_hora_inicio, nuevo.abat_temp_fin, nuevo.abat_hora_fin, nuevo.medida_correctora]
          );
          return (await c.query(`${SELECT} WHERE pp.id = $1`, [req.params.id])).rows[0];
        });
        res.json({ [cfg.singular]: conTermico(lote) });
      } catch (e) {
        if (e.status) return enviarError(res, e);
        throw e;
      }
    })
  );

  // Editar lo ya guardado: jefe de producción y gestor.
  router.patch(
    "/:id",
    requirePermiso("editar"),
    ruta(async (req, res) => {
      const d = validar(z.object({
        fecha: z.string().date().optional(),
        num_lote: z.string().trim().min(1).max(80).optional(),
        cantidad: z.number().positive().optional(),
        unidades: z.number().int().min(0).max(10000000).nullable().optional(),
        caducidad: z.string().date().nullable().optional(),
        responsable: z.string().trim().max(80).optional(),
        observaciones: z.string().max(2000).optional(),
        activo: z.boolean().optional(),
        // Cambiar entre producción interna y final (el lote pasa a la otra lista).
        interna: z.boolean().optional(),
        producto_id: z.string().uuid().optional(),
        // Lista de ingredientes ajustada a mano (null = volver a la automática).
        declaracion_ingredientes: z.string().trim().max(4000).nullable().optional(),
        ingredientes: z.array(esquemaIngrediente).min(1).max(60).optional(),
        ...camposTermicos,
      }), req.body, res);
      if (!d) return;
      try {
        const r = await db(req, async (c) => {
          let destino = cfg;
          const { interna, ingredientes, ...campos } = d;
          if (interna !== undefined && interna !== (cfg.clave === "intermedia")) {
            destino = CONFIG[interna ? "intermedia" : "final"];
            await moverLote(c, req.params.id, cfg, destino);
          }
          const SEL = selectElaboracion(destino);
          const { rows: [actual] } = await c.query(`${SEL} WHERE pp.id = $1 FOR UPDATE OF pp`, [req.params.id]);
          if (!actual) throw fallo("Lote no encontrado.", 404);
          if (destino.tabla !== "producciones") delete campos.unidades;
          if (campos.producto_id && campos.producto_id !== actual.producto_id) {
            const { rows: [np] } = await c.query("SELECT unidad_medida FROM productos WHERE id = $1 AND tipo IN ('preparado', 'elaborado')", [campos.producto_id]);
            if (!np) throw fallo("Ese producto no existe.", 400);
            campos.unidad = np.unidad_medida;
          } else delete campos.producto_id;
          if (campos.declaracion_ingredientes === "") campos.declaracion_ingredientes = null;
          if (campos.num_lote && campos.num_lote !== actual.num_lote) await loteRepetido(c, campos.num_lote, req.params.id);
          const claves = Object.keys(campos).filter((k) => campos[k] !== undefined);
          if (config.controlStock && destino.conStock && campos.cantidad !== undefined) {
            const usado = Number(actual.cantidad) - Number(actual.disponible);
            if (campos.cantidad < usado) throw fallo(`Ya se han usado ${usado} ${actual.unidad} de este lote; la cantidad no puede ser menor.`, 409);
          }
          if (actual.proceso_termico && claves.some((k) => k.startsWith("coccion") || k.startsWith("abat"))) exigirCorrectora(actual, { ...actual, ...campos });
          if (claves.length || destino !== cfg) {
            const sets = [...claves.map((k, i) => `${k} = $${i + 2}`), `modificado_por = $${claves.length + 2}`, "modificado_en = now()"];
            await c.query(`UPDATE ${destino.tabla} SET ${sets.join(", ")} WHERE id = $1`, [req.params.id, ...claves.map((k) => campos[k]), req.usuario.id]);
          }
          // Donde este lote se usó como ingrediente se guarda una copia del nº de lote: se actualiza.
          if (campos.num_lote && destino.conStock) await c.query("UPDATE consumos SET num_lote = $2 WHERE origen_preparado = $1", [req.params.id, campos.num_lote]);
          if (campos.producto_id) {
            await c.query("UPDATE productos SET tipo = $2 WHERE id = $1", [campos.producto_id, destino.tipo]);
            if (destino.conStock) await c.query("UPDATE consumos SET producto_id = $2, unidad = $3 WHERE origen_preparado = $1", [req.params.id, campos.producto_id, campos.unidad]);
          }
          if (ingredientes) {
            // Se devuelve al stock lo consumido antes y se descuenta lo nuevo.
            await c.query(`DELETE FROM consumos WHERE ${destino.fk} = $1`, [req.params.id]);
            await guardarConsumos(c, req.usuario.obrador_id, req.params.id, ingredientes, destino);
            await c.query(`UPDATE ${destino.tabla} SET modificado_por = $2, modificado_en = now() WHERE id = $1`, [req.params.id, req.usuario.id]);
          }
          return { destino, lote: (await c.query(`${SEL} WHERE pp.id = $1`, [req.params.id])).rows[0] };
        });
        res.json({ [r.destino.singular]: conTermico(r.lote), clase: r.destino.clave });
      } catch (e) {
        if (e.status) return enviarError(res, e);
        if (e.code === "23505") return res.status(409).json({ error: "Ya existe un lote con ese número.", campo: "num_lote" });
        throw e;
      }
    })
  );

  router.delete(
    "/:id",
    requirePermiso("borrar"),
    ruta(async (req, res) => {
      const n = await db(req, async (c) => (await c.query(`DELETE FROM ${cfg.tabla} WHERE id = $1`, [req.params.id])).rowCount);
      if (!n) return res.status(404).json({ error: "Lote no encontrado." });
      res.status(204).end();
    })
  );

  return router;
}

export const CONFIG_ELABORACION = CONFIG;
export const preparadosRouter = crearRouter(CONFIG.intermedia);
export const produccionesRouter = crearRouter(CONFIG.final);

// ---------- Producción (vista conjunta) ----------
// En la interfaz hay un único apartado "Producción": las internas (se usan
// como ingrediente) y las finales (se venden) salen juntas con la columna
// "interna" para filtrar y ordenar.
export const esquemaProduccion = esquemaFiltros.extend({ interna: z.enum(["1", "0"]).optional() });

/** Lotes de producción de los dos tipos, del más reciente al más antiguo. */
export async function listarProduccion(c, f) {
  const tipos = f.interna === "1" ? ["intermedia"] : f.interna === "0" ? ["final"] : ["intermedia", "final"];
  let filas = [];
  for (const t of tipos) {
    const cfg = CONFIG[t];
    const { where, params } = filtrosElaboracion(f, cfg);
    const { rows } = await c.query(`${selectElaboracion(cfg)} ${where} ORDER BY pp.fecha DESC, pp.creado_en DESC LIMIT $${params.push(f.limite)}`, params);
    filas = filas.concat(rows.map((r) => ({ ...conTermico(r), interna: t === "intermedia", clase: t })));
  }
  filas.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || new Date(b.creado_en) - new Date(a.creado_en));
  return filas.slice(0, f.limite);
}

export const produccionRouter = Router();
produccionRouter.use(requireAuth);

produccionRouter.get(
  "/",
  ruta(async (req, res) => {
    const f = validar(esquemaProduccion, req.query, res);
    if (!f) return;
    res.json({ produccion: await db(req, (c) => listarProduccion(c, f)) });
  })
);

// Los tres últimos lotes de cada ingrediente (entradas de mercancía y
// producción interna), para proponerlos al escribir una elaboración.
produccionRouter.get(
  "/ultimos-lotes",
  ruta(async (req, res) => {
    const lotes = await db(req, async (c) => (await c.query(
      `SELECT origen, id, producto_id, num_lote, fecha, caducidad, unidad, marca, proveedor FROM (
         SELECT 'recepcion' AS origen, r.id, r.producto_id, r.num_lote, r.fecha, r.caducidad, r.unidad, m.nombre AS marca, pr.nombre AS proveedor,
                row_number() OVER (PARTITION BY r.producto_id ORDER BY r.fecha DESC, r.creado_en DESC) AS n
           FROM recepciones r LEFT JOIN marcas m ON m.id = r.marca_id LEFT JOIN proveedores pr ON pr.id = r.proveedor_id
          WHERE r.activo
         UNION ALL
         SELECT 'preparado', pp.id, pp.producto_id, pp.num_lote, pp.fecha, pp.caducidad, pp.unidad, NULL, NULL,
                row_number() OVER (PARTITION BY pp.producto_id ORDER BY pp.fecha DESC, pp.creado_en DESC)
           FROM preparados pp WHERE pp.activo
       ) t WHERE n <= 3 ORDER BY producto_id, fecha DESC, n`
    )).rows);
    res.json({ lotes });
  })
);

// Lotes disponibles para usar como ingrediente (entradas y producción intermedia con stock).
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
        "INSERT INTO ajustes_stock (obrador_id, origen_recepcion, origen_preparado, delta, motivo, nota, usuario_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [req.usuario.obrador_id, d.origen === "recepcion" ? d.lote_id : null, d.origen === "preparado" ? d.lote_id : null, delta, d.motivo, d.nota, req.usuario.id]
      );
      return { delta };
    });
    if (!r) return res.status(404).json({ error: "Lote no encontrado." });
    res.json(r);
  })
);
