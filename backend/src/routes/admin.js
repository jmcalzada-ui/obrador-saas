// Back office privado: solo administradores de la plataforma (tabla admins).
// Sus sesiones son distintas de las de los obradores (token con aud "backoffice").
import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";
import { comoSistema } from "../db/pool.js";
import { simularCobro } from "../lib/cobros.js";
import { hashPassword, passwordTemporal, ruta, validar, verificarPassword } from "../lib/utiles.js";

export const adminRouter = Router();

const limite = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_LIMIT) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera unos minutos." },
});

const firmar = (a) => jwt.sign({ sub: a.id, rol: a.rol, aud: "backoffice" }, config.jwtSecret, { expiresIn: "8h" });

async function requireAdmin(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  let datos;
  try {
    datos = jwt.verify(token || "", config.jwtSecret, { audience: "backoffice" });
  } catch {
    return res.status(401).json({ error: "Inicia sesión en el back office." });
  }
  try {
    const admin = await comoSistema(async (c) =>
      (await c.query("SELECT id, email, nombre, rol, activo FROM admins WHERE id = $1", [datos.sub])).rows[0]
    );
    if (!admin?.activo) return res.status(401).json({ error: "Tu acceso al back office está desactivado." });
    req.admin = admin;
    next();
  } catch (e) {
    next(e);
  }
}
const requireSuperadmin = (req, res, next) =>
  req.admin.rol === "superadmin" ? next() : res.status(403).json({ error: "Solo el administrador principal puede hacer esto." });

const registrar = (c, req, obradorId, accion, detalle = {}) =>
  c.query("INSERT INTO admin_acciones (admin_id, obrador_id, accion, detalle) VALUES ($1, $2, $3, $4)", [req.admin.id, obradorId, accion, detalle]);

// ---------- Sesión ----------
adminRouter.post(
  "/login",
  limite,
  ruta(async (req, res) => {
    const d = validar(z.object({ email: z.string().trim().email("Email no válido."), password: z.string().min(1, "Escribe la contraseña.") }), req.body, res);
    if (!d) return;
    const admin = await comoSistema(async (c) => (await c.query("SELECT * FROM admins WHERE lower(email) = lower($1)", [d.email])).rows[0]);
    if (!admin || !admin.activo || !(await verificarPassword(d.password, admin.password_hash))) {
      return res.status(401).json({ error: "Email o contraseña incorrectos." });
    }
    await comoSistema((c) => c.query("UPDATE admins SET ultimo_acceso = now() WHERE id = $1", [admin.id]));
    res.json({ token: firmar(admin) });
  })
);

adminRouter.use(requireAdmin);

adminRouter.get("/me", (req, res) => res.json({ admin: req.admin }));

adminRouter.post(
  "/cambiar-password",
  ruta(async (req, res) => {
    const d = validar(z.object({ passwordActual: z.string().min(1), passwordNueva: z.string().min(12, "Mínimo 12 caracteres.") }), req.body, res);
    if (!d) return;
    const ok = await comoSistema(async (c) => {
      const { rows: [a] } = await c.query("SELECT password_hash FROM admins WHERE id = $1", [req.admin.id]);
      if (!(await verificarPassword(d.passwordActual, a.password_hash))) return false;
      await c.query("UPDATE admins SET password_hash = $2 WHERE id = $1", [req.admin.id, await hashPassword(d.passwordNueva)]);
      return true;
    });
    if (!ok) return res.status(400).json({ error: "La contraseña actual no es correcta." });
    res.json({ ok: true });
  })
);

// ---------- Clientes ----------
// LED: rojo = cobro fallido / en suspenso · verde = cobrado y activo · gris = sin contratar o baja
const RESUMEN = `
  SELECT o.id, o.nombre, o.razon_social, o.cif, o.sector, o.num_empleados, o.municipio, o.provincia, o.estado,
         o.creado_en AS fecha_alta, s.contratado_en, s.plan, s.modulos, s.usuarios_incluidos, s.usuarios_extra,
         s.importe_mensual, s.estado AS estado_suscripcion, s.proximo_cobro, s.metodo_pago_tipo, s.metodo_pago_resumen,
         s.impago_desde, s.suspendido_en, s.ultimo_cobro_ok,
         (SELECT max(u.ultimo_acceso) FROM usuarios u WHERE u.obrador_id = o.id) AS ultimo_acceso,
         (SELECT count(*)::int FROM usuarios u WHERE u.obrador_id = o.id AND u.activo) AS usuarios_activos,
         COALESCE((SELECT sum(p.importe) FROM pagos p WHERE p.obrador_id = o.id AND p.estado = 'pagado'
                    AND p.pagado_en >= now() - interval '12 months'), 0)::numeric(12,2) AS pagado_12m,
         COALESCE((SELECT sum(p.importe) FROM pagos p WHERE p.obrador_id = o.id AND p.estado = 'pagado'), 0)::numeric(12,2) AS pagado_total,
         CASE WHEN o.estado IN ('impago', 'suspendido') OR s.impago_desde IS NOT NULL THEN 'rojo'
              WHEN o.estado = 'activo' THEN 'verde'
              ELSE 'gris' END AS led
    FROM obradores o JOIN suscripciones s ON s.obrador_id = o.id`;

adminRouter.get(
  "/clientes",
  ruta(async (req, res) => {
    const f = validar(z.object({ q: z.string().trim().max(80).optional(), led: z.enum(["rojo", "verde", "gris"]).optional() }), req.query, res);
    if (!f) return;
    const datos = await comoSistema(async (c) => {
      const params = [];
      const cond = [];
      if (f.q) cond.push(`(r.nombre ILIKE $${params.push(`%${f.q}%`)} OR r.razon_social ILIKE $1 OR r.cif ILIKE $1 OR r.municipio ILIKE $1)`);
      if (f.led) cond.push(`r.led = $${params.push(f.led)}`);
      const { rows: clientes } = await c.query(
        `SELECT * FROM (${RESUMEN}) r ${cond.length ? `WHERE ${cond.join(" AND ")}` : ""}
          ORDER BY (r.led = 'rojo') DESC, r.fecha_alta DESC`,
        params
      );
      const { rows: [totales] } = await c.query(`
        SELECT count(*) FILTER (WHERE led = 'verde')::int AS verdes,
               count(*) FILTER (WHERE led = 'rojo')::int AS rojos,
               count(*) FILTER (WHERE led = 'gris')::int AS grises,
               COALESCE(sum(importe_mensual) FILTER (WHERE led <> 'gris'), 0)::numeric(12,2) AS ingresos_mensuales,
               COALESCE(sum(pagado_12m), 0)::numeric(12,2) AS cobrado_12m
          FROM (${RESUMEN}) r`);
      return { clientes, totales };
    });
    res.json(datos);
  })
);

adminRouter.get(
  "/clientes/:id",
  ruta(async (req, res) => {
    const datos = await comoSistema(async (c) => {
      const { rows: [resumen] } = await c.query(`${RESUMEN} WHERE o.id = $1`, [req.params.id]);
      if (!resumen) return null;
      const { rows: [obrador] } = await c.query("SELECT * FROM obradores WHERE id = $1", [req.params.id]);
      const { rows: [suscripcion] } = await c.query(
        "SELECT *, stripe_customer_id IS NOT NULL AS en_stripe FROM suscripciones WHERE obrador_id = $1", [req.params.id]
      );
      const { rows: pagos } = await c.query(
        "SELECT numero_factura, importe, base_imponible, impuestos, estado, intentos, fecha, pagado_en, periodo_desde, periodo_hasta, url_factura, url_pdf FROM pagos WHERE obrador_id = $1 ORDER BY fecha DESC",
        [req.params.id]
      );
      const { rows: usuarios } = await c.query(
        "SELECT nombre, email, rol, activo, ultimo_acceso, creado_en FROM usuarios WHERE obrador_id = $1 ORDER BY (rol = 'gestor') DESC, nombre",
        [req.params.id]
      );
      const { rows: emails } = await c.query(
        "SELECT tipo, destinatario, asunto, estado, error, creado_en FROM emails_enviados WHERE obrador_id = $1 ORDER BY creado_en DESC LIMIT 50",
        [req.params.id]
      );
      const { rows: acciones } = await c.query(
        `SELECT a.accion, a.detalle, a.creado_en, ad.nombre AS admin
           FROM admin_acciones a LEFT JOIN admins ad ON ad.id = a.admin_id
          WHERE a.obrador_id = $1 ORDER BY a.creado_en DESC LIMIT 50`,
        [req.params.id]
      );
      // Nunca se envían al navegador los identificadores internos de Stripe.
      delete suscripcion.stripe_customer_id;
      delete suscripcion.stripe_subscription_id;
      return { resumen, obrador, suscripcion, pagos, usuarios, emails, acciones, pagosSimulados: config.pagosSimulados };
    });
    if (!datos) return res.status(404).json({ error: "Cliente no encontrado." });
    res.json(datos);
  })
);

// Suspender o reactivar a mano (p. ej. pago por transferencia o incidencia).
adminRouter.post(
  "/clientes/:id/estado",
  ruta(async (req, res) => {
    const d = validar(z.object({
      estado: z.enum(["activo", "suspendido"]),
      motivo: z.string().trim().min(3, "Indica el motivo.").max(300),
    }), req.body, res);
    if (!d) return;
    const ok = await comoSistema(async (c) => {
      const { rowCount } = await c.query("UPDATE obradores SET estado = $2 WHERE id = $1 AND estado <> 'baja'", [req.params.id, d.estado]);
      if (!rowCount) return false;
      if (d.estado === "activo") {
        await c.query(
          "UPDATE suscripciones SET impago_desde = NULL, recordatorio_impago_en = NULL, suspendido_en = NULL, estado = 'activa', actualizado_en = now() WHERE obrador_id = $1",
          [req.params.id]
        );
      } else {
        await c.query("UPDATE suscripciones SET suspendido_en = now(), estado = 'suspendida', actualizado_en = now() WHERE obrador_id = $1", [req.params.id]);
      }
      await registrar(c, req, req.params.id, d.estado === "activo" ? "reactivar" : "suspender", { motivo: d.motivo });
      return true;
    });
    if (!ok) return res.status(404).json({ error: "Cliente no encontrado o dado de baja." });
    res.json({ ok: true });
  })
);

// Solo en pruebas sin Stripe: simular un cobro correcto o fallido para ver el ciclo.
adminRouter.post(
  "/clientes/:id/simular-cobro",
  ruta(async (req, res) => {
    if (!config.pagosSimulados) return res.status(404).json({ error: "Ruta no encontrada." });
    const pago = await simularCobro(req.params.id, { fallido: Boolean(req.body?.fallido) });
    res.json({ pago });
  })
);

// ---------- Administradores del back office ----------
adminRouter.get(
  "/admins",
  requireSuperadmin,
  ruta(async (req, res) => {
    const admins = await comoSistema(async (c) =>
      (await c.query("SELECT id, email, nombre, rol, activo, ultimo_acceso, creado_en FROM admins ORDER BY (rol = 'superadmin') DESC, nombre")).rows
    );
    res.json({ admins });
  })
);

adminRouter.post(
  "/admins",
  requireSuperadmin,
  ruta(async (req, res) => {
    const d = validar(z.object({ email: z.string().trim().email("Email no válido."), nombre: z.string().trim().min(2, "Escribe el nombre.").max(80) }), req.body, res);
    if (!d) return;
    const pass = passwordTemporal(14);
    try {
      const admin = await comoSistema(async (c) => {
        const { rows } = await c.query(
          "INSERT INTO admins (email, nombre, password_hash, rol) VALUES (lower($1), $2, $3, 'admin') RETURNING id, email, nombre, rol, activo",
          [d.email, d.nombre, await hashPassword(pass)]
        );
        await registrar(c, req, null, "crear_admin", { email: d.email });
        return rows[0];
      });
      res.status(201).json({ admin, passwordTemporal: pass });
    } catch (e) {
      if (e.code === "23505") return res.status(409).json({ error: "Ya existe un administrador con ese email." });
      throw e;
    }
  })
);

adminRouter.patch(
  "/admins/:id",
  requireSuperadmin,
  ruta(async (req, res) => {
    const d = validar(z.object({ activo: z.boolean() }), req.body, res);
    if (!d) return;
    if (req.params.id === req.admin.id) return res.status(400).json({ error: "No puedes desactivarte a ti mismo." });
    const ok = await comoSistema(async (c) => {
      const { rowCount } = await c.query("UPDATE admins SET activo = $2 WHERE id = $1 AND rol <> 'superadmin'", [req.params.id, d.activo]);
      if (rowCount) await registrar(c, req, null, d.activo ? "activar_admin" : "desactivar_admin", { admin_id: req.params.id });
      return rowCount > 0;
    });
    if (!ok) return res.status(404).json({ error: "Administrador no encontrado." });
    res.json({ ok: true });
  })
);
