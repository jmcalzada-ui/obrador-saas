// Configuración leída de variables de entorno (en Railway: pestaña Variables).
const produccion = process.env.NODE_ENV === "production";

function requerida(nombre, valorDesarrollo) {
  const v = process.env[nombre];
  if (v) return v;
  if (produccion) throw new Error(`Falta la variable de entorno ${nombre}.`);
  return valorDesarrollo;
}

export const config = {
  produccion,
  port: Number(process.env.PORT) || 3000,
  databaseUrl: requerida("DATABASE_URL", "postgres://dev:dev@localhost:5432/obrador_dev"),
  jwtSecret: requerida("JWT_SECRET", "solo-para-desarrollo-local-no-usar-en-produccion"),
  jwtExpira: process.env.JWT_EXPIRA || "12h",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,

  // Dirección pública de la app (enlaces en los correos y vuelta desde Stripe).
  urlPublica: (process.env.URL_PUBLICA || "http://localhost:5173").replace(/\/$/, ""),

  // Stripe (cobros). Sin clave, el alta funciona en "pagos simulados" solo fuera de producción.
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || null,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null,
    precios: {
      basico: process.env.STRIPE_PRECIO_BASICO || null,                     // 29,90 €/mes
      usuarioExtra: process.env.STRIPE_PRECIO_USUARIO_EXTRA || null,         // 3 €/mes por usuario
      basicoAnual: process.env.STRIPE_PRECIO_BASICO_ANUAL || null,           // 299 €/año (2 meses gratis)
      usuarioExtraAnual: process.env.STRIPE_PRECIO_USUARIO_EXTRA_ANUAL || null, // 30 €/año por usuario (2 meses gratis)
      completoAnual: process.env.STRIPE_PRECIO_COMPLETO_ANUAL || null,       // 539 €/año (3 meses gratis)
    },
  },
  // Entorno de pruebas sin Stripe: el alta se activa al momento y el back
  // office permite simular cobros. En producción solo con PAGOS_SIMULADOS=1.
  pagosSimulados: !process.env.STRIPE_SECRET_KEY && (!produccion || process.env.PAGOS_SIMULADOS === "1"),

  // Correo transaccional (Resend). Sin clave, los correos se registran pero no se envían.
  correo: {
    resendApiKey: process.env.RESEND_API_KEY || null,
    remitente: process.env.CORREO_REMITENTE || "Registro de obrador <no-responder@example.com>",
    responderA: process.env.CORREO_RESPONDER_A || null,
  },

  // Calendario de impagos: aviso al fallar, recordatorio y suspensión.
  impagos: {
    diasRecordatorio: Number(process.env.DIAS_RECORDATORIO_IMPAGO) || 5,
    diasSuspension: Number(process.env.DIAS_SUSPENSION_IMPAGO) || 10,
  },

  // Precios del plan (para mostrar y calcular el importe; Stripe cobra lo suyo).
  // Mensual: básico 29,90 + módulos (escandallos, precios y lectura por IA 20 · APPCC temperaturas 10) + 3 por usuario extra.
  // Anual básico: 2 meses gratis (10 cuotas). Anual completo (todos los módulos): 3 meses gratis (9 cuotas).
  tarifas: {
    basico: 29.9, usuarioExtra: 3, escandallos: 20, appcc: 10,
    anual: { basico: 299, usuarioExtra: 30, completo: 539 },
  },
  // El plan completo se ofrece cuando los módulos estén terminados.
  planCompletoDisponible: process.env.PLAN_COMPLETO_DISPONIBLE === "1",
};
