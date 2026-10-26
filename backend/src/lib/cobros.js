// Ciclo de cobro de las suscripciones:
//  · alta → página de pago segura de Stripe (tarjeta o domiciliación SEPA)
//  · cobro correcto → cuenta activa + correo con factura
//  · cobro fallido → aviso inmediato; a los 5 días recordatorio; a los 10 días suspensión
//  · cobro correcto tras un impago → reactivación automática
import Stripe from "stripe";
import { config } from "../config.js";
import { comoSistema } from "../db/pool.js";
import { enviarCorreo } from "./correo.js";

let stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey) : null;
/** Solo para pruebas: permite sustituir el cliente de Stripe. */
export function _usarStripe(cliente) { stripe = cliente; }
export const stripeActivo = () => Boolean(stripe);

const r2 = (n) => Math.round(n * 100) / 100;

export const MODULOS_COMPLETO = ["escandallos", "appcc_temperaturas"];

/**
 * Precio por periodo (mes o año), su equivalente mensual y lo que costaría
 * pagando mes a mes (para mostrar el ahorro).
 *   básico mensual   29,90 + 3 × usuarios extra
 *   básico anual     299 (2 meses gratis) + 30 × usuarios extra
 *   completo anual   539 (3 meses gratis) + 30 × usuarios extra — solo anual
 */
export function calcularImporte({ plan = "basico", usuarios_extra = 0, periodicidad = "mensual" }) {
  const t = config.tarifas;
  const n = usuarios_extra || 0;
  const mensualCompleto = t.basico + t.escandallos + t.appcc;
  if (plan === "completo") {
    const periodo = r2(t.anual.completo + n * t.anual.usuarioExtra);
    return { plan, periodicidad: "anual", periodo, mensual: r2(periodo / 12), sinDescuento: r2((mensualCompleto + n * t.usuarioExtra) * 12) };
  }
  if (periodicidad === "anual") {
    const periodo = r2(t.anual.basico + n * t.anual.usuarioExtra);
    return { plan, periodicidad, periodo, mensual: r2(periodo / 12), sinDescuento: r2((t.basico + n * t.usuarioExtra) * 12) };
  }
  const periodo = r2(t.basico + n * t.usuarioExtra);
  return { plan, periodicidad, periodo, mensual: periodo, sinDescuento: r2(periodo * 12) };
}
export const importeMensual = (s) => calcularImporte(s).mensual;

const DIA = 86400000;
const deUnix = (s) => (s ? new Date(s * 1000) : null);

async function datosObrador(c, obradorId) {
  const { rows: [obrador] } = await c.query("SELECT * FROM obradores WHERE id = $1", [obradorId]);
  const { rows: [suscripcion] } = await c.query("SELECT * FROM suscripciones WHERE obrador_id = $1", [obradorId]);
  const { rows: [gestor] } = await c.query("SELECT id, nombre, email FROM usuarios WHERE obrador_id = $1 AND rol = 'gestor'", [obradorId]);
  return { obrador, suscripcion, gestor };
}
const destinatario = (d) => d.obrador.email_facturacion || d.obrador.email_contacto || d.gestor.email;

// ---------------------------------------------------------------------
// Alta: sesión de pago
// ---------------------------------------------------------------------
export async function crearSesionPago({ obradorId, metodo }) {
  const d = await comoSistema((c) => datosObrador(c, obradorId));
  if (config.pagosSimulados) {
    // Desarrollo sin Stripe: el primer cobro se da por bueno al momento.
    await simularCobro(obradorId);
    return { url: `${config.urlPublica}/alta/completada?simulado=1` };
  }
  if (!stripe) {
    throw Object.assign(new Error("Los pagos todavía no están configurados."), { status: 503 });
  }
  let customerId = d.suscripcion.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: d.obrador.razon_social || d.obrador.nombre,
      email: destinatario(d),
      phone: d.obrador.telefono || undefined,
      preferred_locales: ["es"],
      address: {
        line1: d.obrador.direccion_fiscal || undefined,
        postal_code: d.obrador.codigo_postal || undefined,
        city: d.obrador.municipio || undefined,
        state: d.obrador.provincia || undefined,
        country: d.obrador.pais || "ES",
      },
      metadata: { obrador_id: obradorId },
    });
    customerId = customer.id;
    if (d.obrador.cif) {
      await stripe.customers.createTaxId(customerId, { type: "es_cif", value: d.obrador.cif }).catch(() => {});
    }
    await comoSistema((c) => c.query("UPDATE suscripciones SET stripe_customer_id = $2 WHERE obrador_id = $1", [obradorId, customerId]));
  }
  const anual = d.suscripcion.periodicidad === "anual";
  const P = config.stripe.precios;
  const precioBase = d.suscripcion.plan === "completo" ? P.completoAnual : anual ? P.basicoAnual : P.basico;
  const precioExtra = anual ? P.usuarioExtraAnual : P.usuarioExtra;
  if (!precioBase) throw Object.assign(new Error("Este plan todavía no está configurado para el pago."), { status: 503 });
  const items = [{ price: precioBase, quantity: 1 }];
  if (d.suscripcion.usuarios_extra > 0 && precioExtra) items.push({ price: precioExtra, quantity: d.suscripcion.usuarios_extra });
  const sesion = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: obradorId,
    line_items: items,
    payment_method_types: [metodo === "sepa_debit" ? "sepa_debit" : "card"],
    subscription_data: { metadata: { obrador_id: obradorId } },
    locale: "es",
    success_url: `${config.urlPublica}/alta/completada?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.urlPublica}/alta?cancelado=1`,
  });
  return { url: sesion.url };
}

/** Portal de Stripe para que el gestor cambie tarjeta o cuenta bancaria. */
export async function crearSesionPortal(obradorId) {
  const s = await comoSistema(async (c) => (await c.query("SELECT stripe_customer_id FROM suscripciones WHERE obrador_id = $1", [obradorId])).rows[0]);
  if (!stripe || !s?.stripe_customer_id) {
    throw Object.assign(new Error("La gestión de la forma de pago no está disponible todavía."), { status: 503 });
  }
  const portal = await stripe.billingPortal.sessions.create({
    customer: s.stripe_customer_id,
    return_url: `${config.urlPublica}/#/mas/obrador`,
    locale: "es",
  });
  return { url: portal.url };
}

// ---------------------------------------------------------------------
// Avisos de Stripe (webhooks)
// ---------------------------------------------------------------------
export function verificarEvento(cuerpo, firma) {
  if (!stripe || !config.stripe.webhookSecret) throw Object.assign(new Error("Webhook no configurado."), { status: 503 });
  return stripe.webhooks.constructEvent(cuerpo, firma, config.stripe.webhookSecret);
}

async function obradorDeCliente(customerId) {
  return comoSistema(async (c) => (await c.query("SELECT obrador_id FROM suscripciones WHERE stripe_customer_id = $1", [customerId])).rows[0]?.obrador_id);
}

const idSuscripcion = (inv) =>
  inv.subscription || inv.parent?.subscription_details?.subscription || null;

/** Convierte una factura de Stripe en nuestra fila de pagos. */
function pagoDesdeFactura(inv, estado) {
  const linea = inv.lines?.data?.[0];
  return {
    stripe_invoice_id: inv.id,
    numero_factura: inv.number || null,
    importe: (estado === "pagado" ? inv.amount_paid : inv.amount_due) / 100,
    base_imponible: inv.subtotal != null ? inv.subtotal / 100 : null,
    impuestos: inv.total != null && inv.subtotal != null ? (inv.total - inv.subtotal) / 100 : null,
    moneda: inv.currency || "eur",
    estado,
    intentos: inv.attempt_count || 1,
    periodo_desde: deUnix(linea?.period?.start),
    periodo_hasta: deUnix(linea?.period?.end),
    url_factura: inv.hosted_invoice_url || null,
    url_pdf: inv.invoice_pdf || null,
    pagado_en: estado === "pagado" ? deUnix(inv.status_transitions?.paid_at) || new Date() : null,
  };
}

export async function procesarEvento(evento) {
  // Stripe puede repetir avisos: cada evento se procesa una sola vez.
  const nuevo = await comoSistema(async (c) =>
    (await c.query("INSERT INTO stripe_eventos (id, tipo) VALUES ($1, $2) ON CONFLICT DO NOTHING", [evento.id, evento.type])).rowCount > 0
  );
  if (!nuevo) return "repetido";
  try {
    return await tratarEvento(evento);
  } catch (e) {
    // Si falla, se olvida el evento para que el reintento de Stripe lo procese.
    await comoSistema((c) => c.query("DELETE FROM stripe_eventos WHERE id = $1", [evento.id])).catch(() => {});
    throw e;
  }
}

async function tratarEvento(evento) {
  const o = evento.data.object;

  switch (evento.type) {
    case "checkout.session.completed": {
      const obradorId = o.client_reference_id;
      if (!obradorId) return "ignorado";
      await comoSistema((c) =>
        c.query("UPDATE suscripciones SET stripe_customer_id = COALESCE(stripe_customer_id, $2), stripe_subscription_id = $3 WHERE obrador_id = $1", [
          obradorId, o.customer, o.subscription,
        ])
      );
      await actualizarMetodoPago(obradorId, o.subscription);
      // Domiciliación: el cobro tarda unos días en confirmarse. Se da acceso
      // ya, al aceptar el mandato; si luego el cobro falla, entra el ciclo de impago.
      if (o.payment_status !== "paid") await activarPorMandato(obradorId, o.id);
      return "ok";
    }
    case "invoice.paid": {
      const obradorId = await obradorDeCliente(o.customer);
      if (!obradorId) return "ignorado";
      await alCobroCorrecto(obradorId, pagoDesdeFactura(o, "pagado"));
      await actualizarMetodoPago(obradorId, idSuscripcion(o));
      return "ok";
    }
    case "invoice.payment_failed": {
      const obradorId = await obradorDeCliente(o.customer);
      if (!obradorId) return "ignorado";
      await alFalloCobro(obradorId, pagoDesdeFactura(o, "fallido"));
      return "ok";
    }
    case "customer.subscription.updated": {
      const obradorId = await obradorDeCliente(o.customer);
      if (obradorId) await actualizarMetodoPago(obradorId, o.id);
      return "ok";
    }
    case "customer.subscription.deleted": {
      const obradorId = await obradorDeCliente(o.customer);
      if (!obradorId) return "ignorado";
      await comoSistema(async (c) => {
        await c.query("UPDATE suscripciones SET estado = 'cancelada', proximo_cobro = NULL, actualizado_en = now() WHERE obrador_id = $1", [obradorId]);
        await c.query("UPDATE obradores SET estado = 'baja' WHERE id = $1", [obradorId]);
      });
      return "ok";
    }
    default:
      return "ignorado";
  }
}

/** Acceso al aceptar el mandato SEPA, antes de que se confirme el primer cobro. */
export async function activarPorMandato(obradorId, referencia) {
  const d = await comoSistema(async (c) => {
    const { rowCount } = await c.query(
      `UPDATE suscripciones SET estado = 'activa', contratado_en = COALESCE(contratado_en, now()), activado_por_mandato = true,
              metodo_pago_tipo = COALESCE(metodo_pago_tipo, 'sepa_debit'), actualizado_en = now()
        WHERE obrador_id = $1 AND contratado_en IS NULL`,
      [obradorId]
    );
    if (!rowCount) return null; // ya estaba activo
    await c.query("UPDATE obradores SET estado = 'activo' WHERE id = $1 AND estado = 'pendiente_pago'", [obradorId]);
    return datosObrador(c, obradorId);
  });
  if (!d) return;
  await enviarCorreo({ tipo: "bienvenida", referencia: `mandato:${referencia}`, obradorId, para: destinatario(d), datos: { ...d, pago: null } });
}

/** Guarda "Visa ···4242" o "Domiciliación ···1234" (nunca el número completo). */
async function actualizarMetodoPago(obradorId, subscriptionId) {
  if (!stripe || !subscriptionId) return;
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["default_payment_method"] });
    const pm = sub.default_payment_method;
    if (!pm || typeof pm === "string") return;
    let tipo = null;
    let resumen = null;
    if (pm.type === "card") {
      tipo = "card";
      const marca = pm.card.brand ? pm.card.brand[0].toUpperCase() + pm.card.brand.slice(1) : "Tarjeta";
      resumen = `${marca} ···${pm.card.last4} (caduca ${String(pm.card.exp_month).padStart(2, "0")}/${pm.card.exp_year})`;
    } else if (pm.type === "sepa_debit") {
      tipo = "sepa_debit";
      resumen = `Domiciliación SEPA ···${pm.sepa_debit.last4}`;
    }
    if (tipo) {
      await comoSistema((c) =>
        c.query("UPDATE suscripciones SET metodo_pago_tipo = $2, metodo_pago_resumen = $3, stripe_subscription_id = COALESCE(stripe_subscription_id, $4) WHERE obrador_id = $1", [
          obradorId, tipo, resumen, subscriptionId,
        ])
      );
    }
  } catch (e) {
    console.error("[cobros] no se pudo leer la forma de pago:", e.message);
  }
}

async function guardarPago(c, obradorId, p) {
  await c.query(
    `INSERT INTO pagos (obrador_id, stripe_invoice_id, numero_factura, importe, base_imponible, impuestos, moneda, estado,
                        intentos, periodo_desde, periodo_hasta, url_factura, url_pdf, pagado_en)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (stripe_invoice_id) DO UPDATE SET
       numero_factura = EXCLUDED.numero_factura, importe = EXCLUDED.importe, estado = EXCLUDED.estado,
       intentos = EXCLUDED.intentos, url_factura = EXCLUDED.url_factura, url_pdf = EXCLUDED.url_pdf,
       pagado_en = EXCLUDED.pagado_en, base_imponible = EXCLUDED.base_imponible, impuestos = EXCLUDED.impuestos`,
    [obradorId, p.stripe_invoice_id, p.numero_factura, p.importe, p.base_imponible, p.impuestos, p.moneda, p.estado,
     p.intentos, p.periodo_desde, p.periodo_hasta, p.url_factura, p.url_pdf, p.pagado_en]
  );
}

export async function alCobroCorrecto(obradorId, pago) {
  const r = await comoSistema(async (c) => {
    await guardarPago(c, obradorId, pago);
    const { rows: [antes] } = await c.query("SELECT contratado_en, impago_desde FROM suscripciones WHERE obrador_id = $1", [obradorId]);
    await c.query(
      `UPDATE suscripciones SET estado = 'activa', ultimo_cobro_ok = now(),
              proximo_cobro = COALESCE($2, proximo_cobro),
              contratado_en = COALESCE(contratado_en, now()),
              importe_mensual = COALESCE(importe_mensual, $3),
              impago_desde = NULL, recordatorio_impago_en = NULL, suspendido_en = NULL, actualizado_en = now()
        WHERE obrador_id = $1`,
      [obradorId, pago.periodo_hasta, null]
    );
    await c.query("UPDATE obradores SET estado = 'activo' WHERE id = $1 AND estado <> 'baja'", [obradorId]);
    return { primero: !antes.contratado_en, regulariza: Boolean(antes.impago_desde), d: await datosObrador(c, obradorId) };
  });
  const tipo = r.primero ? "bienvenida" : "factura";
  await enviarCorreo({
    tipo,
    referencia: pago.stripe_invoice_id,
    obradorId,
    para: destinatario(r.d),
    datos: { ...r.d, pago, regulariza: r.regulariza },
  });
}

export async function alFalloCobro(obradorId, pago) {
  const r = await comoSistema(async (c) => {
    await guardarPago(c, obradorId, pago);
    const { rows: [s] } = await c.query("SELECT impago_desde, contratado_en FROM suscripciones WHERE obrador_id = $1", [obradorId]);
    // Si nunca ha pagado, no hay cuenta que suspender: sigue pendiente de pago.
    if (!s.contratado_en) return { sinContratar: true };
    const desde = s.impago_desde || new Date();
    if (!s.impago_desde) {
      await c.query("UPDATE suscripciones SET estado = 'impago', impago_desde = $2, actualizado_en = now() WHERE obrador_id = $1", [obradorId, desde]);
      await c.query("UPDATE obradores SET estado = 'impago' WHERE id = $1 AND estado = 'activo'", [obradorId]);
    }
    return { desde, d: await datosObrador(c, obradorId) };
  });
  if (r.sinContratar) return;
  // El aviso se manda una vez por racha de impago (los reintentos de Stripe no repiten correo).
  await enviarCorreo({
    tipo: "impago_aviso",
    referencia: `${obradorId}:${new Date(r.desde).toISOString()}`,
    obradorId,
    para: destinatario(r.d),
    datos: { ...r.d, pago, fechaSuspension: new Date(new Date(r.desde).getTime() + config.impagos.diasSuspension * DIA) },
  });
}

/**
 * Revisión periódica (cada hora): recordatorio a los 5 días y suspensión a
 * los 10 días del primer fallo. Es segura de repetir.
 */
export async function revisarImpagos(ahora = new Date()) {
  const { diasRecordatorio, diasSuspension } = config.impagos;
  const pendientes = await comoSistema(async (c) =>
    (await c.query("SELECT obrador_id, impago_desde, recordatorio_impago_en, suspendido_en FROM suscripciones WHERE impago_desde IS NOT NULL")).rows
  );
  const resumen = { recordatorios: 0, suspensiones: 0 };
  for (const s of pendientes) {
    const transcurrido = (ahora - new Date(s.impago_desde)) / DIA;
    const ref = `${s.obrador_id}:${new Date(s.impago_desde).toISOString()}`;
    const fechaSuspension = new Date(new Date(s.impago_desde).getTime() + diasSuspension * DIA);

    if (transcurrido >= diasSuspension && !s.suspendido_en) {
      const d = await comoSistema(async (c) => {
        await c.query("UPDATE suscripciones SET suspendido_en = $2, estado = 'suspendida', actualizado_en = now() WHERE obrador_id = $1", [s.obrador_id, ahora]);
        await c.query("UPDATE obradores SET estado = 'suspendido' WHERE id = $1 AND estado IN ('activo', 'impago')", [s.obrador_id]);
        return datosObrador(c, s.obrador_id);
      });
      await enviarCorreo({ tipo: "suspension", referencia: ref, obradorId: s.obrador_id, para: destinatario(d), datos: d });
      resumen.suspensiones++;
    } else if (transcurrido >= diasRecordatorio && !s.recordatorio_impago_en && !s.suspendido_en) {
      const d = await comoSistema(async (c) => {
        await c.query("UPDATE suscripciones SET recordatorio_impago_en = $2 WHERE obrador_id = $1", [s.obrador_id, ahora]);
        return datosObrador(c, s.obrador_id);
      });
      await enviarCorreo({
        tipo: "impago_recordatorio", referencia: ref, obradorId: s.obrador_id, para: destinatario(d),
        datos: { ...d, fechaSuspension, diasSuspension },
      });
      resumen.recordatorios++;
    }
  }
  return resumen;
}

/** Arranca la revisión horaria de impagos (una sola instancia la ejecuta cada vez). */
export function programarRevisionImpagos() {
  const tarea = async () => {
    try {
      const bloqueo = await comoSistema(async (c) => (await c.query("SELECT pg_try_advisory_xact_lock(727002) AS ok")).rows[0].ok);
      if (!bloqueo) return;
      const r = await revisarImpagos();
      if (r.recordatorios || r.suspensiones) console.log("[impagos]", r);
    } catch (e) {
      console.error("[impagos] error en la revisión:", e.message);
    }
  };
  setTimeout(tarea, 30_000);
  return setInterval(tarea, 60 * 60 * 1000);
}

/** Desarrollo y pruebas: simula una factura cobrada o fallida. */
export async function simularCobro(obradorId, { fallido = false, fecha = new Date() } = {}) {
  const s = await comoSistema(async (c) => (await c.query("SELECT * FROM suscripciones WHERE obrador_id = $1", [obradorId])).rows[0]);
  const hasta = new Date(fecha.getTime() + (s.periodicidad === "anual" ? 365 : 30) * DIA);
  const importe = s.importe_periodo ?? calcularImporte(s).periodo;
  const pago = {
    stripe_invoice_id: `sim_${obradorId.slice(0, 8)}_${fecha.getTime()}_${Math.random().toString(36).slice(2, 6)}`,
    numero_factura: `SIM-${fecha.getTime().toString().slice(-6)}`,
    importe, base_imponible: importe, impuestos: 0, moneda: "eur",
    estado: fallido ? "fallido" : "pagado", intentos: 1,
    periodo_desde: fecha, periodo_hasta: hasta, url_factura: null, url_pdf: null,
    pagado_en: fallido ? null : fecha,
  };
  if (fallido) await alFalloCobro(obradorId, pago);
  else await alCobroCorrecto(obradorId, pago);
  return pago;
}
