// Productos con marca, ficha y precio; entrada de mercancía con unidad fija;
// preparados internos con stock, trazabilidad y control térmico.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { baseLimpia, nuevoObrador, pool } from "./helpers.js";
import { config } from "../src/config.js";

// Estas pruebas cubren el control de stock de la fase 2 (en la fase 1 está apagado).
config.controlStock = true;

let O, harina, leche, recHarina, recLeche, bechamel;

before(async () => {
  await baseLimpia();
  O = await nuevoObrador("Obrador de comidas");
  harina = (await O.api.post("/api/catalogo/productos", { nombre: "Harina de arroz", unidad_medida: "kg" })).body.producto;
  leche = (await O.api.post("/api/catalogo/productos", { nombre: "Leche entera", unidad_medida: "l", conservacion: "refrigerado" })).body.producto;
});
after(() => pool.end());

test("marca con precio de referencia y ficha técnica en PDF", async () => {
  const m = await O.api.post(`/api/catalogo/productos/${harina.id}/marcas`, { nombre: "Molinos Sur", precio_referencia: 1.2, formato: "saco 25 kg" });
  assert.equal(m.status, 201);
  const pdf = Buffer.from("%PDF-1.4\n%prueba\n").toString("base64");
  const subir = await O.api.put(`/api/catalogo/marcas/${m.body.marca.id}/ficha`, { nombre: "ficha.pdf", mime_type: "application/pdf", base64: pdf });
  assert.equal(subir.status, 200, JSON.stringify(subir.body));
  const noPdf = await O.api.put(`/api/catalogo/marcas/${m.body.marca.id}/ficha`, { nombre: "x.pdf", mime_type: "application/pdf", base64: Buffer.from("hola mundo").toString("base64") });
  assert.equal(noPdf.status, 400);
  const bajar = await O.api.get(`/api/catalogo/marcas/${m.body.marca.id}/ficha`);
  assert.equal(bajar.status, 200);
  assert.equal(bajar.headers["content-type"], "application/pdf");
  const p = (await O.api.get("/api/catalogo/productos?tipo=materia_prima")).body.productos.find((x) => x.id === harina.id);
  assert.equal(p.marcas[0].tiene_ficha, true);
  assert.equal(p.marcas[0].precio_referencia, 1.2);
});

test("la entrada de mercancía toma la unidad del producto y calcula el total desde el precio por unidad", async () => {
  const r = await O.api.post("/api/recepciones", {
    fecha: "2026-10-20", producto_id: harina.id, cantidad: 25, unidad: "g", num_lote: "H-1", bultos: 1, precio_unidad: 1.25,
    control_envase: true, control_etiquetado: true, control_transporte: true, caducidad: "2027-04-01",
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.recepcion.unidad, "kg", "la unidad la fija el producto, no el formulario");
  assert.equal(r.body.recepcion.precio_total, 31.25);
  assert.equal(r.body.recepcion.precio_unidad, 1.25);
  assert.equal(r.body.recepcion.bultos, 1);
  recHarina = r.body.recepcion;
  recLeche = (await O.api.post("/api/recepciones", { fecha: "2026-10-20", producto_id: leche.id, cantidad: 12, num_lote: "L-7", temp_entrada: 3.5 })).body.recepcion;
  // Con registros, la unidad solo cambia sin preguntar si se puede convertir (kg ↔ g, l ↔ ml)
  assert.equal((await O.api.patch(`/api/catalogo/productos/${harina.id}`, { unidad_medida: "ud" })).status, 409);
});

test("primer preparado: se crea con proceso térmico y exige cocción", async () => {
  const sinCoccion = await O.api.post("/api/preparados", {
    nuevo: { nombre: "Bechamel base", unidad_medida: "kg", proceso_termico: true, vida_util_dias: 3 },
    fecha: "2026-10-21", num_lote: "BB-261021-1", cantidad: 15,
    ingredientes: [{ origen: "recepcion", lote_id: recHarina.id, cantidad: 2 }],
  });
  assert.equal(sinCoccion.status, 400);
  assert.equal(sinCoccion.body.campo, "coccion_temp");

  const r = await O.api.post("/api/preparados", {
    nuevo: { nombre: "Bechamel base", unidad_medida: "kg", proceso_termico: true, vida_util_dias: 3 },
    fecha: "2026-10-21", num_lote: "BB-261021-1", cantidad: 15,
    ingredientes: [
      { origen: "recepcion", lote_id: recHarina.id, cantidad: 2 },
      { origen: "recepcion", lote_id: recLeche.id, cantidad: 10 },
    ],
    coccion_temp: 82, coccion_minutos: 25, abat_temp_inicio: 78, abat_hora_inicio: "2026-10-21T10:00:00Z",
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  bechamel = r.body.preparado;
  assert.equal(bechamel.caducidad, "2026-10-24", "caducidad calculada con la vida útil");
  assert.equal(bechamel.control_termico.estado, "pendiente", "falta terminar el abatimiento");
  assert.equal(bechamel.coccion_temp_min, 75, "objetivos por defecto");
  // Stock descontado de los lotes usados
  const rec = (await O.api.get(`/api/recepciones/${recHarina.id}`)).body;
  assert.equal(rec.recepcion.disponible, 23);
  assert.equal(rec.usos[0].lote_destino, "BB-261021-1");
});

test("el abatimiento se completa después; fuera de rango exige medida correctora", async () => {
  const lento = await O.api.post(`/api/preparados/${bechamel.id}/abatimiento`, { abat_temp_fin: 9, abat_hora_fin: "2026-10-21T12:30:00Z" });
  assert.equal(lento.status, 400, "2 h 30 min supera el máximo de 2 h");
  assert.equal(lento.body.campo, "medida_correctora");
  const ok = await O.api.post(`/api/preparados/${bechamel.id}/abatimiento`, { abat_temp_fin: 8, abat_hora_fin: "2026-10-21T11:40:00Z" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.preparado.control_termico.estado, "ok");
  assert.equal(ok.body.preparado.control_termico.abat_minutos, 100);
  assert.equal((await O.api.post(`/api/preparados/${bechamel.id}/abatimiento`, { abat_temp_fin: 5, abat_hora_fin: "2026-10-21T11:00:00Z" })).status, 409);
});

test("la siguiente vez se ofrece el preparado guardado, con sus ingredientes habituales", async () => {
  const prep = (await O.api.get("/api/catalogo/productos?tipo=preparado")).body.productos;
  assert.deepEqual(prep.map((p) => p.nombre), ["Bechamel base"]);
  assert.equal(prep[0].proceso_termico, true);
  assert.equal(prep[0].ingredientes_habituales.length, 2);
  const lote = (await O.api.get(`/api/preparados/siguiente-lote?producto_id=${prep[0].id}&fecha=2026-10-21`)).body.num_lote;
  assert.equal(lote, "BB-261021-2");
});

test("no se puede gastar más stock del que hay", async () => {
  const prep = (await O.api.get("/api/catalogo/productos?tipo=preparado")).body.productos[0];
  const r = await O.api.post("/api/preparados", {
    producto_id: prep.id, fecha: "2026-10-22", num_lote: "BB-261022-1", cantidad: 10, coccion_temp: 80,
    ingredientes: [{ origen: "recepcion", lote_id: recLeche.id, cantidad: 5 }],
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.codigo, "sin_stock");
  assert.match(r.body.error, /quedan 2/);
});

test("un preparado sin proceso térmico y usado como ingrediente de otro: trazabilidad completa", async () => {
  const masa = await O.api.post("/api/preparados", {
    nuevo: { nombre: "Masa de croqueta de pollo", unidad_medida: "kg", proceso_termico: false },
    fecha: "2026-10-22", num_lote: "MCP-1", cantidad: 6,
    ingredientes: [
      { origen: "preparado", lote_id: bechamel.id, cantidad: 5 },
      { origen: "manual", producto_id: harina.id, num_lote: "SIN-ETIQUETA", cantidad: 0.3 },
    ],
  });
  assert.equal(masa.status, 201, JSON.stringify(masa.body));
  assert.equal(masa.body.preparado.control_termico.estado, "no_aplica");
  const det = (await O.api.get(`/api/preparados/${masa.body.preparado.id}`)).body;
  assert.deepEqual(det.ingredientes.map((i) => i.origen).sort(), ["manual", "preparado"]);
  const bech = (await O.api.get(`/api/preparados/${bechamel.id}`)).body;
  assert.equal(bech.preparado.disponible, 10);
  assert.equal(bech.usos[0].lote_destino, "MCP-1");
  assert.equal(bech.ingredientes.length, 2);
  // No se puede borrar un lote ya usado
  assert.equal((await O.api.delete(`/api/preparados/${bechamel.id}`)).status, 409);
});

test("editar ingredientes devuelve y vuelve a descontar el stock", async () => {
  const r = await O.api.patch(`/api/preparados/${bechamel.id}`, {
    ingredientes: [{ origen: "recepcion", lote_id: recHarina.id, cantidad: 3 }, { origen: "recepcion", lote_id: recLeche.id, cantidad: 8 }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await O.api.get(`/api/recepciones/${recHarina.id}`)).body.recepcion.disponible, 22);
  assert.equal((await O.api.get(`/api/recepciones/${recLeche.id}`)).body.recepcion.disponible, 4);
});

test("ajuste manual de stock por el gestor", async () => {
  const r = await O.api.post("/api/stock/ajustes", { origen: "recepcion", lote_id: recLeche.id, disponible_real: 3, motivo: "Recuento" });
  assert.equal(r.status, 200);
  assert.equal(r.body.delta, -1);
  const lotes = (await O.api.get(`/api/stock/lotes?producto_id=${leche.id}`)).body.lotes;
  assert.equal(lotes[0].disponible, 3);
});

test("producto final: usa entradas y producción intermedia, sin stock propio y con lote único entre ambos", async () => {
  const fresca = (await O.api.post("/api/recepciones", { fecha: "2026-10-23", producto_id: harina.id, cantidad: 10, num_lote: "H-2" })).body.recepcion;
  const masa = (await O.api.get("/api/preparados?q=masa")).body.preparados[0];
  const r = await O.api.post("/api/producciones", {
    nuevo: { nombre: "Croquetas de pollo (bandeja 12 ud)", unidad_medida: "ud", proceso_termico: false, vida_util_dias: 90 },
    fecha: "2026-10-23", num_lote: "CP-261023-1", cantidad: 40, unidades: 480,
    ingredientes: [
      { origen: "preparado", lote_id: masa.id, cantidad: 4 },
      { origen: "recepcion", lote_id: fresca.id, cantidad: 1.5 },
    ],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.produccion.unidades, 480);
  assert.equal(r.body.produccion.caducidad, "2027-01-21");
  assert.equal(r.body.produccion.disponible, null);
  // Descuenta stock de los lotes usados
  assert.equal((await O.api.get(`/api/preparados/${masa.id}`)).body.preparado.disponible, 2);
  // La producción intermedia sabe en qué producto final se usó
  const usos = (await O.api.get(`/api/preparados/${masa.id}`)).body.usos;
  assert.ok(usos.some((u) => u.destino_tipo === "produccion" && u.producto_destino.startsWith("Croquetas")));
  // Ficha del producto final con sus ingredientes
  const det = (await O.api.get(`/api/producciones/${r.body.produccion.id}`)).body;
  assert.equal(det.ingredientes.length, 2);
  // El nº de lote no puede repetirse con uno de producción intermedia
  const rep = await O.api.post("/api/producciones", {
    producto_id: r.body.produccion.producto_id, fecha: "2026-10-24", num_lote: "MCP-1", cantidad: 1,
    ingredientes: [{ origen: "recepcion", lote_id: fresca.id, cantidad: 0.1 }],
  });
  assert.equal(rep.status, 409);
  // Listado con filtros de producto y fechas
  assert.equal((await O.api.get("/api/producciones?q=croq&desde=2026-10-23&hasta=2026-10-23")).body.producciones.length, 1);
  assert.equal((await O.api.get("/api/producciones?desde=2026-10-24")).body.producciones.length, 0);
  assert.equal((await O.api.get("/api/preparados?desde=2026-10-22&hasta=2026-10-22")).body.preparados.length, 1);
});

test("informes Excel y PDF de los cuatro apartados", async () => {
  const fs = await import("node:fs");
  const dir = process.env.INFORMES_DIR;
  for (const seccion of ["productos", "entradas", "intermedia", "final"]) {
    const pdf = await O.api.get(`/api/informes/${seccion}?formato=pdf&desde=2026-10-01&hasta=2026-10-31`).buffer(true).parse((res, cb) => {
      const trozos = []; res.on("data", (t) => trozos.push(t)); res.on("end", () => cb(null, Buffer.concat(trozos)));
    });
    assert.equal(pdf.status, 200, `pdf ${seccion}`);
    assert.equal(pdf.headers["content-type"], "application/pdf");
    assert.equal(pdf.body.subarray(0, 4).toString(), "%PDF");
    const xlsx = await O.api.get(`/api/informes/${seccion}?formato=xlsx&q=a`).buffer(true).parse((res, cb) => {
      const trozos = []; res.on("data", (t) => trozos.push(t)); res.on("end", () => cb(null, Buffer.concat(trozos)));
    });
    assert.equal(xlsx.status, 200, `xlsx ${seccion}`);
    assert.equal(xlsx.body.subarray(0, 2).toString(), "PK", "un .xlsx es un zip");
    if (dir) { fs.writeFileSync(`${dir}/${seccion}.pdf`, pdf.body); fs.writeFileSync(`${dir}/${seccion}.xlsx`, xlsx.body); }
  }
  assert.equal((await O.api.get("/api/informes/otra")).status, 404);
});
