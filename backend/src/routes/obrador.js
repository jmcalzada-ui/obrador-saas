import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermiso, db } from "../auth/middleware.js";
import { ruta, validar } from "../lib/utiles.js";

export const obradorRouter = Router();
obradorRouter.use(requireAuth);

const CAMPOS = "id, nombre, razon_social, cif, registro_sanitario, direccion, email_contacto, telefono, logo_url, estado, creado_en";

obradorRouter.get(
  "/",
  ruta(async (req, res) => {
    const datos = await db(req, async (c) => {
      const { rows: [obrador] } = await c.query(`SELECT ${CAMPOS} FROM obradores`);
      const { rows: [suscripcion] } = await c.query(
        `SELECT plan, estado, modulos, usuarios_incluidos, usuarios_extra, prueba_hasta, periodo_fin,
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
  direccion: texto(240),
  email_contacto: z.string().trim().email("El email no es válido.").optional().nullable(),
  telefono: texto(30),
});

obradorRouter.patch(
  "/",
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
