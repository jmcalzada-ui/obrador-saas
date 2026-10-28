// Fase 1: sin control de stock, sugerencia de los últimos lotes, apartado
// único de Producción (interna / final) y logotipo del obrador.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { baseLimpia, nuevoObrador, pool } from "./helpers.js";
import { config } from "../src/config.js";

let O, B, harina, leche, bechamel;
const recs = [];

before(async () => {
  config.controlStock = false;
  await baseLimpia();
  O = await nuevoObrador("Obrador fase 1");
  B = await nuevoObrador("Otro obrador");
  harina = (await O.api.post("/api/catalogo/productos", { nombre: "Harina", unidad_medida: "kg" })).body.producto;
  leche = (await O.api.post("/api/catalogo/productos", { nombre: "Leche", unidad_medida: "l" })).body.producto;
  for (const [i, f] of ["2026-10-01", "2026-10-05", "2026-10-09", "2026-10-12"].entries()) {
    recs.push((await O.api.post("/api/recepciones", { fecha: f, producto_id: harina.id, cantidad: 5, num_lote: `H-${i + 1}` })).body.recepcion);
  }
  recs.push((await O.api.post("/api/recepciones", { fecha: "2026-10-10", producto_id: leche.id, cantidad: 2, num_lote: "L-1" })).body.recepcion);
});
after(() => pool.end());

test("sin control de stock se puede usar más cantidad de la registrada en la entrada", async () => {
  const r = await O.api.post("/api/preparados", {
    nuevo: { nombre: "Bechamel", unidad_medida: "kg", proceso_termico: false },
    fecha: "2026-10-13", num_lote: "BE-1", cantidad: 20,
    ingredientes: [{ origen: "recepcion", lote_id: recs[3].id, cantidad: 50 }, { origen: "recepcion", lote_id: recs[4].id, cantidad: 9 }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  bechamel = r.body.preparado;
});

test("últimos lotes: los tres más recientes de cada ingrediente, también de producción interna", async () => {
  const { lotes } = (await O.api.get("/api/produccion/ultimos-lotes")).body;
  const deHarina = lotes.filter((l) => l.producto_id === harina.id).map((l) => l.num_lote);
  assert.deepEqual(deHarina, ["H-4", "H-3", "H-2"]);
  assert.ok(lotes.some((l) => l.origen === "preparado" && l.num_lote === "BE-1"));
  assert.equal((await B.api.get("/api/produccion/ultimos-lotes")).body.lotes.length, 0, "cada obrador ve solo los suyos");
});

test("producción conjunta: internas y finales con columna interna y filtro", async () => {
  const f = await O.api.post("/api/producciones", {
    nuevo: { nombre: "Croquetas", unidad_medida: "kg", proceso_termico: false },
    fecha: "2026-10-14", num_lote: "CR-1", cantidad: 8, unidades: 240,
    ingredientes: [{ origen: "preparado", lote_id: bechamel.id, cantidad: 6 }, { origen: "manual", producto_id: harina.id, num_lote: "H-X", cantidad: 1 }],
  });
  assert.equal(f.status, 201, JSON.stringify(f.body));
  const todas = (await O.api.get("/api/produccion")).body.produccion;
  assert.deepEqual(todas.map((p) => [p.num_lote, p.interna]), [["CR-1", false], ["BE-1", true]]);
  assert.deepEqual((await O.api.get("/api/produccion?interna=1")).body.produccion.map((p) => p.num_lote), ["BE-1"]);
  assert.deepEqual((await O.api.get("/api/produccion?interna=0&q=cro")).body.produccion.map((p) => p.num_lote), ["CR-1"]);
  const pdf = await O.api.get("/api/informes/produccion?formato=pdf");
  assert.equal(pdf.status, 200);
  const xlsx = await O.api.get("/api/informes/produccion?formato=xlsx&interna=0");
  assert.equal(xlsx.status, 200);
  assert.match(xlsx.headers["content-disposition"], /produccion-final_/);
});

test("logotipo: el gestor lo sube (PNG o JPEG), se lee y sale en los informes", async () => {
  // PNG mínimo de 1×1 píxel
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const mal = await O.api.put("/api/obrador/logo", { nombre: "logo.png", mime_type: "image/png", base64: Buffer.from("no es imagen").toString("base64") });
  assert.equal(mal.status, 400);
  const r = await O.api.put("/api/obrador/logo", { nombre: "logo.png", mime_type: "image/png", base64: png.toString("base64") });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const me = (await O.api.get("/api/auth/me")).body;
  assert.equal(me.obrador.logo_id, r.body.logo_id);
  const img = await O.api.get("/api/obrador/logo");
  assert.equal(img.status, 200);
  assert.equal(img.headers["content-type"], "image/png");
  assert.equal((await B.api.get("/api/obrador/logo")).status, 404, "el otro obrador no lo ve");
  assert.equal((await O.api.get("/api/informes/entradas?formato=pdf")).status, 200);
  assert.equal((await O.api.get("/api/informes/entradas?formato=xlsx")).status, 200);
  assert.equal((await O.api.delete("/api/obrador/logo")).status, 204);
  assert.equal((await O.api.get("/api/obrador/logo")).status, 404);
});

test("una entrada se puede editar por completo, también el producto y la marca", async () => {
  const azucar = (await O.api.post("/api/catalogo/productos", { nombre: "Azúcar", unidad_medida: "kg" })).body.producto;
  const marca = (await O.api.post(`/api/catalogo/productos/${azucar.id}/marcas`, { nombre: "Azucarera", alergenos: [], trazas: ["sulfitos"] })).body.marca;
  assert.deepEqual(marca.trazas, ["sulfitos"]);
  const rec = (await O.api.post("/api/recepciones", { fecha: "2026-10-15", producto_id: leche.id, cantidad: 3, num_lote: "MAL-1" })).body.recepcion;
  const bech2 = (await O.api.post("/api/preparados", { producto_id: bechamel.producto_id, fecha: "2026-10-15", num_lote: "BE-2", cantidad: 2,
    ingredientes: [{ origen: "recepcion", lote_id: rec.id, cantidad: 1 }] })).body.preparado;
  // Marca de otro producto: no
  assert.equal((await O.api.patch(`/api/recepciones/${rec.id}`, { marca_id: marca.id })).status, 400);
  const r = await O.api.patch(`/api/recepciones/${rec.id}`, { producto_id: azucar.id, marca_id: marca.id, num_lote: "AZ-1", fecha: "2026-10-14", estado_entrada: "conforme_con_incidencia" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.recepcion.producto, "Azúcar");
  assert.equal(r.body.recepcion.unidad, "kg");
  assert.equal(r.body.recepcion.marca, "Azucarera");
  const det = (await O.api.get(`/api/preparados/${bech2.id}`)).body;
  assert.equal(det.ingredientes[0].producto, "Azúcar", "la trazabilidad sigue al lote corregido");
  assert.equal(det.ingredientes[0].num_lote, "AZ-1");
});

test("lista de ingredientes: orden por peso, % de los principales, composición de la marca, alérgenos y trazas", async () => {
  const pan = (await O.api.post("/api/catalogo/productos", { nombre: "Pan rallado", unidad_medida: "kg" })).body.producto;
  await O.api.post(`/api/catalogo/productos/${pan.id}/marcas`, { nombre: "Panes Sur", composicion: "Ingredientes: harina de trigo, agua, sal.", alergenos: ["gluten"], trazas: ["sesamo"] });
  const recPan = (await O.api.post("/api/recepciones", { fecha: "2026-10-16", producto_id: pan.id, marca_id: (await O.api.get("/api/catalogo/productos?tipo=materia_prima")).body.productos.find((p) => p.id === pan.id).marcas[0].id, cantidad: 10, num_lote: "PR-1" })).body.recepcion;
  const f = (await O.api.post("/api/producciones", {
    nuevo: { nombre: "Croquetas de pollo", unidad_medida: "kg", proceso_termico: false },
    fecha: "2026-10-16", num_lote: "CP-1", cantidad: 10,
    ingredientes: [
      { origen: "preparado", lote_id: bechamel.id, cantidad: 7 },
      { origen: "recepcion", lote_id: recPan.id, cantidad: 2 },
      { origen: "manual", producto_id: harina.id, num_lote: "", cantidad: 500 / 1000 },
      { origen: "manual", producto_id: leche.id, num_lote: "", cantidad: 0.5 },
    ],
  })).body.produccion;
  const d = (await O.api.get(`/api/producciones/${f.id}`)).body.declaracion;
  assert.equal(d.ajustada, null);
  assert.match(d.auto, /^Ingredientes: bechamel 70 % \(harina 85 %, leche 15 %\), pan rallado 20 % \(harina de trigo, agua, sal\), harina, leche\./);
  assert.match(d.auto, /Contiene: GLUTEN\./);
  assert.match(d.auto, /Puede contener trazas de: sésamo\./);
  // Se puede ajustar a mano y volver a la automática
  assert.equal((await O.api.patch(`/api/producciones/${f.id}`, { declaracion_ingredientes: "Ingredientes: a mano." })).status, 200);
  assert.equal((await O.api.get(`/api/producciones/${f.id}`)).body.declaracion.ajustada, "Ingredientes: a mano.");
  await O.api.patch(`/api/producciones/${f.id}`, { declaracion_ingredientes: null });
  assert.equal((await O.api.get(`/api/producciones/${f.id}`)).body.declaracion.ajustada, null);
});

test("al editar un lote se puede cambiar entre producción interna y final", async () => {
  // Bechamel (interna) ya se ha usado en croquetas: no puede pasar a final
  const no = await O.api.patch(`/api/preparados/${bechamel.id}`, { interna: false });
  assert.equal(no.status, 409);
  // Una final pasa a interna con sus ingredientes, y vuelve
  const cr = (await O.api.get("/api/produccion?interna=0&q=croquetas")).body.produccion.find((p) => p.num_lote === "CR-1");
  const a = await O.api.patch(`/api/producciones/${cr.id}`, { interna: true, cantidad: 9 });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.clase, "intermedia");
  assert.equal(a.body.preparado.cantidad, 9);
  const det = (await O.api.get(`/api/preparados/${cr.id}`)).body;
  assert.equal(det.ingredientes.length, 2);
  assert.equal((await O.api.get(`/api/producciones/${cr.id}`)).status, 404);
  const b = await O.api.patch(`/api/preparados/${cr.id}`, { interna: false, unidades: 200 });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.equal(b.body.produccion.unidades, 200);
  assert.equal((await O.api.get(`/api/producciones/${cr.id}`)).body.ingredientes.length, 2);
});

test("catálogo editable por completo: nombre, unidad (con conversión), marcas y proveedores", async () => {
  const sal = (await O.api.post("/api/catalogo/productos", { nombre: "Sal", unidad_medida: "kg" })).body.producto;
  const m = (await O.api.post(`/api/catalogo/productos/${sal.id}/marcas`, { nombre: "Salinas", precio_referencia: 0.8 })).body.marca;
  const prov = (await O.api.post("/api/catalogo/proveedores", { nombre: "Distribuciones Ana" })).body.proveedor;
  const rec = (await O.api.post("/api/recepciones", { fecha: "2026-10-20", producto_id: sal.id, marca_id: m.id, proveedor_id: prov.id, cantidad: 2, precio_total: 1.6, num_lote: "S-1" })).body.recepcion;
  // Nombres
  assert.equal((await O.api.patch(`/api/catalogo/productos/${sal.id}`, { nombre: "Sal marina" })).status, 200);
  assert.equal((await O.api.patch(`/api/catalogo/productos/${sal.id}`, { nombre: "Harina" })).status, 409, "nombre repetido");
  assert.equal((await O.api.patch(`/api/catalogo/marcas/${m.id}`, { nombre: "Salinas del Sur" })).status, 200);
  const p = await O.api.patch(`/api/catalogo/proveedores/${prov.id}`, { nombre: "Distribuciones Ana S.L.", cif: "B12345678" });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  // Unidad kg → g con registros: se convierten las cantidades y el precio por unidad
  assert.equal((await O.api.patch(`/api/catalogo/productos/${sal.id}`, { unidad_medida: "g" })).status, 200);
  const r = (await O.api.get(`/api/recepciones/${rec.id}`)).body.recepcion;
  assert.equal(r.cantidad, 2000);
  assert.equal(r.unidad, "g");
  assert.equal(r.precio_total, 1.6);
  assert.equal(r.marca, "Salinas del Sur");
  assert.equal(r.proveedor, "Distribuciones Ana S.L.");
  const marca = (await O.api.get("/api/catalogo/productos?tipo=materia_prima")).body.productos.find((x) => x.id === sal.id).marcas[0];
  assert.equal(marca.precio_referencia, 0.0008);
  // g → ud no se puede convertir: hay que confirmarlo
  const sinConfirmar = await O.api.patch(`/api/catalogo/productos/${sal.id}`, { unidad_medida: "ud" });
  assert.equal(sinConfirmar.status, 409);
  assert.equal(sinConfirmar.body.codigo, "unidad_sin_conversion");
  assert.equal((await O.api.patch(`/api/catalogo/productos/${sal.id}`, { unidad_medida: "ud", confirmar_unidad: true })).status, 200);
  // Un proveedor con entradas no se borra
  assert.equal((await O.api.delete(`/api/catalogo/proveedores/${prov.id}`)).status, 409);
});
