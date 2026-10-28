// Informes para imprimir: lo que se ve filtrado en cada apartado, en
// Excel o en PDF, en tablas con casillas y ajustadas a un A4 apaisado.
import path from "node:path";
import { createRequire } from "node:module";
import ExcelJS from "exceljs";
import pdfmake from "pdfmake";
import { listarProduccion, evaluarTermico } from "../routes/preparados.js";
import { config } from "../config.js";

const require = createRequire(import.meta.url);
const dirFuentes = path.join(path.dirname(require.resolve("pdfmake/package.json")), "build", "fonts", "Roboto");
pdfmake.setFonts({
  Roboto: {
    normal: path.join(dirFuentes, "Roboto-Regular.ttf"),
    bold: path.join(dirFuentes, "Roboto-Medium.ttf"),
    italics: path.join(dirFuentes, "Roboto-Italic.ttf"),
    bolditalics: path.join(dirFuentes, "Roboto-MediumItalic.ttf"),
  },
});
pdfmake.setLocalAccessPolicy((p) => path.resolve(p).startsWith(dirFuentes));

// ---------- Formatos ----------
const fecha = (d) => {
  if (!d) return "";
  const s = typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  const [a, m, dd] = s.split("-");
  return `${dd}/${m}/${a}`;
};
const hora = (d) => (d ? new Date(d).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }) : "");
const num = (n, dec = 3) => (n == null || n === "" ? "" : Number(n).toLocaleString("es-ES", { maximumFractionDigits: dec }));
const eur = (n) => (n == null ? "" : Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 4 }));
const siNo = (v) => (v === true ? "Sí" : v === false ? "No" : "");
const ok = (v) => (v === true ? "Sí" : v === false ? "No" : "–");
const CONSERVACION = { ambiente: "Ambiente", refrigerado: "Refrigerado", congelado: "Congelado" };
const ESTADO_ENTRADA = { conforme: "Conforme", conforme_con_incidencia: "Con incidencia", no_conforme: "No conforme" };
const ESTADO_PCC = { ok: "Correcto", pendiente: "Pendiente", fuera_de_rango: "Fuera de rango", no_aplica: "No aplica" };
const ALERGENO = {
  gluten: "Gluten", crustaceos: "Crustáceos", huevo: "Huevo", pescado: "Pescado", cacahuetes: "Cacahuetes", soja: "Soja",
  leche: "Leche", frutos_cascara: "Frutos cáscara", apio: "Apio", mostaza: "Mostaza", sesamo: "Sésamo",
  sulfitos: "Sulfitos", altramuces: "Altramuces", moluscos: "Moluscos",
};

// ---------- Datos de cada apartado ----------
// Cada uno devuelve { titulo, columnas: [{ titulo, ancho, alinear }], filas: [[texto…]] }.
// "ancho" es relativo (se reparte en el ancho útil del A4).

async function productos(c, f) {
  const params = [];
  const cond = ["p.tipo = 'materia_prima'"];
  if (f.q) cond.push(`(p.nombre ILIKE $${params.push(`%${f.q}%`)} OR m.nombre ILIKE $${params.length})`);
  if (f.desde) cond.push(`p.creado_en >= $${params.push(f.desde)}::date`);
  if (f.hasta) cond.push(`p.creado_en < $${params.push(f.hasta)}::date + 1`);
  const { rows } = await c.query(
    `SELECT p.nombre, p.unidad_medida, p.conservacion, p.categoria, p.creado_en,
            m.nombre AS marca, m.formato, m.alergenos, m.trazas, m.precio_referencia, m.ficha_id IS NOT NULL AS ficha, pr.nombre AS proveedor,
            (SELECT round(r.precio_total / r.cantidad, 4) FROM recepciones r
              WHERE r.producto_id = p.id AND (m.id IS NULL OR r.marca_id = m.id) AND r.precio_total IS NOT NULL
              ORDER BY r.fecha DESC, r.creado_en DESC LIMIT 1) AS ultimo_precio
       FROM productos p LEFT JOIN marcas m ON m.producto_id = p.id LEFT JOIN proveedores pr ON pr.id = m.proveedor_id
      WHERE ${cond.join(" AND ")}
      ORDER BY lower(p.nombre), lower(m.nombre) NULLS FIRST`,
    params
  );
  return {
    titulo: "Productos",
    columnas: [
      { titulo: "Producto", ancho: 3 }, { titulo: "Marca", ancho: 2.4 }, { titulo: "Formato", ancho: 1.8 },
      { titulo: "Ud.", ancho: 0.7, alinear: "center" }, { titulo: "Conservación", ancho: 1.4 }, { titulo: "Proveedor", ancho: 2.4 },
      { titulo: "Precio ref. €/ud", ancho: 1.3, alinear: "right" }, { titulo: "Último precio €/ud", ancho: 1.3, alinear: "right" },
      { titulo: "Alérgenos", ancho: 2.4 }, { titulo: "Trazas", ancho: 2 },
      ...(config.fichasTecnicas ? [{ titulo: "Ficha técnica", ancho: 1, alinear: "center" }] : []),
    ],
    filas: rows.map((r) => [
      r.nombre, r.marca || "", r.formato || "", r.unidad_medida, CONSERVACION[r.conservacion] || "", r.proveedor || "",
      eur(r.precio_referencia), eur(r.ultimo_precio), (r.alergenos || []).map((a) => ALERGENO[a] || a).join(", "),
      (r.trazas || []).filter((a) => !(r.alergenos || []).includes(a)).map((a) => ALERGENO[a] || a).join(", "),
      ...(config.fichasTecnicas ? [r.marca ? siNo(r.ficha) : ""] : []),
    ]),
  };
}

async function entradas(c, f) {
  const params = [];
  const cond = [];
  if (f.q) cond.push(`(p.nombre ILIKE $${params.push(`%${f.q}%`)} OR r.num_lote ILIKE $${params.length} OR pr.nombre ILIKE $${params.length})`);
  if (f.desde) cond.push(`r.fecha >= $${params.push(f.desde)}`);
  if (f.hasta) cond.push(`r.fecha <= $${params.push(f.hasta)}`);
  if (f.con_stock === "1") cond.push("s.disponible > 0 AND r.activo");
  const { rows } = await c.query(
    `SELECT r.*, p.nombre AS producto, m.nombre AS marca, pr.nombre AS proveedor, s.disponible, u.nombre AS registro
       FROM recepciones r JOIN productos p ON p.id = r.producto_id
       LEFT JOIN marcas m ON m.id = r.marca_id LEFT JOIN proveedores pr ON pr.id = r.proveedor_id
       LEFT JOIN usuarios u ON u.id = r.creado_por
       JOIN stock_lotes s ON s.origen = 'recepcion' AND s.id = r.id
      ${cond.length ? `WHERE ${cond.join(" AND ")}` : ""}
      ORDER BY r.fecha DESC, r.creado_en DESC`,
    params
  );
  const conStock = config.controlStock;
  const datos = {
    titulo: "Entradas de mercancía",
    columnas: [
      { titulo: "Fecha", ancho: 1.25 }, { titulo: "Producto", ancho: 2.3 }, { titulo: "Marca", ancho: 1.6 }, { titulo: "Proveedor", ancho: 1.8 },
      { titulo: "Lote", ancho: 1.4 }, { titulo: "Caducidad", ancho: 1.25 }, { titulo: "Cantidad", ancho: 1, alinear: "right" },
      { titulo: "Ud.", ancho: 0.5, alinear: "center" }, { titulo: "Bultos", ancho: 0.7, alinear: "right" },
      { titulo: "T.ª °C", ancho: 0.7, alinear: "right" }, { titulo: "Envase / Etiq. / Transp.", ancho: 1.4, alinear: "center" },
      { titulo: "Estado", ancho: 1.2 }, { titulo: "€/ud", ancho: 0.9, alinear: "right" }, { titulo: "Total €", ancho: 0.9, alinear: "right" },
      { titulo: "Disponible", ancho: 1.15, alinear: "right" }, { titulo: "Registró", ancho: 1.3 },
    ],
    filas: rows.map((r) => [
      fecha(r.fecha), r.producto, r.marca || "", r.proveedor || "", r.num_lote || "", fecha(r.caducidad), num(r.cantidad), r.unidad,
      r.bultos ?? "", num(r.temp_entrada, 1), `${ok(r.control_envase)} / ${ok(r.control_etiquetado)} / ${ok(r.control_transporte)}`,
      ESTADO_ENTRADA[r.estado_entrada] || "", r.cantidad > 0 && r.precio_total != null ? eur(r.precio_total / r.cantidad) : "",
      eur(r.precio_total), num(r.disponible), r.registro || "",
    ]),
  };
  return conStock ? datos : quitarColumna(datos, "Disponible");
}

/** Quita una columna (p. ej. "Disponible" mientras no hay control de stock). */
function quitarColumna(datos, titulo) {
  const i = datos.columnas.findIndex((col) => col.titulo === titulo);
  if (i < 0) return datos;
  return { ...datos, columnas: datos.columnas.filter((_, k) => k !== i), filas: datos.filas.map((fila) => fila.filter((_, k) => k !== i)) };
}

/**
 * Producción: internas (se usan como ingrediente) y finales (se venden).
 * interna: "1" solo internas, "0" solo finales, sin valor las dos.
 */
async function produccion(c, f) {
  const rows = await listarProduccion(c, { ...f, limite: 5000 });
  const ingredientes = new Map();
  const internas = rows.filter((r) => r.interna).map((r) => r.id);
  const finales = rows.filter((r) => !r.interna).map((r) => r.id);
  for (const [fk, ids] of [["preparado_id", internas], ["produccion_id", finales]]) {
    if (!ids.length) continue;
    const { rows: ing } = await c.query(
      `SELECT c.${fk} AS destino, p.nombre, c.num_lote, c.cantidad, c.unidad
         FROM consumos c JOIN productos p ON p.id = c.producto_id
        WHERE c.${fk} = ANY($1) ORDER BY p.nombre`,
      [ids]
    );
    for (const i of ing) {
      if (!ingredientes.has(i.destino)) ingredientes.set(i.destino, []);
      ingredientes.get(i.destino).push(`${i.nombre} · lote ${i.num_lote || "s/n"} · ${num(i.cantidad)} ${i.unidad}`);
    }
  }
  const soloUnTipo = f.interna === "1" || f.interna === "0";
  const columnas = [
    { titulo: "Fecha", ancho: 1.25 }, { titulo: "Producto", ancho: 2.2 },
    ...(soloUnTipo ? [] : [{ titulo: "Interna", ancho: 0.75, alinear: "center" }]),
    { titulo: "Lote", ancho: 1.4 }, { titulo: "Cantidad", ancho: 0.9, alinear: "right" }, { titulo: "Ud.", ancho: 0.5, alinear: "center" },
    { titulo: "Unidades", ancho: 1, alinear: "right" },
    ...(config.controlStock ? [{ titulo: "Disponible", ancho: 1.15, alinear: "right" }] : []),
    { titulo: "Caducidad", ancho: 1.25 }, { titulo: "Ingredientes (producto · lote · cantidad)", ancho: 4.2 },
    { titulo: "Cocción", ancho: 1.1 }, { titulo: "Abatimiento / congelación", ancho: 1.7 }, { titulo: "Control térmico", ancho: 1.1 },
    { titulo: "Medida correctora", ancho: 1.6 }, { titulo: "Responsable", ancho: 1.2 },
  ];
  const filas = rows.map((r) => {
    const t = evaluarTermico(r);
    const abat = t.estado !== "no_aplica"
      ? r.abat_hora_fin
        ? `de ${num(r.abat_temp_inicio, 1)} a ${num(r.abat_temp_fin, 1)} °C\n${hora(r.abat_hora_inicio)}–${hora(r.abat_hora_fin)} (${t.abat_minutos} min)`
        : r.abat_hora_inicio ? `Iniciado ${hora(r.abat_hora_inicio)}` : "Pendiente"
      : "";
    return [
      fecha(r.fecha), r.producto, ...(soloUnTipo ? [] : [r.interna ? "Sí" : "No"]), r.num_lote, num(r.cantidad), r.unidad,
      r.unidades != null ? `${num(r.unidades)} ${r.unidades_tipo || ""}`.trim() : "", ...(config.controlStock ? [r.interna ? num(r.disponible) : ""] : []),
      fecha(r.caducidad), (ingredientes.get(r.id) || []).join("\n"),
      r.proceso_termico && r.coccion_temp != null ? `${num(r.coccion_temp, 1)} °C · ${r.coccion_minutos ?? "–"} min` : "",
      abat, ESTADO_PCC[t.estado], r.medida_correctora || "", r.responsable || "",
    ];
  });
  const titulo = f.interna === "1" ? "Producción interna" : f.interna === "0" ? "Producción final" : "Producción";
  return { titulo, columnas, filas };
}

export const SECCIONES = {
  productos,
  entradas,
  produccion,
  intermedia: (c, f) => produccion(c, { ...f, interna: "1" }),
  final: (c, f) => produccion(c, { ...f, interna: "0" }),
};

function textoFiltros(f) {
  const partes = [];
  if (f.desde || f.hasta) partes.push(`Fechas: ${f.desde ? fecha(f.desde) : "inicio"} – ${f.hasta ? fecha(f.hasta) : "hoy"}`);
  if (f.q) partes.push(`Búsqueda: «${f.q}»`);
  if (f.con_stock === "1" && config.controlStock) partes.push("Solo lotes con stock");
  if (f.interna === "1") partes.push("Solo producción interna");
  if (f.interna === "0") partes.push("Solo producción final");
  return partes.join("   ·   ") || "Sin filtros";
}

/** Ancho y alto de una imagen PNG o JPEG (para no deformar el logotipo). */
function medidasImagen(b) {
  try {
    if (b[0] === 0x89) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  } catch { /* imagen rara: tamaño por defecto */ }
  return { w: 3, h: 1 };
}

// ---------- PDF (A4 apaisado) ----------
export async function generarPdf(datos, obrador, f, logo = null) {
  const imagenLogo = logo ? `data:${logo.mime_type};base64,${logo.contenido.toString("base64")}` : null;
  const anchoUtil = 841.89 - 2 * 24; // A4 apaisado menos márgenes, en puntos
  const total = datos.columnas.reduce((s, col) => s + col.ancho, 0);
  const widths = datos.columnas.map((col) => (col.ancho / total) * anchoUtil - 4.2);
  const cabecera = datos.columnas.map((col) => ({ text: col.titulo, bold: true, fontSize: 7.5, alignment: col.alinear || "left", fillColor: "#dfe6ee" }));
  const cuerpo = datos.filas.map((fila) =>
    fila.map((v, i) => ({ text: String(v ?? ""), fontSize: 7.5, alignment: datos.columnas[i].alinear || "left" }))
  );
  const def = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [24, 70, 24, 30],
    defaultStyle: { font: "Roboto", fontSize: 8, color: "#1b2420" },
    info: { title: `${datos.titulo} · ${obrador.nombre}` },
    header: () => ({
      margin: [24, 18, 24, 0],
      columns: [
        { stack: [
          { text: datos.titulo, fontSize: 14, bold: true },
          { text: textoFiltros(f), fontSize: 8, color: "#58625d", margin: [0, 3, 0, 0] },
        ] },
        ...(imagenLogo ? [{ width: "auto", image: imagenLogo, fit: [110, 42], margin: [0, 0, 10, 0] }] : []),
        { width: "auto", alignment: "right", stack: [
          { text: obrador.nombre, bold: true, fontSize: 10 },
          { text: [obrador.razon_social, obrador.registro_sanitario && `RSI ${obrador.registro_sanitario}`].filter(Boolean).join(" · "), fontSize: 8, color: "#58625d" },
          { text: `Generado el ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}`, fontSize: 7, color: "#58625d" },
        ] },
      ],
    }),
    footer: (pagina, paginas) => ({
      margin: [24, 8, 24, 0],
      columns: [
        { text: `${datos.filas.length} registro(s)`, fontSize: 7, color: "#58625d" },
        { text: `Página ${pagina} de ${paginas}`, alignment: "right", fontSize: 7, color: "#58625d" },
      ],
    }),
    content: datos.filas.length
      ? [{
          table: { headerRows: 1, widths, body: [cabecera, ...cuerpo], dontBreakRows: true },
          layout: {
            hLineWidth: () => 0.5, vLineWidth: () => 0.5,
            hLineColor: () => "#9aa5a0", vLineColor: () => "#9aa5a0",
            paddingLeft: () => 2, paddingRight: () => 2, paddingTop: () => 2, paddingBottom: () => 2,
            fillColor: (fila) => (fila > 0 && fila % 2 === 0 ? "#f4f6f5" : null),
          },
        }]
      : [{ text: "No hay registros con estos filtros.", italics: true, margin: [0, 20, 0, 0] }],
  };
  return pdfmake.createPdf(def).getBuffer();
}

// ---------- Excel (preparado para imprimir en A4) ----------
export async function generarExcel(datos, obrador, f, logo = null) {
  const libro = new ExcelJS.Workbook();
  libro.creator = obrador.nombre;
  const hoja = libro.addWorksheet(datos.titulo.slice(0, 31), {
    pageSetup: {
      paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      printTitlesRow: "4:4", horizontalCentered: true,
    },
    headerFooter: { oddFooter: `&L${obrador.nombre} · ${datos.titulo}&RPágina &P de &N` },
    views: [{ state: "frozen", ySplit: 4 }],
  });
  const n = datos.columnas.length;
  hoja.mergeCells(1, 1, 1, n);
  hoja.getCell(1, 1).value = `${datos.titulo} · ${obrador.nombre}`;
  hoja.getCell(1, 1).font = { bold: true, size: 14 };
  hoja.mergeCells(2, 1, 2, n);
  hoja.getCell(2, 1).value = [obrador.razon_social, obrador.registro_sanitario && `RSI ${obrador.registro_sanitario}`, textoFiltros(f),
    `Generado el ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}`].filter(Boolean).join("   ·   ");
  hoja.getCell(2, 1).font = { size: 9, color: { argb: "FF58625D" } };
  hoja.getRow(1).height = 34;
  if (logo) {
    // Logotipo arriba a la derecha, sobre las dos primeras filas.
    const id = libro.addImage({ buffer: logo.contenido, extension: logo.mime_type === "image/png" ? "png" : "jpeg" });
    const { w, h } = medidasImagen(logo.contenido);
    const escala = Math.min(130 / w, 44 / h);
    hoja.addImage(id, { tl: { col: Math.max(0, n - 2), row: 0 }, ext: { width: Math.round(w * escala), height: Math.round(h * escala) }, editAs: "oneCell" });
  }

  const borde = { style: "thin", color: { argb: "FF9AA5A0" } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };
  const cab = hoja.getRow(4);
  datos.columnas.forEach((col, i) => {
    const celda = cab.getCell(i + 1);
    celda.value = col.titulo;
    celda.font = { bold: true, size: 9 };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDFE6EE" } };
    celda.alignment = { vertical: "middle", horizontal: col.alinear || "left", wrapText: true };
    celda.border = bordes;
    hoja.getColumn(i + 1).width = Math.max(6, Math.round(col.ancho * 7.5));
  });
  cab.height = 30;
  datos.filas.forEach((fila, r) => {
    const row = hoja.getRow(5 + r);
    fila.forEach((v, i) => {
      const celda = row.getCell(i + 1);
      celda.value = v === "" || v == null ? null : v;
      celda.font = { size: 9 };
      celda.alignment = { vertical: "top", horizontal: datos.columnas[i].alinear || "left", wrapText: true };
      celda.border = bordes;
      if (r % 2 === 1) celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6F5" } };
    });
  });
  if (datos.filas.length) hoja.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + datos.filas.length, column: n } };
  return Buffer.from(await libro.xlsx.writeBuffer());
}
