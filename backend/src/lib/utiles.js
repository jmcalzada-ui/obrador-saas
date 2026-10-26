import crypto from "node:crypto";
import bcrypt from "bcryptjs";

// Contraseña temporal legible (sin 0/O, 1/l): se muestra una sola vez.
export function passwordTemporal(longitud = 12) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(longitud);
  let s = "";
  for (let i = 0; i < longitud; i++) s += abc[bytes[i] % abc.length];
  return s;
}

export const hashPassword = (p) => bcrypt.hash(p, 11);
export const verificarPassword = (p, hash) => bcrypt.compare(p, hash);

/** Envuelve un handler async para que los errores lleguen al manejador común. */
export const ruta = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Valida req.body con un esquema zod; responde 400 con el primer error legible. */
export function validar(esquema, datos, res) {
  const r = esquema.safeParse(datos ?? {});
  if (!r.success) {
    const e = r.error.issues[0];
    res.status(400).json({ error: e.message, campo: e.path.join(".") });
    return null;
  }
  return r.data;
}

/** Traduce errores de Postgres frecuentes a mensajes para el usuario. */
export function errorPostgres(err) {
  if (err.code === "23505") return { status: 409, error: "Ya existe un registro con ese nombre." };
  if (err.code === "23503") return { status: 409, error: "No se puede completar: hay registros relacionados." };
  if (err.code === "42501") return { status: 403, error: "No tienes acceso a ese dato." };
  if (err.code === "23514") return { status: 400, error: "Algún valor no es válido." };
  if (err.code === "22P02") return { status: 400, error: "Identificador no válido." };
  return null;
}
