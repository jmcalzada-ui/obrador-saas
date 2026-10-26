// Alta pública de un obrador nuevo: datos del obrador, facturación,
// contacto y acceso del gestor → página de pago segura de Stripe.
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { comoSistema } from "../db/pool.js";
import { config } from "../config.js";
import { crearObrador } from "../lib/obradores.js";
import { crearSesionPago, calcularImporte } from "../lib/cobros.js";
import { ruta, validar } from "../lib/utiles.js";
import { SECTORES } from "./obrador.js";

export const altaRouter = Router();

const limiteAlta = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.ALTA_LIMIT) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de alta desde esta conexión. Inténtalo más tarde." },
});

// Información pública del plan para la página de alta.
altaRouter.get("/plan", (req, res) => {
  res.json({
    basico: config.tarifas.basico,
    usuarioExtra: config.tarifas.usuarioExtra,
    descuentoAnual: config.tarifas.descuentoAnual,
    basicoAnual: calcularImporte({ periodicidad: "anual" }).periodo,
    usuarioExtraAnual: Math.round(config.tarifas.usuarioExtra * 12 * (1 - config.tarifas.descuentoAnual) * 100) / 100,
    usuariosIncluidos: 2,
    pagosSimulados: config.pagosSimulados,
  });
});

const txt = (min, max, msg) => z.string({ required_error: msg }).trim().min(min, msg).max(max);
const esquema = z.object({
  // El obrador
  nombre: txt(2, 120, "Escribe el nombre comercial del obrador."),
  sector: z.enum(SECTORES, { errorMap: () => ({ message: "Elige el tipo de obrador." }) }),
  num_empleados: z.number({ invalid_type_error: "Indica cuántas personas trabajan en el obrador." }).int().min(1).max(500),
  registro_sanitario: z.string().trim().max(40).optional().default(""),
  // Facturación
  razon_social: txt(2, 160, "Escribe la razón social o el nombre del titular."),
  cif: z.string().trim().toUpperCase().transform((v) => v.replace(/[\s.-]/g, ""))
    .refine((v) => /^[A-Z0-9]{8,10}$/.test(v), "El CIF / NIF no es válido."),
  direccion_fiscal: txt(4, 240, "Escribe la dirección fiscal."),
  codigo_postal: z.string().trim().refine((v) => /^\d{5}$/.test(v), "El código postal debe tener 5 cifras."),
  municipio: txt(2, 80, "Escribe el municipio."),
  provincia: txt(2, 80, "Escribe la provincia."),
  email_facturacion: z.string().trim().email("El email de facturación no es válido.").optional().or(z.literal("")),
  // Contacto
  contacto_nombre: txt(2, 120, "Escribe el nombre de la persona de contacto."),
  telefono: z.string().trim().refine((v) => /^\+?[\d\s]{9,15}$/.test(v), "El teléfono no es válido."),
  email_contacto: z.string().trim().email("El email de contacto no es válido."),
  // Acceso del gestor
  gestor_nombre: txt(2, 80, "Escribe el nombre del gestor."),
  gestor_email: z.string().trim().email("El email de acceso no es válido."),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres.").max(200),
  // Contratación y pago
  usuarios_extra: z.number().int().min(0).max(50).default(0),
  periodicidad: z.enum(["mensual", "anual"]).default("mensual"),
  metodo: z.enum(["card", "sepa_debit"], { errorMap: () => ({ message: "Elige tarjeta o domiciliación bancaria." }) }),
  acepta_condiciones: z.literal(true, { errorMap: () => ({ message: "Debes aceptar las condiciones del servicio." }) }),
});

altaRouter.post(
  "/",
  limiteAlta,
  ruta(async (req, res) => {
    const d = validar(esquema, req.body, res);
    if (!d) return;
    const existe = await comoSistema(async (c) =>
      (await c.query("SELECT 1 FROM usuarios WHERE lower(email) = lower($1)", [d.gestor_email])).rowCount > 0
    );
    if (existe) {
      return res.status(409).json({
        error: "Ya hay una cuenta con ese email de acceso. Si dejaste un alta a medias, entra con él para completar el pago.",
        campo: "gestor_email",
      });
    }
    const { obrador } = await crearObrador({
      nombre: d.nombre,
      gestorEmail: d.gestor_email,
      gestorNombre: d.gestor_nombre,
      password: d.password,
      estado: "pendiente_pago",
      usuariosExtra: d.usuarios_extra,
      periodicidad: d.periodicidad,
      datos: {
        razon_social: d.razon_social, cif: d.cif, registro_sanitario: d.registro_sanitario || null,
        sector: d.sector, num_empleados: d.num_empleados, direccion_fiscal: d.direccion_fiscal,
        codigo_postal: d.codigo_postal, municipio: d.municipio, provincia: d.provincia, pais: "ES",
        contacto_nombre: d.contacto_nombre, telefono: d.telefono, email_contacto: d.email_contacto,
        email_facturacion: d.email_facturacion || null,
      },
    });
    try {
      const { url } = await crearSesionPago({ obradorId: obrador.id, metodo: d.metodo });
      const imp = calcularImporte({ usuarios_extra: d.usuarios_extra, periodicidad: d.periodicidad });
      res.status(201).json({ url, importe: imp.periodo, periodicidad: imp.periodicidad, importeMensual: imp.mensual });
    } catch (e) {
      // El obrador queda "pendiente de pago": el gestor puede entrar y reintentar.
      res.status(e.status || 502).json({ error: e.status ? e.message : "No se pudo abrir la página de pago. Entra con tu email para reintentarlo." });
    }
  })
);
