import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireAuthPermitiendoBloqueo, requirePermiso, db } from "../auth/middleware.js";
import { crearSesionPago, crearSesionPortal } from "../lib/cobros.js";
import { ruta, validar } from "../lib/utiles.js";

export const SECTORES = ["carnica", "panaderia", "pasteleria", "comidas_preparadas", "catering", "heladeria", "conservas", "otro"];

export const obradorRouter = Router();

const CAMPOS = `id, nombre, razon_social, cif, registro_sanitario, sector, num_empleados, direccion, direccion_fiscal, codigo_postal,
  municipio, provincia, pais, contacto_nombre, email_contacto, email_facturacion, telefono, logo_url, estado, creado_en`;

obradorRouter.get(
  "/",
  requireAuthPermitiendoBloqueo,
  ruta(async (req, res) => {
    const datos = await db(req, async (c) => {
      const { rows: [obrador] } = await c.query(`SELECT ${CAMPOS} FROM obradores`);
      const { rows: [suscripcion] } = await c.query(
        `SELECT plan, estado, modulos, usuarios_incluidos, usuarios_extra, importe_mensual, importe_periodo, periodicidad, proximo_cobro,
                metodo_pago_tipo, metodo_pago_resumen, impago_desde, contratado_en,
                (SELECT count(*)::int FROM usuarios WHERE activo) AS usuarios_activos
           FROM suscripciones`
      );
      return { obrador, suscripcion };
    });
    res.json(datos);
  })
);

const texto = (max) => z.string().trim().max(max).optional().nullable();
const esquema = z.object({
  nombre: z.string().trim().min(1, "El nombre no puede quedar vacío.").max(120).optional(),
  razon_social: texto(160),
  cif: texto(20),
  registro_sanitario: texto(40),
  sector: z.enum(SECTORES).optional().nullable(),
  num_empleados: z.number().int().positive().max(10000).optional().nullable(),
  direccion: texto(240),
  direccion_fiscal: texto(240),
  codigo_postal: texto(10),
  municipio: texto(80),
  provincia: texto(80),
  contacto_nombre: texto(120),
  email_contacto: z.string().trim().email("El email de contacto no es válido.").optional().nullable(),
  email_facturacion: z.string().trim().email("El email de facturación no es válido.").optional().nullable(),
  telefono: texto(30),
});

obradorRouter.patch(
  "/",
  requireAuth,
  requirePermiso("obrador"),
  ruta(async (req, res) => {
    const datos = validar(esquema, req.body, res);
    if (!datos) return;
    const campos = Object.keys(datos);
    if (campos.length === 0) return res.status(400).json({ error: "No hay cambios." });
    const sets = campos.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const obrador = await db(req, async (c) => {
      const { rows } = await c.query(`UPDATE obradores SET ${sets} WHERE id = $${campos.length + 1} RETURNING ${CAMPOS}`, [
        ...campos.map((k) => datos[k]),
        req.usuario.obrador_id,
      ]);
      return rows[0];
    });
    res.json({ obrador });
  })
);

// Facturas del propio obrador (solo gestor).
obradorRouter.get(
  "/pagos",
  requireAuthPermitiendoBloqueo,
  requirePermiso("obrador"),
  ruta(async (req, res) => {
    const pagos = await db(req, async (c) =>
      (await c.query("SELECT numero_factura, importe, estado, fecha, pagado_en, url_factura, url_pdf FROM pagos ORDER BY fecha DESC LIMIT 36")).rows
    );
    res.json({ pagos });
  })
);

// Cambiar tarjeta o cuenta de domiciliación (portal seguro de Stripe).
obradorRouter.post(
  "/portal-pago",
  requireAuthPermitiendoBloqueo,
  requirePermiso("obrador"),
  ruta(async (req, res) => {
    try {
      res.json(await crearSesionPortal(req.usuario.obrador_id));
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  })
);

// Alta a medias (se cerró la página de pago): volver a abrirla.
obradorRouter.post(
  "/completar-pago",
  requireAuthPermitiendoBloqueo,
  requirePermiso("obrador"),
  ruta(async (req, res) => {
    const metodo = req.body?.metodo === "sepa_debit" ? "sepa_debit" : "card";
    if (req.usuario.estado_obrador !== "pendiente_pago") return res.status(400).json({ error: "La cuenta ya está activa." });
    try {
      res.json(await crearSesionPago({ obradorId: req.usuario.obrador_id, metodo }));
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  })
);
