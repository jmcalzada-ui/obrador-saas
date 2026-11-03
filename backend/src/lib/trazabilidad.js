// Ficha de trazabilidad de un lote, para imprimir en un clic (p. ej. cuando
// la pide una inspección): datos del lote, de qué está hecho (hacia atrás) y
// adónde ha ido (hacia delante: en qué se ha usado y a qué clientes ha salido).
import pdfmake from "pdfmake";
import { selectElaboracion, ingredientesDe, evaluarTermico, CONFIG_ELABORACION } from "../routes/preparados.js";
import { generarDeclaracion } from "./declaracion.js";

const fecha = (d) => {
  if (!d) return "";
  const s = typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  const [a, m, dd] = s.split("-");
  return `${dd}/${m}/${a}`;
};
const hora = (d) => (d ? new Date(d).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }) : "");
const num = (n, dec = 3) => (n == null || n === "" ? "" : Number(n).toLocaleString("es-ES", { maximumFractionDigits: dec }));
const CONSERVACION = { ambiente: "Ambiente", refrigerado: "Refrigerado", congelado: "Congelado" };
const ESTADO_PCC = { ok: "Correcto", pendiente: "Pendiente", fuera_de_rango: "Fuera de rango", no_aplica: "No aplica" };
const ESTADO_ENTRADA = { conforme: "Conforme", conforme_con_incidencia: "Conforme con incidencia", no_conforme: "No conforme" };

/** Salidas a clientes de un lote elaborado. */
async function salidasDe(c, tipo, id) {
  const col = tipo === "produccion" ? "produccion_id" : "preparado_id";
  const { rows } = await c.query(
    `SELECT s.fecha, s.num_pedido, cl.nombre AS cliente, cl.cif, cl.direccion, cl.poblacion, cl.provincia, l.cantidad, l.unidad
       FROM salida_lineas l JOIN salidas s ON s.id = l.salida_id JOIN clientes cl ON cl.id = s.cliente_id
      WHERE l.${col} = $1 ORDER BY s.fecha, s.num_pedido`,
    [id]
  );
  return rows;
}

/** En qué lotes se ha usado (como ingrediente) y, de esos, a qué clientes han salido. */
async function usosDe(c, campo, id, nivel = 0) {
  const { rows } = await c.query(
    `SELECT CASE WHEN co.preparado_id IS NOT NULL THEN 'preparado' ELSE 'produccion' END AS tipo,
            COALESCE(co.preparado_id, co.produccion_id) AS id, co.cantidad, co.unidad,
            COALESCE(pi.num_lote, pf.num_lote) AS num_lote, COALESCE(pi.fecha, pf.fecha) AS fecha, p.nombre AS producto
       FROM consumos co
       LEFT JOIN preparados pi ON pi.id = co.preparado_id
       LEFT JOIN producciones pf ON pf.id = co.produccion_id
       JOIN productos p ON p.id = COALESCE(pi.producto_id, pf.producto_id)
      WHERE co.${campo} = $1 ORDER BY fecha`,
    [id]
  );
  for (const u of rows) {
    u.salidas = await salidasDe(c, u.tipo, u.id);
    u.usos = u.tipo === "preparado" && nivel < 3 ? await usosDe(c, "origen_preparado", u.id, nivel + 1) : [];
  }
  return rows;
}

/** Todo lo necesario para la ficha. origen: produccion | preparado | recepcion */
export async function datosTrazabilidad(c, origen, id) {
  if (origen === "recepcion") {
    const { rows: [r] } = await c.query(
      `SELECT r.*, p.nombre AS producto, m.nombre AS marca, pr.nombre AS proveedor, u.nombre AS registro
         FROM recepciones r JOIN productos p ON p.id = r.producto_id
         LEFT JOIN marcas m ON m.id = r.marca_id LEFT JOIN proveedores pr ON pr.id = r.proveedor_id
         LEFT JOIN usuarios u ON u.id = r.creado_por WHERE r.id = $1`,
      [id]
    );
    if (!r) return null;
    return { origen, lote: r, usos: await usosDe(c, "origen_recepcion", id), salidas: [] };
  }
  const cfg = CONFIG_ELABORACION[origen === "produccion" ? "final" : "intermedia"];
  const { rows: [lote] } = await c.query(`${selectElaboracion(cfg)} WHERE pp.id = $1`, [id]);
  if (!lote) return null;
  const ingredientes = await ingredientesDe(c, cfg, id);
  // De las producciones internas usadas, también sus propios ingredientes.
  for (const i of ingredientes) {
    if (i.origen === "preparado" && i.lote_id) i.sub = await ingredientesDe(c, CONFIG_ELABORACION.intermedia, i.lote_id);
  }
  const declaracion = lote.declaracion_ingredientes || (await generarDeclaracion(c, cfg.fk, id)).texto;
  return {
    origen, lote, ingredientes, declaracion, control: evaluarTermico(lote),
    salidas: await salidasDe(c, origen, id),
    usos: origen === "preparado" ? await usosDe(c, "origen_preparado", id) : [],
  };
}

// ---------- PDF (A4 vertical) ----------
const GRIS = "#58625d";
const tablaSimple = (widths, cabecera, filas) => ({
  table: {
    headerRows: 1, widths, dontBreakRows: true,
    body: [cabecera.map((t) => ({ text: t, bold: true, fontSize: 8, fillColor: "#dfe6ee" })), ...filas],
  },
  layout: {
    hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => "#9aa5a0", vLineColor: () => "#9aa5a0",
    paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 2.5, paddingBottom: () => 2.5,
  },
  margin: [0, 2, 0, 8],
});
const celda = (t, extra = {}) => ({ text: t == null ? "" : String(t), fontSize: 8, ...extra });
const titulo = (t) => ({ text: t, fontSize: 11, bold: true, margin: [0, 10, 0, 4], color: "#1b2420" });
const lugar = (s) => [s.direccion, s.poblacion, s.provincia].filter(Boolean).join(", ");

/** Filas de destino: salidas directas y, de los lotes donde se usó, sus salidas (con sangría). */
function filasDestino(salidas, usos, nivel = 0) {
  const filas = [];
  const sangria = nivel * 10;
  for (const s of salidas) {
    filas.push([
      celda(fecha(s.fecha)),
      celda(`Cliente: ${s.cliente}${s.cif ? ` (NIF ${s.cif})` : ""}`, { bold: true, margin: [sangria, 0, 0, 0] }),
      celda([`Pedido ${s.num_pedido}`, lugar(s)].filter(Boolean).join(" · ")),
      celda(`${num(s.cantidad)} ${s.unidad || ""}`, { alignment: "right" }),
    ]);
  }
  for (const u of usos) {
    filas.push([
      celda(fecha(u.fecha)),
      celda(`Usado en ${u.tipo === "preparado" ? "producción interna" : "producción final"}: ${u.producto}`, { margin: [sangria, 0, 0, 0] }),
      celda(`Lote ${u.num_lote}`),
      celda(`${num(u.cantidad)} ${u.unidad}`, { alignment: "right" }),
    ]);
    filas.push(...filasDestino(u.salidas, u.usos, nivel + 1));
    if (!u.salidas.length && !u.usos.length) {
      filas.push([celda(""), celda("Sin salidas registradas de este lote.", { italics: true, color: GRIS, margin: [sangria + 10, 0, 0, 0] }), celda(""), celda("")]);
    }
  }
  return filas;
}

/** Clientes distintos a los que ha llegado (directamente o a través de otros lotes). */
function clientesAlcanzados(salidas, usos, acc = new Map()) {
  for (const s of salidas) acc.set(s.cif || s.cliente, s.cliente);
  for (const u of usos) clientesAlcanzados(u.salidas, u.usos, acc);
  return acc;
}

export async function generarPdfLote(d, obrador, logo = null) {
  const l = d.lote;
  const imagenLogo = logo ? `data:${logo.mime_type};base64,${logo.contenido.toString("base64")}` : null;
  const esEntrada = d.origen === "recepcion";
  const tipo = esEntrada ? "Entrada de mercancía" : d.origen === "produccion" ? "Producción final" : "Producción interna";
  const contenido = [];

  // Datos del lote
  const datos = esEntrada
    ? [
        ["Producto", l.producto], ["Nº de lote", l.num_lote || "Sin nº"], ["Tipo", tipo],
        ["Fecha de entrada", fecha(l.fecha)], ["Caducidad", fecha(l.caducidad)],
        ["Cantidad recibida", `${num(l.cantidad)} ${l.unidad}${l.bultos ? ` · ${l.bultos} bultos` : ""}`],
        ["Marca (fabricante)", l.marca || ""], ["Proveedor", l.proveedor || ""], ["Factura / albarán", l.factura || ""],
        ["Temperatura de entrada", l.temp_entrada != null ? `${num(l.temp_entrada, 1)} °C` : ""], ["Estado", ESTADO_ENTRADA[l.estado_entrada] || ""],
        ["Registró", l.registro || ""],
      ]
    : [
        ["Producto", l.producto], ["Nº de lote", l.num_lote], ["Tipo", tipo],
        ["Fecha de elaboración", fecha(l.fecha)], ["Caducidad", fecha(l.caducidad)],
        ["Cantidad obtenida", `${num(l.cantidad)} ${l.unidad}${l.unidades != null ? ` · ${num(l.unidades)} ${l.unidades_tipo || "uds."}` : ""}`],
        ["Conservación", CONSERVACION[l.conservacion] || ""], ["Responsable", l.responsable || ""],
        ["Control térmico", ESTADO_PCC[d.control.estado]],
      ];
  contenido.push({
    table: { widths: [130, "*"], body: datos.map(([k, v]) => [celda(k, { color: GRIS }), celda(v || "—", { bold: true })]) },
    layout: "lightHorizontalLines", margin: [0, 0, 0, 4],
  });

  if (!esEntrada) {
    // Control térmico
    if (d.control.estado !== "no_aplica") {
      contenido.push(titulo("Control térmico"));
      const filas = [];
      if (l.proceso_termico) filas.push(["Cocción", l.coccion_temp != null ? `${num(l.coccion_temp, 1)} °C · ${l.coccion_minutos ?? "–"} min` : "Sin anotar", `≥ ${num(l.coccion_temp_min, 1)} °C`]);
      filas.push([
        d.control.congelado ? "Congelación" : "Abatimiento",
        l.abat_hora_fin ? `de ${num(l.abat_temp_inicio, 1)} °C (${hora(l.abat_hora_inicio)}) a ${num(l.abat_temp_fin, 1)} °C (${hora(l.abat_hora_fin)}) · ${d.control.abat_minutos} min` : "Pendiente",
        `≤ ${num(d.control.objetivo_temp, 1)} °C en ${d.control.objetivo_minutos} min`,
      ]);
      contenido.push(tablaSimple([90, "*", 130], ["Control", "Resultado", "Objetivo"], filas.map((f) => f.map((x) => celda(x)))));
      if (l.medida_correctora) contenido.push({ text: `Medida correctora: ${l.medida_correctora}`, fontSize: 8, margin: [0, 0, 0, 4] });
    }

    // Hacia atrás
    contenido.push(titulo("De qué está hecho (trazabilidad hacia atrás)"));
    const filas = [];
    for (const i of d.ingredientes) {
      const procedencia = i.origen === "recepcion"
        ? ["Entrada", i.marca, i.proveedor].filter(Boolean).join(" · ")
        : i.origen === "preparado" ? "Producción interna" : "Anotado a mano";
      filas.push([celda(i.producto, { bold: true }), celda(i.num_lote || "Sin nº"), celda(procedencia), celda(fecha(i.caducidad)), celda(`${num(i.cantidad)} ${i.unidad}`, { alignment: "right" })]);
      for (const s of i.sub || []) {
        filas.push([
          celda(s.producto, { margin: [10, 0, 0, 0], color: GRIS }), celda(s.num_lote || "Sin nº", { color: GRIS }),
          celda(["Entrada", s.marca, s.proveedor].filter(Boolean).join(" · "), { color: GRIS }), celda(fecha(s.caducidad), { color: GRIS }),
          celda(`${num(s.cantidad)} ${s.unidad}`, { alignment: "right", color: GRIS }),
        ]);
      }
    }
    contenido.push(filas.length
      ? tablaSimple(["*", 80, "*", 58, 58], ["Ingrediente", "Lote", "Procedencia", "Caducidad", "Cantidad"], filas)
      : { text: "Sin ingredientes registrados.", italics: true, fontSize: 8 });
    if (d.declaracion) {
      contenido.push({ text: "Lista de ingredientes", fontSize: 9, bold: true, margin: [0, 2, 0, 2] });
      contenido.push({ text: d.declaracion, fontSize: 8, margin: [0, 0, 0, 4] });
    }
  }

  // Hacia delante
  contenido.push(titulo(esEntrada ? "Dónde se ha usado y a quién ha llegado (trazabilidad hacia delante)" : "A quién ha llegado (trazabilidad hacia delante)"));
  const destino = filasDestino(d.salidas, d.usos);
  if (destino.length) {
    const clientes = clientesAlcanzados(d.salidas, d.usos);
    contenido.push({ text: clientes.size ? `Ha llegado a ${clientes.size} ${clientes.size === 1 ? "cliente" : "clientes"}: ${[...clientes.values()].join(", ")}.` : "No consta que haya salido a ningún cliente.", fontSize: 8.5, bold: true, margin: [0, 0, 0, 4] });
    contenido.push(tablaSimple([58, "*", "*", 62], ["Fecha", "Destino", "Detalle", "Cantidad"], destino));
  } else {
    contenido.push({ text: esEntrada ? "Este lote todavía no se ha usado en ninguna producción." : "No consta ninguna salida de este lote a clientes.", italics: true, fontSize: 8 });
  }

  // Firma
  contenido.push({
    margin: [0, 24, 0, 0],
    columns: [
      { text: "Responsable: ______________________________", fontSize: 8.5 },
      { text: "Firma: ______________________", fontSize: 8.5 },
      { text: "Fecha: ____ / ____ / ________", fontSize: 8.5 },
    ],
  });

  const def = {
    pageSize: "A4",
    pageMargins: [32, 86, 32, 36],
    defaultStyle: { font: "Roboto", fontSize: 9, color: "#1b2420" },
    info: { title: `Trazabilidad del lote ${l.num_lote || ""} · ${obrador.nombre}` },
    header: () => ({
      margin: [32, 22, 32, 0],
      columns: [
        { stack: [
          { text: "Ficha de trazabilidad del lote", fontSize: 15, bold: true },
          { text: `${l.producto} · lote ${l.num_lote || "sin nº"}`, fontSize: 10, margin: [0, 3, 0, 0] },
        ] },
        ...(imagenLogo ? [{ width: "auto", image: imagenLogo, fit: [100, 40], margin: [0, 0, 10, 0] }] : []),
        { width: "auto", alignment: "right", stack: [
          { text: obrador.nombre, bold: true, fontSize: 10 },
          { text: [obrador.razon_social, obrador.registro_sanitario && `RSI ${obrador.registro_sanitario}`].filter(Boolean).join(" · "), fontSize: 8, color: GRIS },
          { text: `Generado el ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}`, fontSize: 7, color: GRIS },
        ] },
      ],
    }),
    footer: (pagina, paginas) => ({
      margin: [32, 10, 32, 0],
      columns: [
        { text: `${obrador.nombre} · Trazabilidad del lote ${l.num_lote || ""}`, fontSize: 7, color: GRIS },
        { text: `Página ${pagina} de ${paginas}`, alignment: "right", fontSize: 7, color: GRIS },
      ],
    }),
    content: contenido,
  };
  return pdfmake.createPdf(def).getBuffer();
}
