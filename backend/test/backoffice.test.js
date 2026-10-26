// Back office: acceso privado, resumen de clientes con LED, ficha completa y administradores.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app, request, baseLimpia, nuevoObrador, pool } from "./helpers.js";

process.env.SILENCIAR_CORREOS = "1";
const { hashPassword } = await import("../src/lib/utiles.js");
const cobros = await import("../src/lib/cobros.js");

let principal, alDia, moroso, pendiente;
const admin = (token) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${token}`),
  post: (u, b) => request(app).post(u).set("Authorization", `Bearer ${token}`).send(b ?? {}),
  patch: (u, b) => request(app).patch(u).set("Authorization", `Bearer ${token}`).send(b ?? {}),
});

before(async () => {
  await baseLimpia();
  await pool.query("INSERT INTO admins (email, nombre, password_hash, rol) VALUES ('juan@plataforma.test', 'Juan', $1, 'superadmin')", [
    await hashPassword("clave-del-administrador"),
  ]);
  const r = await request(app).post("/api/admin/login").send({ email: "juan@plataforma.test", password: "clave-del-administrador" });
  principal = admin(r.body.token);

  alDia = await nuevoObrador("Carnicería Al Día");
  await cobros.simularCobro(alDia.obrador.id);
  await cobros.simularCobro(alDia.obrador.id);
  moroso = await nuevoObrador("Pastelería Morosa");
  await cobros.simularCobro(moroso.obrador.id);
  await cobros.simularCobro(moroso.obrador.id, { fallido: true });
  pendiente = await nuevoObrador("Catering Pendiente");
  await pool.query("UPDATE obradores SET estado = 'pendiente_pago' WHERE id = $1", [pendiente.obrador.id]);
});
after(() => pool.end());

test("sin sesión de administrador no se ve nada", async () => {
  assert.equal((await request(app).get("/api/admin/clientes")).status, 401);
  // Un gestor de obrador no puede usar su sesión en el back office…
  assert.equal((await alDia.api.get("/api/admin/clientes")).status, 401);
});

test("…ni un administrador puede usar su sesión en la app de un obrador", async () => {
  const r = await request(app).post("/api/admin/login").send({ email: "juan@plataforma.test", password: "clave-del-administrador" });
  assert.equal((await request(app).get("/api/recepciones").set("Authorization", `Bearer ${r.body.token}`)).status, 401);
});

test("resumen de clientes con LED, importes y último acceso", async () => {
  const { clientes, totales } = (await principal.get("/api/admin/clientes")).body;
  const por = Object.fromEntries(clientes.map((c) => [c.nombre, c]));
  assert.equal(por["Carnicería Al Día"].led, "verde");
  assert.equal(por["Pastelería Morosa"].led, "rojo");
  assert.equal(por["Catering Pendiente"].led, "gris");
  assert.equal(clientes[0].led, "rojo", "los impagados salen primero");
  assert.equal(por["Carnicería Al Día"].pagado_12m, 59.8);
  assert.equal(por["Carnicería Al Día"].pagado_total, 59.8);
  assert.ok(por["Carnicería Al Día"].proximo_cobro);
  assert.ok(por["Carnicería Al Día"].ultimo_acceso, "el login cuenta como último acceso");
  assert.deepEqual([totales.verdes, totales.rojos, totales.grises], [1, 1, 1]);
  const rojos = (await principal.get("/api/admin/clientes?led=rojo")).body.clientes;
  assert.deepEqual(rojos.map((c) => c.nombre), ["Pastelería Morosa"]);
});

test("ficha completa del cliente con pagos, usuarios y correos", async () => {
  const f = (await principal.get(`/api/admin/clientes/${moroso.obrador.id}`)).body;
  assert.equal(f.obrador.nombre, "Pastelería Morosa");
  assert.equal(f.pagos.length, 2);
  assert.deepEqual(f.pagos.map((p) => p.estado).sort(), ["fallido", "pagado"]);
  assert.equal(f.usuarios[0].rol, "gestor");
  assert.ok(f.emails.some((e) => e.tipo === "impago_aviso"));
  assert.equal(f.suscripcion.stripe_customer_id, undefined, "no se exponen ids de Stripe");
});

test("reactivar a mano deja registro de la acción", async () => {
  const r = await principal.post(`/api/admin/clientes/${moroso.obrador.id}/estado`, { estado: "activo", motivo: "Pagado por transferencia" });
  assert.equal(r.status, 200);
  const f = (await principal.get(`/api/admin/clientes/${moroso.obrador.id}`)).body;
  assert.equal(f.resumen.led, "verde");
  assert.equal(f.acciones[0].accion, "reactivar");
  assert.equal(f.acciones[0].admin, "Juan");
});

test("el administrador principal puede crear otros administradores, que no gestionan administradores", async () => {
  const r = await principal.post("/api/admin/admins", { email: "ayudante@plataforma.test", nombre: "Ayudante" });
  assert.equal(r.status, 201);
  const login = await request(app).post("/api/admin/login").send({ email: "ayudante@plataforma.test", password: r.body.passwordTemporal });
  const ayudante = admin(login.body.token);
  assert.equal((await ayudante.get("/api/admin/clientes")).status, 200);
  assert.equal((await ayudante.get("/api/admin/admins")).status, 403);
  assert.equal((await principal.patch(`/api/admin/admins/${r.body.admin.id}`, { activo: false })).status, 200);
  assert.equal((await ayudante.get("/api/admin/clientes")).status, 401);
});
