// Alta con pago, correos automáticos e impagos (aviso, recordatorio a los
// 5 días, suspensión a los 10, reactivación al cobrar).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { app, request, baseLimpia, login, cliente, pool } from "./helpers.js";

process.env.SILENCIAR_CORREOS = "1";
const { config } = await import("../src/config.js");
const cobros = await import("../src/lib/cobros.js");

const DIA = 86400000;
const ALTA = {
  nombre: "Panadería La Espiga", sector: "panaderia", num_empleados: 6, registro_sanitario: "20.012345/TF",
  razon_social: "La Espiga Artesana, S.L.", cif: "b-12345678", direccion_fiscal: "C/ Mayor 12",
  codigo_postal: "38201", municipio: "San Cristóbal de La Laguna", provincia: "Santa Cruz de Tenerife",
  contacto_nombre: "Ana Pérez", telefono: "600 123 456", email_contacto: "ana@espiga.test",
  gestor_nombre: "Ana Pérez", gestor_email: "gestora@espiga.test", password: "una-contraseña-larga",
  usuarios_extra: 1, metodo: "sepa_debit", acepta_condiciones: true,
};

let obradorId;
const correos = async () =>
  (await pool.query("SELECT tipo FROM emails_enviados WHERE obrador_id = $1 ORDER BY creado_en", [obradorId])).rows.map((r) => r.tipo);
const estado = async () =>
  (await pool.query("SELECT o.estado, s.impago_desde FROM obradores o JOIN suscripciones s ON s.obrador_id = o.id WHERE o.id = $1", [obradorId])).rows[0];

before(baseLimpia);
after(() => pool.end());

test("el alta valida los datos de facturación", async () => {
  const r = await request(app).post("/api/alta").send({ ...ALTA, codigo_postal: "382" });
  assert.equal(r.status, 400);
  assert.equal(r.body.campo, "codigo_postal");
  const r2 = await request(app).post("/api/alta").send({ ...ALTA, acepta_condiciones: false });
  assert.equal(r2.status, 400);
});

test("alta completa: primer cobro → cuenta activa y correo de bienvenida con factura", async () => {
  assert.equal(config.pagosSimulados, true, "las pruebas usan pagos simulados");
  const r = await request(app).post("/api/alta").send(ALTA);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.importeMensual, 32.9);
  const { rows: [o] } = await pool.query("SELECT * FROM obradores WHERE razon_social = $1", [ALTA.razon_social]);
  obradorId = o.id;
  assert.equal(o.cif, "B12345678");
  assert.equal(o.municipio, ALTA.municipio);
  assert.equal((await estado()).estado, "activo");
  assert.deepEqual(await correos(), ["bienvenida"]);
  const token = await login(ALTA.gestor_email, ALTA.password);
  assert.equal((await cliente(token).get("/api/recepciones")).status, 200);
  // Plazas: básico (2) + 1 extra
  assert.equal((await cliente(token).get("/api/usuarios")).body.plazas.total, 3);
});

test("el mismo email no puede darse de alta dos veces", async () => {
  const r = await request(app).post("/api/alta").send({ ...ALTA, nombre: "Otra" });
  assert.equal(r.status, 409);
});

test("ciclo de impago: aviso, recordatorio a los 5 días y suspensión a los 10", async () => {
  const gestor = cliente(await login(ALTA.gestor_email, ALTA.password));
  const alta = await gestor.post("/api/usuarios", { email: "op@espiga.test", nombre: "Operario", rol: "operario" });
  const passOp = alta.body.passwordTemporal;

  const t0 = new Date();
  await cobros.simularCobro(obradorId, { fallido: true, fecha: t0 });
  assert.equal((await estado()).estado, "impago");
  assert.deepEqual(await correos(), ["bienvenida", "impago_aviso"]);
  // Durante el impago se sigue trabajando con normalidad
  assert.equal((await cliente(await login("op@espiga.test", passOp)).get("/api/recepciones")).status, 200);
  // Un segundo intento fallido de Stripe no repite el aviso
  await cobros.simularCobro(obradorId, { fallido: true });
  assert.deepEqual(await correos(), ["bienvenida", "impago_aviso"]);

  const impagoDesde = new Date((await estado()).impago_desde);
  assert.deepEqual(await cobros.revisarImpagos(new Date(impagoDesde.getTime() + 4 * DIA)), { recordatorios: 0, suspensiones: 0 });
  assert.deepEqual(await cobros.revisarImpagos(new Date(impagoDesde.getTime() + 5 * DIA)), { recordatorios: 1, suspensiones: 0 });
  assert.deepEqual(await cobros.revisarImpagos(new Date(impagoDesde.getTime() + 6 * DIA)), { recordatorios: 0, suspensiones: 0 });
  assert.deepEqual(await cobros.revisarImpagos(new Date(impagoDesde.getTime() + 10 * DIA)), { recordatorios: 0, suspensiones: 1 });
  assert.equal((await estado()).estado, "suspendido");
  assert.deepEqual(await correos(), ["bienvenida", "impago_aviso", "impago_recordatorio", "suspension"]);

  // En suspenso: el operario no entra; el gestor entra solo para regularizar
  const rOp = await request(app).post("/api/auth/login").send({ email: "op@espiga.test", password: passOp });
  assert.equal(rOp.status, 402);
  const g = cliente(await login(ALTA.gestor_email, ALTA.password));
  assert.equal((await g.get("/api/recepciones")).status, 402);
  const me = (await g.get("/api/auth/me")).body;
  assert.equal(me.obrador.estado, "suspendido");
  assert.equal((await g.get("/api/obrador")).status, 200);
});

test("al cobrarse la deuda la cuenta se reactiva sola y se envía la factura", async () => {
  await cobros.simularCobro(obradorId);
  const e = await estado();
  assert.equal(e.estado, "activo");
  assert.equal(e.impago_desde, null);
  assert.equal((await correos()).at(-1), "factura");
  const g = cliente(await login(ALTA.gestor_email, ALTA.password));
  assert.equal((await g.get("/api/recepciones")).status, 200);
  // Un nuevo impago empieza una racha nueva (nuevo aviso)
  await cobros.simularCobro(obradorId, { fallido: true });
  assert.equal((await correos()).at(-1), "impago_aviso");
  await cobros.simularCobro(obradorId);
});

test("avisos firmados de Stripe: cobro correcto, repetido y firma falsa", async () => {
  const real = new Stripe("sk_test_falsa");
  config.stripe.webhookSecret = "whsec_pruebas";
  cobros._usarStripe({
    webhooks: real.webhooks,
    subscriptions: {
      retrieve: async () => ({ default_payment_method: { type: "card", card: { brand: "visa", last4: "4242", exp_month: 3, exp_year: 2029 } } }),
    },
  });
  await pool.query("UPDATE suscripciones SET stripe_customer_id = 'cus_prueba' WHERE obrador_id = $1", [obradorId]);
  const ahora = Math.floor(Date.now() / 1000);
  const evento = {
    id: "evt_1", object: "event", type: "invoice.paid",
    data: { object: {
      id: "in_1", object: "invoice", customer: "cus_prueba", number: "F-2026-0001", currency: "eur",
      amount_paid: 3981, amount_due: 3981, subtotal: 3290, total: 3981, attempt_count: 1,
      hosted_invoice_url: "https://pay.stripe.com/invoice/x", invoice_pdf: "https://pay.stripe.com/invoice/x/pdf",
      status_transitions: { paid_at: ahora },
      lines: { data: [{ period: { start: ahora, end: ahora + 30 * 86400 } }] },
      parent: { subscription_details: { subscription: "sub_1" } },
    } },
  };
  const cuerpo = JSON.stringify(evento);
  const firma = real.webhooks.generateTestHeaderString({ payload: cuerpo, secret: "whsec_pruebas" });
  const enviar = (f) => request(app).post("/api/stripe/webhook").set("Content-Type", "application/json").set("Stripe-Signature", f).send(cuerpo);

  const r1 = await enviar(firma);
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.resultado, "ok");
  assert.equal((await enviar(firma)).body.resultado, "repetido");
  assert.equal((await enviar("t=1,v1=falsa")).status, 400);

  const { rows: [p] } = await pool.query("SELECT * FROM pagos WHERE stripe_invoice_id = 'in_1'");
  assert.equal(p.importe, 39.81);
  assert.equal(p.impuestos, 6.91);
  assert.equal(p.numero_factura, "F-2026-0001");
  const { rows: [s] } = await pool.query("SELECT metodo_pago_resumen FROM suscripciones WHERE obrador_id = $1", [obradorId]);
  assert.equal(s.metodo_pago_resumen, "Visa ···4242 (caduca 03/2029)");
  cobros._usarStripe(null);
  config.stripe.webhookSecret = null;
});
