// Plazas del plan básico (gestor + 1) y permisos de cada rol.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { baseLimpia, nuevoObrador, login, cliente, pool } from "./helpers.js";
import { config } from "../src/config.js";

let O, producto;
const cuentas = {};

before(async () => {
  await baseLimpia();
  O = await nuevoObrador("Obrador roles");
  producto = (await O.api.post("/api/catalogo/productos", { nombre: "Aceite de oliva" })).body.producto;
});

after(() => pool.end());

async function entrar(email, passwordTemporal) {
  return cliente(await login(email, passwordTemporal));
}

test("el plan básico incluye al gestor y una cuenta más", async () => {
  const r1 = await O.api.post("/api/usuarios", { email: "jefe@roles.test", nombre: "Jefa", rol: "jefe_produccion" });
  assert.equal(r1.status, 201);
  assert.ok(r1.body.passwordTemporal.length >= 10);
  cuentas.jefe = await entrar("jefe@roles.test", r1.body.passwordTemporal);

  const r2 = await O.api.post("/api/usuarios", { email: "op@roles.test", nombre: "Operario", rol: "operario" });
  assert.equal(r2.status, 402);
  assert.equal(r2.body.codigo, "sin_plazas");
});

test("con un usuario extra contratado se puede añadir otro", async () => {
  await pool.query("UPDATE suscripciones SET usuarios_extra = 2 WHERE obrador_id = $1", [O.obrador.id]);
  const op = await O.api.post("/api/usuarios", { email: "op@roles.test", nombre: "Operario", rol: "operario" });
  const ob = await O.api.post("/api/usuarios", { email: "obs@roles.test", nombre: "Observador", rol: "observador" });
  assert.equal(op.status, 201);
  assert.equal(ob.status, 201, "el observador también ocupa plaza, pero hay 2 extra");
  cuentas.operario = await entrar("op@roles.test", op.body.passwordTemporal);
  cuentas.observador = await entrar("obs@roles.test", ob.body.passwordTemporal);
  const lista = (await O.api.get("/api/usuarios")).body;
  assert.equal(lista.plazas.total, 4);
  assert.equal(lista.plazas.ocupadas, 4);
});

test("no se puede crear un segundo gestor ni repetir email", async () => {
  await pool.query("UPDATE suscripciones SET usuarios_extra = 5 WHERE obrador_id = $1", [O.obrador.id]);
  assert.equal((await O.api.post("/api/usuarios", { email: "otro@roles.test", nombre: "X", rol: "gestor" })).status, 400);
  assert.equal((await O.api.post("/api/usuarios", { email: "OP@roles.test", nombre: "X", rol: "operario" })).status, 409);
});

test("operario registra pero no edita; jefe de producción sí edita", async () => {
  const alta = await cuentas.operario.post("/api/recepciones", {
    fecha: "2026-10-26", producto_id: producto.id, cantidad: 5, unidad: "l", num_lote: "OP-1",
  });
  assert.equal(alta.status, 201);
  assert.equal(alta.body.recepcion.creado_por_nombre, "Operario");
  const id = alta.body.recepcion.id;
  assert.equal((await cuentas.operario.patch(`/api/recepciones/${id}`, { num_lote: "OP-2" })).status, 403);
  const ed = await cuentas.jefe.patch(`/api/recepciones/${id}`, { num_lote: "OP-2" });
  assert.equal(ed.status, 200);
  assert.equal(ed.body.recepcion.modificado_por_nombre, "Jefa");
  assert.equal((await cuentas.jefe.delete(`/api/recepciones/${id}`)).status, 403, "borrar es solo del gestor");
});

test("el observador solo consulta", async () => {
  assert.equal((await cuentas.observador.get("/api/recepciones")).status, 200);
  assert.equal(
    (await cuentas.observador.post("/api/recepciones", { fecha: "2026-10-26", producto_id: producto.id, cantidad: 1, unidad: "l" })).status,
    403
  );
  assert.equal((await cuentas.observador.get("/api/usuarios")).status, 403);
});

test("al desactivar a un usuario pierde el acceso al momento", async () => {
  const { usuarios } = (await O.api.get("/api/usuarios")).body;
  const obs = usuarios.find((u) => u.rol === "observador");
  assert.equal((await O.api.patch(`/api/usuarios/${obs.id}`, { activo: false })).status, 200);
  assert.equal((await cuentas.observador.get("/api/recepciones")).status, 401);
});

test("el gestor no puede desactivarse ni cambiar su rol", async () => {
  assert.equal((await O.api.patch(`/api/usuarios/${O.gestor.id}`, { activo: false })).status, 400);
  assert.equal((await O.api.patch(`/api/usuarios/${O.gestor.id}`, { rol: "operario" })).status, 400);
});

test("/me devuelve permisos y plan", async () => {
  const me = (await cuentas.operario.get("/api/auth/me")).body;
  assert.equal(me.usuario.rol, "operario");
  assert.deepEqual(me.usuario.permisos, ["ver", "registrar"]);
  assert.equal(me.obrador.plan, "basico");
});

test("una recepción con consumos no se puede borrar ni rebajar por debajo de lo usado", async () => {
  const rec = (await O.api.post("/api/recepciones", { fecha: "2026-10-26", producto_id: producto.id, cantidad: 10, unidad: "l", num_lote: "C-1" })).body.recepcion;
  // Simula un uso del lote (los preparados/producciones llegan en la siguiente fase).
  const prep = (await O.api.post("/api/catalogo/productos", { nombre: "Bechamel base", tipo: "preparado", unidad_medida: "kg" })).body.producto;
  await pool.query(
    `WITH p AS (INSERT INTO preparados (obrador_id, fecha, producto_id, num_lote, cantidad, unidad)
                VALUES ($1, '2026-10-26', $2, 'BECH-1', 20, 'kg') RETURNING id)
     INSERT INTO consumos (obrador_id, preparado_id, origen_recepcion, producto_id, num_lote, cantidad, unidad)
     SELECT $1, p.id, $3, $4, 'C-1', 4, 'l' FROM p`,
    [O.obrador.id, prep.id, rec.id, producto.id]
  );
  const detalle = (await O.api.get(`/api/recepciones/${rec.id}`)).body;
  assert.equal(detalle.recepcion.disponible, 6);
  assert.equal(detalle.usos[0].lote_destino, "BECH-1");
  // Con control de stock (fase 2) no se puede rebajar por debajo de lo usado; sin él (fase 1), sí.
  config.controlStock = true;
  assert.equal((await O.api.patch(`/api/recepciones/${rec.id}`, { cantidad: 3 })).status, 409);
  config.controlStock = false;
  assert.equal((await O.api.patch(`/api/recepciones/${rec.id}`, { cantidad: 3 })).status, 200);
  assert.equal((await O.api.delete(`/api/recepciones/${rec.id}`)).status, 409);
});
