import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermiso, db } from "../auth/middleware.js";
import { ROLES_ASIGNABLES } from "../auth/permisos.js";
import { hashPassword, passwordTemporal, ruta, validar } from "../lib/utiles.js";
import { comoSistema } from "../db/pool.js";

export const usuariosRouter = Router();
usuariosRouter.use(requireAuth, requirePermiso("usuarios"));

const CAMPOS = "id, email, nombre, rol, activo, debe_cambiar_password, ultimo_acceso, creado_en";

/** Plazas del plan: incluidas (gestor + 1) + extra contratadas, y las ocupadas (usuarios activos). */
async function plazas(c) {
  const { rows: [r] } = await c.query(
    `SELECT s.usuarios_incluidos + s.usuarios_extra AS total,
            (SELECT count(*)::int FROM usuarios WHERE activo) AS ocupadas
       FROM suscripciones s`
  );
  return r;
}

usuariosRouter.get(
  "/",
  ruta(async (req, res) => {
    const datos = await db(req, async (c) => {
      const { rows } = await c.query(`SELECT ${CAMPOS} FROM usuarios ORDER BY (rol = 'gestor') DESC, nombre`);
      return { usuarios: rows, plazas: await plazas(c) };
    });
    res.json(datos);
  })
);

const esquemaAlta = z.object({
  email: z.string().trim().email("El email no es válido."),
  nombre: z.string().trim().min(1, "Escribe el nombre.").max(80),
  rol: z.enum(ROLES_ASIGNABLES, { errorMap: () => ({ message: "Elige un rol: jefe de producción, operario u observador." }) }),
});

usuariosRouter.post(
  "/",
  ruta(async (req, res) => {
    const datos = validar(esquemaAlta, req.body, res);
    if (!datos) return;
    // El email es único en toda la plataforma; se comprueba como sistema
    // para dar un mensaje claro (sin revelar a qué obrador pertenece).
    const existe = await comoSistema(async (c) => {
      const { rowCount } = await c.query("SELECT 1 FROM usuarios WHERE lower(email) = lower($1)", [datos.email]);
      return rowCount > 0;
    });
    if (existe) return res.status(409).json({ error: "Ya hay un usuario con ese email." });

    const pass = passwordTemporal();
    const hash = await hashPassword(pass);
    const resultado = await db(req, async (c) => {
      // Serializa altas simultáneas del mismo obrador para no pasarse de plazas.
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [req.usuario.obrador_id]);
      const p = await plazas(c);
      if (p.ocupadas >= p.total) return { sinPlaza: p };
      const { rows } = await c.query(
        `INSERT INTO usuarios (obrador_id, email, nombre, password_hash, rol)
         VALUES ($1, lower($2), $3, $4, $5) RETURNING ${CAMPOS}`,
        [req.usuario.obrador_id, datos.email, datos.nombre, hash, datos.rol]
      );
      return { usuario: rows[0] };
    });
    if (resultado.sinPlaza) {
      return res.status(402).json({
        error: `Has usado las ${resultado.sinPlaza.total} plazas de tu plan. Añade un usuario extra (+3 €/mes) o desactiva a alguien.`,
        codigo: "sin_plazas",
        plazas: resultado.sinPlaza,
      });
    }
    res.status(201).json({ usuario: resultado.usuario, passwordTemporal: pass });
  })
);

const esquemaCambio = z
  .object({
    nombre: z.string().trim().min(1).max(80).optional(),
    rol: z.enum(ROLES_ASIGNABLES).optional(),
    activo: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "No hay cambios." });

usuariosRouter.patch(
  "/:id",
  ruta(async (req, res) => {
    const datos = validar(esquemaCambio, req.body, res);
    if (!datos) return;
    const r = await db(req, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [req.usuario.obrador_id]);
      const { rows: [actual] } = await c.query(`SELECT ${CAMPOS} FROM usuarios WHERE id = $1`, [req.params.id]);
      if (!actual) return { status: 404, error: "Usuario no encontrado." };
      if (actual.rol === "gestor" && (datos.rol || datos.activo === false)) {
        return { status: 400, error: "El gestor no puede cambiar de rol ni desactivarse." };
      }
      if (datos.activo === true && !actual.activo) {
        const p = await plazas(c);
        if (p.ocupadas >= p.total) return { status: 402, error: "No quedan plazas libres en tu plan para reactivarlo.", codigo: "sin_plazas" };
      }
      const { rows } = await c.query(
        `UPDATE usuarios SET nombre = COALESCE($2, nombre), rol = COALESCE($3, rol), activo = COALESCE($4, activo)
          WHERE id = $1 RETURNING ${CAMPOS}`,
        [req.params.id, datos.nombre ?? null, datos.rol ?? null, datos.activo ?? null]
      );
      return { usuario: rows[0] };
    });
    if (r.error) return res.status(r.status).json({ error: r.error, codigo: r.codigo });
    res.json({ usuario: r.usuario });
  })
);

usuariosRouter.post(
  "/:id/restablecer-password",
  ruta(async (req, res) => {
    const pass = passwordTemporal();
    const hash = await hashPassword(pass);
    const ok = await db(req, async (c) => {
      const { rowCount } = await c.query(
        "UPDATE usuarios SET password_hash = $2, debe_cambiar_password = true WHERE id = $1",
        [req.params.id, hash]
      );
      return rowCount > 0;
    });
    if (!ok) return res.status(404).json({ error: "Usuario no encontrado." });
    res.json({ passwordTemporal: pass });
  })
);
