// Lista de ingredientes de un lote elaborado, como en una etiqueta:
//  · en orden decreciente de peso (lo que se usó en el lote);
//  · con el % de los ingredientes más representativos (10 % o más);
//  · cada ingrediente con su composición entre paréntesis: la de la marca
//    usada (ficha del producto) o, si es una producción interna, su propia
//    lista de ingredientes;
//  · y al final los alérgenos que contiene y las trazas.

export const NOMBRE_ALERGENO = {
  gluten: "gluten", crustaceos: "crustáceos", huevo: "huevo", pescado: "pescado", cacahuetes: "cacahuetes",
  soja: "soja", leche: "leche", frutos_cascara: "frutos de cáscara", apio: "apio", mostaza: "mostaza",
  sesamo: "sésamo", sulfitos: "sulfitos", altramuces: "altramuces", moluscos: "moluscos",
};
export const PORCENTAJE_MINIMO = 10;

const A_KG = { kg: 1, g: 0.001, l: 1, ml: 0.001 }; // litros ≈ kilos; las unidades sueltas no se pueden pesar

const minuscula = (t) => (t ? t.charAt(0).toLocaleLowerCase("es") + t.slice(1) : t);
/** Composición de una ficha, sin "Ingredientes:" delante ni punto final. */
const limpiar = (t) => (t || "").replace(/^\s*ingredientes\s*:\s*/i, "").replace(/\s+/g, " ").trim().replace(/[.;]+$/, "");
const porcentaje = (p) => (p >= 1 ? `${Math.round(p)} %` : `${p.toFixed(1).replace(".", ",")} %`);

/**
 * @param c   conexión (dentro del obrador)
 * @param fk  "preparado_id" (producción interna) o "produccion_id" (final)
 * @returns { lista, contiene: [], trazas: [], texto }
 */
export async function generarDeclaracion(c, fk, id, profundidad = 0) {
  const { rows } = await c.query(
    `SELECT c.producto_id, p.nombre, c.cantidad, c.unidad, c.origen_preparado,
            p.alergenos AS p_alergenos, p.trazas AS p_trazas,
            -- Marca de la entrada usada; si no consta (o se anotó a mano) y el producto tiene una sola marca, esa.
            COALESCE(m.composicion, mu.composicion, '') AS composicion,
            COALESCE(m.alergenos, mu.alergenos, '{}') AS alergenos,
            COALESCE(m.trazas, mu.trazas, '{}') AS trazas,
            pi.declaracion_ingredientes AS sub_ajustada
       FROM consumos c
       JOIN productos p ON p.id = c.producto_id
       LEFT JOIN recepciones r ON r.id = c.origen_recepcion
       LEFT JOIN marcas m ON m.id = r.marca_id
       LEFT JOIN LATERAL (
         SELECT composicion, alergenos, trazas FROM marcas WHERE producto_id = c.producto_id AND r.marca_id IS NULL
          AND (SELECT count(*) FROM marcas m2 WHERE m2.producto_id = c.producto_id) = 1
       ) mu ON true
       LEFT JOIN preparados pi ON pi.id = c.origen_preparado
      WHERE c.${fk} = $1`,
    [id]
  );

  // Un mismo ingrediente usado de varios lotes cuenta una vez.
  const porProducto = new Map();
  const contiene = new Set();
  const trazas = new Set();
  for (const r of rows) {
    const k = r.producto_id;
    const masa = A_KG[r.unidad] != null ? Number(r.cantidad) * A_KG[r.unidad] : null;
    const actual = porProducto.get(k) || { nombre: r.nombre, masa: 0, sinPeso: false, composicion: "", sub: null };
    if (masa == null) actual.sinPeso = true; else actual.masa += masa;
    if (!actual.composicion && r.composicion) actual.composicion = limpiar(r.composicion);
    for (const a of [...(r.alergenos || []), ...(r.p_alergenos || [])]) contiene.add(a);
    for (const a of [...(r.trazas || []), ...(r.p_trazas || [])]) trazas.add(a);
    if (r.origen_preparado && !actual.sub && profundidad < 3) {
      const d = await generarDeclaracion(c, "preparado_id", r.origen_preparado, profundidad + 1);
      actual.sub = r.sub_ajustada ? limpiar(r.sub_ajustada.split("\n")[0]) : d.lista;
      d.contiene.forEach((a) => contiene.add(a));
      d.trazas.forEach((a) => trazas.add(a));
    }
    porProducto.set(k, actual);
  }

  const items = [...porProducto.values()];
  const total = items.reduce((s, i) => s + (i.sinPeso ? 0 : i.masa), 0);
  items.sort((a, b) => (a.sinPeso - b.sinPeso) || b.masa - a.masa);
  const lista = items.map((i) => {
    const pct = !i.sinPeso && total > 0 ? (i.masa / total) * 100 : null;
    const igual = (x, y) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === y.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    let detalle = minuscula(i.sub || i.composicion);
    if (detalle && igual(detalle, i.nombre)) detalle = ""; // "harina de trigo (harina de trigo)" no aporta nada
    return `${minuscula(i.nombre)}${pct != null && pct >= PORCENTAJE_MINIMO ? ` ${porcentaje(pct)}` : ""}${detalle ? ` (${detalle})` : ""}`;
  }).join(", ");

  const lc = [...contiene];
  const lt = [...trazas].filter((a) => !contiene.has(a));
  const lineas = [];
  if (lista) lineas.push(`Ingredientes: ${lista}.`);
  if (lc.length) lineas.push(`Contiene: ${lc.map((a) => (NOMBRE_ALERGENO[a] || a).toLocaleUpperCase("es")).join(", ")}.`);
  if (lt.length) lineas.push(`Puede contener trazas de: ${lt.map((a) => NOMBRE_ALERGENO[a] || a).join(", ")}.`);
  return { lista, contiene: lc, trazas: lt, texto: lineas.join("\n") };
}
