import { comoSistema } from "../db/pool.js";
import { hashPassword, passwordTemporal } from "./utiles.js";

/**
 * Da de alta un obrador nuevo con su suscripción (plan básico) y su
 * usuario gestor. Hoy lo usa el script de alta manual y las pruebas;
 * en la fase 2 lo llamará el alta automática tras el pago en Stripe.
 * Devuelve la contraseña temporal del gestor (solo se ve esta vez).
 */
export async function crearObrador({ nombre, gestorEmail, gestorNombre, diasPrueba = 14, password }) {
  const pass = password || passwordTemporal();
  const hash = await hashPassword(pass);
  return comoSistema(async (db) => {
    const { rows: [obrador] } = await db.query(
      "INSERT INTO obradores (nombre, email_contacto) VALUES ($1, $2) RETURNING id, nombre, estado",
      [nombre, gestorEmail]
    );
    await db.query(
      `INSERT INTO suscripciones (obrador_id, plan, estado, prueba_hasta)
       VALUES ($1, 'basico', 'prueba', now() + make_interval(days => $2))`,
      [obrador.id, diasPrueba]
    );
    const { rows: [gestor] } = await db.query(
      `INSERT INTO usuarios (obrador_id, email, nombre, password_hash, rol, debe_cambiar_password)
       VALUES ($1, lower($2), $3, $4, 'gestor', $5)
       RETURNING id, email, nombre, rol`,
      [obrador.id, gestorEmail, gestorNombre, hash, !password]
    );
    return { obrador, gestor, passwordTemporal: pass };
  });
}
