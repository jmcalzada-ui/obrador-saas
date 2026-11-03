// Salidas de lotes a clientes: módulo opcional que activa el gestor.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { baseLimpia, nuevoObrador, pool } from "./helpers.js";
import { config } from "../src/config.js";

let O, B, harina, croquetas, lotes = [], cliente;

before(async () => {
  config.controlStock = false;
  await baseLimpia();
  O = await nuevoObrador("Obrador con salidas");
  B = await nuevoObrador("Otro obrador");
  harina = (await O.api.post("/api/catalogo/productos", { nombre: "Harina", unidad_medida: "kg" })).body.producto;
  for (const [i, f] of ["2026-10-01", "2026-10-05", "2026-10-09", "2026-10-12"].entries()) {
    const r = await O.api.post("/api/producciones", {
      ...(croquetas ? { producto_id: croquetas } : { nuevo: { nombre: "Croquetas de jamón", unidad_medida: "kg", proceso_termico: false } }),
      fecha: f, num_lote: `CR-${i + 1}`, cantidad: 10, unidades: 50, unidades_tipo: "bandejas",
      ingredientes: [{ origen: "manual", producto_id: harina.id, num_lote: "", cantidad: 1 }],
    });
    croquetas = r.body.produccion.producto_id;
    lotes.push(r.body.produccion);
  }
});
after(() => pool.end());

test("desactivado por defecto: no se puede usar hasta que el gestor lo active", async () => {
  assert.equal((await O.api.get("/api/auth/me")).body.obrador.modulo_salidas, false);
  assert.equal((await O.api.get("/api/salidas")).status, 403);
  const r = await O.api.patch("/api/obrador", { modulo_salidas: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await O.api.get("/api/auth/me")).body.obrador.modulo_salidas, true);
  assert.equal((await B.api.get("/api/salidas")).status, 403, "el otro obrador sigue sin él");
});

test("clientes y nº de pedido propuesto", async () => {
  const r = await O.api.post("/api/clientes", { nombre: "Restaurante El Puerto", cif: "B11111111" });
  assert.equal(r.status, 201);
  cliente = r.body.cliente;
  assert.equal((await O.api.post("/api/clientes", { nombre: "restaurante el puerto" })).status, 409);
  const { num_pedido } = (await O.api.get("/api/salidas/siguiente-pedido?fecha=2026-10-15")).body;
  assert.equal(num_pedido, "P-261015-1");
});

test("últimos 3 lotes de cada producto para elegir en la salida", async () => {
  const { lotes: l } = (await O.api.get("/api/salidas/ultimos-lotes")).body;
  assert.deepEqual(l.filter((x) => x.producto_id === croquetas).map((x) => x.num_lote), ["CR-4", "CR-3", "CR-2"]);
});

test("registrar, editar y borrar una salida; el lote muestra a qué cliente ha salido", async () => {
  const sinLineas = await O.api.post("/api/salidas", { fecha: "2026-10-15", num_pedido: "P-261015-1", cliente_id: cliente.id, lineas: [] });
  assert.equal(sinLineas.status, 400);
  const r = await O.api.post("/api/salidas", {
    fecha: "2026-10-15", num_pedido: "P-261015-1", cliente_id: cliente.id,
    lineas: [
      { producto_id: croquetas, origen: "produccion", lote_id: lotes[3].id, cantidad: 12, unidad: "bandejas" },
      { producto_id: harina.id, origen: "manual", num_lote: "H-77", cantidad: 5, unidad: "kg" },
    ],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const s = r.body.salida;
  assert.equal(s.cliente, "Restaurante El Puerto");
  assert.equal(s.lineas[0].num_lote, "CR-4");
  assert.equal(s.lineas[0].origen, "produccion");
  assert.equal((await O.api.post("/api/salidas", { fecha: "2026-10-15", num_pedido: "p-261015-1", cliente_id: cliente.id, lineas: [{ producto_id: harina.id, cantidad: 1 }] })).status, 409, "nº de pedido repetido");
  // Trazabilidad hacia delante en la ficha del lote
  const det = (await O.api.get(`/api/producciones/${lotes[3].id}`)).body;
  assert.equal(det.salidas.length, 1);
  assert.equal(det.salidas[0].cliente, "Restaurante El Puerto");
  // Un lote que ha salido no se puede borrar
  assert.equal((await O.api.delete(`/api/producciones/${lotes[3].id}`)).status, 409);
  // Lupa por lote y por cliente
  assert.equal((await O.api.get("/api/salidas?q=CR-4")).body.salidas.length, 1);
  assert.equal((await O.api.get("/api/salidas?q=puerto")).body.salidas.length, 1);
  assert.equal((await O.api.get("/api/salidas?q=xyz")).body.salidas.length, 0);
  // Editar: cambiar el lote de la línea
  const e = await O.api.patch(`/api/salidas/${s.id}`, { lineas: [{ producto_id: croquetas, origen: "produccion", lote_id: lotes[2].id, cantidad: 10, unidad: "bandejas" }] });
  assert.equal(e.status, 200, JSON.stringify(e.body));
  assert.equal(e.body.salida.lineas.length, 1);
  assert.equal(e.body.salida.lineas[0].num_lote, "CR-3");
  assert.equal((await O.api.get(`/api/producciones/${lotes[3].id}`)).body.salidas.length, 0);
  // Informes
  assert.equal((await O.api.get("/api/informes/salidas?formato=pdf")).status, 200);
  assert.equal((await O.api.get("/api/informes/salidas?formato=xlsx")).status, 200);
  // Un cliente con salidas no se borra
  assert.equal((await O.api.delete(`/api/clientes/${cliente.id}`)).status, 409);
  assert.equal((await O.api.delete(`/api/salidas/${s.id}`)).status, 204);
  // Aislamiento: el otro obrador no ve nada
  assert.equal((await B.api.get(`/api/producciones/${lotes[2].id}`)).status, 404);
});
