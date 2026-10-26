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
};
