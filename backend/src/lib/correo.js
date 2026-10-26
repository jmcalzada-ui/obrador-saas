// Envío de correos transaccionales y plantillas.
// Cada correo se registra en emails_enviados con un tipo y una referencia
// únicos: aunque el mismo aviso llegue dos veces, el correo sale una sola.
import { config } from "../config.js";
import { comoSistema } from "../db/pool.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const eur = (n) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
export const dia = (d) => (d ? new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "—");

function plantilla({ titulo, parrafos, boton, pie }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#eef1f0;font-family:Arial,Helvetica,sans-serif;color:#1b2420">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px" cellpadding="0" cellspacing="0">
<tr><td style="padding:28px 28px 8px"><div style="font-size:14px;color:#58625d">Registro de obrador</div>
<h1 style="font-size:22px;margin:8px 0 0">${esc(titulo)}</h1></td></tr>
<tr><td style="padding:8px 28px 4px;font-size:16px;line-height:1.55">
${parrafos.map((p) => `<p style="margin:12px 0">${p}</p>`).join("")}
</td></tr>
${boton ? `<tr><td style="padding:12px 28px 8px"><a href="${esc(boton.url)}" style="display:inline-block;background:#1e4e8c;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:10px">${esc(boton.texto)}</a></td></tr>` : ""}
<tr><td style="padding:16px 28px 28px;font-size:13px;color:#58625d">${pie || "Este correo se ha enviado automáticamente. Si tienes dudas, responde a este mensaje."}</td></tr>
</table></td></tr></table></body></html>`;
}

// ---------- Plantillas ----------
export const PLANTILLAS = {
  // Primer cobro correcto: bienvenida, acceso y factura.
  bienvenida: ({ obrador, gestor, pago, suscripcion }) => ({
    asunto: `Bienvenido: ya puedes usar el registro de ${obrador.nombre}`,
    html: plantilla({
      titulo: "Tu cuenta está activa",
      parrafos: [
        `Hola ${esc(gestor.nombre)}, hemos recibido el pago y la cuenta de <strong>${esc(obrador.nombre)}</strong> ya está activa.`,
        `<strong>Lo que has contratado:</strong> plan básico (gestor y 1 usuario más)${suscripcion.usuarios_extra ? ` + ${suscripcion.usuarios_extra} usuario(s) extra` : ""}. Importe: ${eur(suscripcion.importe_mensual)}/mes sin impuestos.`,
        `<strong>Cobro de hoy:</strong> ${eur(pago.importe)}${pago.numero_factura ? ` (factura ${esc(pago.numero_factura)})` : ""}. Próximo cobro previsto: ${dia(suscripcion.proximo_cobro)}.`,
        pago.url_pdf ? `<a href="${esc(pago.url_pdf)}">Descargar la factura en PDF</a>` : "",
        `Entra con tu email (${esc(gestor.email)}) y la contraseña que elegiste. Desde <em>Más → Equipo</em> puedes dar de alta a tu equipo.`,
      ].filter(Boolean),
      boton: { texto: "Entrar en la app", url: config.urlPublica },
    }),
  }),

  // Cobros siguientes correctos (o el que regulariza un impago).
  factura: ({ obrador, pago, suscripcion, regulariza }) => ({
    asunto: `Factura ${pago.numero_factura || ""} · ${obrador.nombre}`.trim(),
    html: plantilla({
      titulo: regulariza ? "Pago recibido: cuenta al día" : "Hemos recibido tu pago",
      parrafos: [
        regulariza
          ? `Hemos cobrado correctamente la cuota pendiente de <strong>${esc(obrador.nombre)}</strong>. Tu cuenta vuelve a estar plenamente activa.`
          : `Hemos cobrado correctamente la cuota de <strong>${esc(obrador.nombre)}</strong>.`,
        `Importe: ${eur(pago.importe)}${pago.numero_factura ? ` · factura ${esc(pago.numero_factura)}` : ""}. Próximo cobro previsto: ${dia(suscripcion.proximo_cobro)}.`,
        pago.url_pdf ? `<a href="${esc(pago.url_pdf)}">Descargar la factura en PDF</a>` : "",
      ].filter(Boolean),
    }),
  }),

  // En el momento del fallo de cobro.
  impago_aviso: ({ obrador, pago, fechaSuspension }) => ({
    asunto: `No hemos podido cobrar tu cuota · ${obrador.nombre}`,
    html: plantilla({
      titulo: "No hemos podido cobrar tu cuota",
      parrafos: [
        `El cobro de ${eur(pago.importe)} de <strong>${esc(obrador.nombre)}</strong> no se ha podido completar. Suele deberse a una tarjeta caducada, sin saldo o a una domiciliación rechazada.`,
        `Tu cuenta sigue funcionando con normalidad. Para evitar cortes, actualiza la forma de pago antes del <strong>${dia(fechaSuspension)}</strong>.`,
      ],
      boton: { texto: "Actualizar forma de pago", url: `${config.urlPublica}/#/mas/obrador` },
    }),
  }),

  // A los 5 días: recordatorio con la fecha de suspensión.
  impago_recordatorio: ({ obrador, fechaSuspension, diasSuspension }) => ({
    asunto: `Recordatorio: tu cuenta se suspenderá el ${dia(fechaSuspension)}`,
    html: plantilla({
      titulo: "Tu cuota sigue pendiente",
      parrafos: [
        `Seguimos sin poder cobrar la cuota de <strong>${esc(obrador.nombre)}</strong>.`,
        `Si no se actualiza la forma de pago, el <strong>${dia(fechaSuspension)}</strong> (a los ${diasSuspension} días del primer intento) la cuenta quedará en suspenso: los datos se conservan, pero no se podrá acceder hasta regularizar el pago.`,
      ],
      boton: { texto: "Actualizar forma de pago", url: `${config.urlPublica}/#/mas/obrador` },
    }),
  }),

  // A los 10 días: la cuenta queda en suspenso.
  suspension: ({ obrador }) => ({
    asunto: `Cuenta en suspenso · ${obrador.nombre}`,
    html: plantilla({
      titulo: "Tu cuenta está en suspenso",
      parrafos: [
        `Al no haberse podido cobrar la cuota, la cuenta de <strong>${esc(obrador.nombre)}</strong> ha quedado en suspenso. Tus datos se conservan íntegros.`,
        `El gestor puede entrar en la app para actualizar la forma de pago. En cuanto se cobre, el acceso se reactiva automáticamente para todo el equipo.`,
      ],
      boton: { texto: "Regularizar el pago", url: config.urlPublica },
    }),
  }),
};

/**
 * Envía (una sola vez por tipo + referencia) un correo de plantilla.
 * Devuelve el estado: enviado | simulado | error | duplicado.
 */
export async function enviarCorreo({ tipo, referencia, obradorId, para, datos }) {
  const { asunto, html } = PLANTILLAS[tipo](datos);
  const reservado = await comoSistema(async (c) => {
    const { rowCount } = await c.query(
      `INSERT INTO emails_enviados (obrador_id, tipo, referencia, destinatario, asunto, estado)
       VALUES ($1, $2, $3, $4, $5, 'simulado') ON CONFLICT (tipo, referencia) DO NOTHING`,
      [obradorId, tipo, referencia, para, asunto]
    );
    return rowCount > 0;
  });
  if (!reservado) return "duplicado";

  if (!config.correo.resendApiKey) {
    if (!process.env.SILENCIAR_CORREOS) console.log(`[correo simulado] ${tipo} → ${para}: ${asunto}`);
    return "simulado";
  }
  let estado = "enviado";
  let error = null;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.correo.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.correo.remitente,
        to: [para],
        subject: asunto,
        html,
        ...(config.correo.responderA ? { reply_to: config.correo.responderA } : {}),
      }),
    });
    if (!res.ok) {
      estado = "error";
      error = `${res.status} ${await res.text()}`.slice(0, 500);
    }
  } catch (e) {
    estado = "error";
    error = String(e.message).slice(0, 500);
  }
  await comoSistema((c) =>
    c.query("UPDATE emails_enviados SET estado = $3, error = $4 WHERE tipo = $1 AND referencia = $2", [tipo, referencia, estado, error])
  );
  if (estado === "error") console.error(`[correo] error enviando ${tipo} a ${para}: ${error}`);
  return estado;
}
