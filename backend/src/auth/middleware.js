import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { enObrador } from "../db/pool.js";
import { puede } from "./permisos.js";

export function firmarToken(usuario) {
  return jwt.sign({ sub: usuario.id, obr: usuario.obrador_id, rol: usuario.rol }, config.jwtSecret, {
    expiresIn: config.jwtExpira,
  });
}

/**
 * Verifica el token y comprueba en la base de datos que el usuario sigue
 * activo y que su obrador no está suspendido (si el gestor desactiva a
 * alguien, pierde el acceso al momento, sin esperar a que caduque el token).
 * Deja en req.usuario los datos actuales (el rol se lee de la base, no del token).
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No has iniciado sesión." });
  let datos;
  try {
    datos = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: "Tu sesión ha caducado. Vuelve a iniciar sesión." });
  }
  try {
    const usuario = await enObrador(datos.obr, async (db) => {
      const { rows } = await db.query(
        `SELECT u.id, u.obrador_id, u.email, u.nombre, u.rol, u.activo, u.debe_cambiar_password, o.estado AS estado_obrador
           FROM usuarios u JOIN obradores o ON o.id = u.obrador_id
          WHERE u.id = $1`,
        [datos.sub]
      );
      return rows[0];
    });
    if (!usuario || !usuario.activo) return res.status(401).json({ error: "Tu usuario está desactivado." });
    if (["suspendido", "baja"].includes(usuario.estado_obrador)) {
      return res.status(402).json({ error: "La cuenta de este obrador está suspendida.", codigo: "obrador_suspendido" });
    }
    req.usuario = usuario;
    next();
  } catch (err) {
    next(err);
  }
}

export function requirePermiso(permiso) {
  return (req, res, next) => {
    if (!puede(req.usuario?.rol, permiso)) {
      return res.status(403).json({ error: "Tu rol no permite esta acción." });
    }
    next();
  };
}

/** Bloquea un módulo de pago si el obrador no lo tiene contratado. */
export function requireModulo(modulo) {
  return async (req, res, next) => {
    try {
      const modulos = await enObrador(req.usuario.obrador_id, async (db) => {
        const { rows } = await db.query("SELECT modulos FROM suscripciones");
        return rows[0]?.modulos || [];
      });
      if (!modulos.includes(modulo)) {
        return res.status(402).json({ error: "Este módulo no está incluido en tu plan.", codigo: "modulo_no_contratado", modulo });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Atajo: ejecuta la consulta en el obrador del usuario de la petición. */
export function db(req, fn) {
  return enObrador(req.usuario.obrador_id, fn);
}
