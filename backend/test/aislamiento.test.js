// Prueba clave del servicio: un obrador NUNCA puede ver ni tocar los
// datos de otro, ni por la API ni aunque una consulta olvide filtrar.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { baseLimpia, nuevoObrador, pool } from "./helpers.js";

const { enObrador } = await import("../src/db/pool.js");

let A, B, prodA, prodB, recA;

before(async () => {
  await baseLimpia();
  A = await nuevoObrador("Obrador A");
  B = await nuevoObrador("Obrador B");
  prodA = (await A.api.post("/api/catalogo/productos", { nombre: "Harina de arroz" })).body.producto;
  prodB = (await B.api.post("/api/catalogo/productos", { nombre: "Leche entera" })).body.producto;
  recA = (
    await A.api.post("/api/recepciones", { fecha: "2026-10-20", producto_id: prodA.id, cantidad: 25, unidad: "kg", num_lote: "L-A1" })
  ).body.recepcion;
  await B.api.post("/api/recepciones", { fecha: "2026-10-21", producto_id: prodB.id, cantidad: 10, unidad: "l", num_lote: "L-B1" });
});

after(() => pool.end());

test("cada obrador solo ve su catálogo y sus recepciones", async () => {
  const pa = (await A.api.get("/api/catalogo/productos")).body.productos;
  const pb = (await B.api.get("/api/catalogo/productos")).body.productos;
  assert.deepEqual(pa.map((p) => p.nombre), ["Harina de arroz"]);
  assert.deepEqual(pb.map((p) => p.nombre), ["Leche entera"]);
  const ra = (await A.api.get("/api/recepciones")).body.recepciones;
  assert.equal(ra.length, 1);
  assert.equal(ra[0].num_lote, "L-A1");
});

test("B no puede leer, editar ni borrar una recepción de A conociendo su id", async () => {
  assert.equal((await B.api.get(`/api/recepciones/${recA.id}`)).status, 404);
  assert.equal((await B.api.patch(`/api/recepciones/${recA.id}`, { num_lote: "HACK" })).status, 404);
  assert.equal((await B.api.delete(`/api/recepciones/${recA.id}`)).status, 404);
  const sigue = (await A.api.get(`/api/recepciones/${recA.id}`)).body.recepcion;
  assert.equal(sigue.num_lote, "L-A1");
});

test("B no puede registrar una recepción con un producto de A", async () => {
  const r = await B.api.post("/api/recepciones", { fecha: "2026-10-22", producto_id: prodA.id, cantidad: 1, unidad: "kg" });
  assert.notEqual(r.status, 201);
  assert.equal((await A.api.get("/api/recepciones")).body.recepciones.length, 1);
});

test("B no puede tocar productos ni usuarios de A", async () => {
  assert.equal((await B.api.patch(`/api/catalogo/productos/${prodA.id}`, { nombre: "X" })).status, 404);
  assert.equal((await B.api.delete(`/api/catalogo/productos/${prodA.id}`)).status, 404);
  assert.equal((await B.api.patch(`/api/usuarios/${A.gestor.id}`, { nombre: "X" })).status, 404);
  const usuariosB = (await B.api.get("/api/usuarios")).body.usuarios;
  assert.ok(usuariosB.every((u) => u.email !== A.email));
});

test("a nivel de base de datos: una consulta sin filtro solo devuelve el obrador activo", async () => {
  const filas = await enObrador(B.obrador.id, async (c) => (await c.query("SELECT num_lote FROM recepciones")).rows);
  assert.deepEqual(filas.map((f) => f.num_lote), ["L-B1"]);
  const stock = await enObrador(B.obrador.id, async (c) => (await c.query("SELECT * FROM stock_lotes")).rows);
  assert.equal(stock.length, 1);
});

test("a nivel de base de datos: no se puede insertar en nombre de otro obrador", async () => {
  await assert.rejects(
    enObrador(B.obrador.id, (c) =>
      c.query("INSERT INTO productos (obrador_id, nombre) VALUES ($1, 'Intruso')", [A.obrador.id])
    ),
    /row-level security/
  );
});

test("a nivel de base de datos: sin obrador fijado no se ve nada", async () => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN; SET LOCAL ROLE app_runtime");
    const { rows } = await c.query("SELECT count(*)::int AS n FROM recepciones");
    assert.equal(rows[0].n, 0);
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
});

test("un obrador no puede cambiarse la suscripción a sí mismo", async () => {
  await assert.rejects(
    enObrador(A.obrador.id, (c) => c.query("UPDATE suscripciones SET usuarios_extra = 99")),
    /permission denied/
  );
});
