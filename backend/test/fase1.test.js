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
