import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { comoSistema } from "../db/pool.js";
import { config } from "../config.js";
import { firmarToken, requireAuthPermitiendoBloqueo as requireAuth, db, ESTADOS_BLOQUEADOS } from "../auth/middleware.js";
import { permisosDe } from "../auth/permisos.js";
import { hashPassword, ruta, validar, verificarPassword } from "../lib/utiles.js";

export const authRouter = Router();

// Freno a intentos de adivinar contraseñas: 10 intentos / 15 min por IP.
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_LIMIT) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera unos minutos y vuelve a probar." },
});

const esquemaLogin = z.object({
  email: z.string({ required_error: "Escribe tu email." }).trim().email("El email no es válido."),
  password: z.string({ required_error: "Escribe tu contraseña." }).min(1, "Escribe tu contraseña."),
});

authRouter.post(
  "/login",
  limiteLogin,
  ruta(async (req, res) => {
    const datos = validar(esquemaLogin, req.body, res);
    if (!datos) return;
    // Tarea de sistema: el email decide a qué obrador pertenece el usuario.
    const usuario = await comoSistema(async (c) => {
      const { rows } = await c.query(
        `SELECT u.id, u.obrador_id, u.password_hash, u.activo, u.rol, o.estado AS estado_obrador
           FROM usuarios u JOIN obradores o ON o.id = u.obrador_id
          WHERE lower(u.email) = lower($1)`,
        [datos.email]
      );
      return rows[0];
    });
    const ok = usuario && (await verificarPassword(datos.password, usuario.password_hash));
    if (!ok || !usuario.activo) return res.status(401).json({ error: "Email o contraseña incorrectos." });
    // Con la cuenta bloqueada solo entra el gestor, para poder regularizar el pago.
    if (ESTADOS_BLOQUEADOS.includes(usuario.estado_obrador) && usuario.rol !== "gestor") {
      const msg = usuario.estado_obrador === "pendiente_pago"
        ? "La cuenta de tu obrador todavía no está activa."
        : "La cuenta de tu obrador está en suspenso. Avisa al gestor para que regularice el pago.";
      return res.status(402).json({ error: msg, codigo: `obrador_${usuario.estado_obrador}` });
    }
    await comoSistema((c) => c.query("UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1", [usuario.id]));
    res.json({ token: firmarToken(usuario) });
  })
);

// Datos de la sesión: usuario, permisos y obrador (con su plan).
authRouter.get(
  "/me",
  requireAuth,
  ruta(async (req, res) => {
    const obrador = await db(req, async (c) => {
      const { rows } = await c.query(
        `SELECT o.id, o.nombre, o.estado, o.logo_id, s.plan, s.modulos, s.impago_desde, s.proximo_cobro,
                s.impago_desde + make_interval(days => $1) AS fecha_suspension,
                s.usuarios_incluidos + s.usuarios_extra AS plazas_total
           FROM obradores o JOIN suscripciones s ON s.obrador_id = o.id`,
        [config.impagos.diasSuspension]
      );
      return rows[0];
    });
    const { estado_obrador, ...usuario } = req.usuario;
    res.json({ usuario: { ...usuario, permisos: permisosDe(usuario.rol) }, obrador });
  })
);

const esquemaCambio = z.object({
  passwordActual: z.string().min(1, "Escribe tu contraseña actual."),
  passwordNueva: z.string().min(10, "La nueva contraseña debe tener al menos 10 caracteres."),
});

authRouter.post(
  "/cambiar-password",
  requireAuth,
  ruta(async (req, res) => {
    const datos = validar(esquemaCambio, req.body, res);
    if (!datos) return;
    const resultado = await db(req, async (c) => {
      const { rows } = await c.query("SELECT password_hash FROM usuarios WHERE id = $1", [req.usuario.id]);
      if (!(await verificarPassword(datos.passwordActual, rows[0].password_hash))) return false;
      await c.query("UPDATE usuarios SET password_hash = $1, debe_cambiar_password = false WHERE id = $2", [
        await hashPassword(datos.passwordNueva),
        req.usuario.id,
      ]);
      return true;
    });
    if (!resultado) return res.status(400).json({ error: "La contraseña actual no es correcta." });
    res.json({ ok: true });
  })
);
