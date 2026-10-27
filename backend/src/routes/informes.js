// GET /api/informes/:seccion?formato=pdf|xlsx&q=&desde=&hasta=&con_stock=
// Descarga lo que se ve filtrado en un apartado, listo para imprimir en A4.
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermiso, db } from "../auth/middleware.js";
import { ruta, validar } from "../lib/utiles.js";
import { SECCIONES, generarExcel, generarPdf } from "../lib/informes.js";
import { leerLogo } from "./obrador.js";

export const informesRouter = Router();
informesRouter.use(requireAuth, requirePermiso("ver"));

const NOMBRE_ARCHIVO = { productos: "productos", entradas: "entradas", produccion: "produccion", intermedia: "produccion-interna", final: "produccion-final" };

informesRouter.get(
  "/:seccion",
  ruta(async (req, res) => {
    const constructor = SECCIONES[req.params.seccion];
    if (!constructor) return res.status(404).json({ error: "Informe no encontrado." });
    const f = validar(z.object({
      formato: z.enum(["pdf", "xlsx"]).default("pdf"),
      q: z.string().trim().max(80).optional(),
      desde: z.string().date().optional(),
      hasta: z.string().date().optional(),
      con_stock: z.enum(["1", "0"]).optional(),
      interna: z.enum(["1", "0"]).optional(),
    }), req.query, res);
    if (!f) return;
    const { datos, obrador, logo } = await db(req, async (c) => ({
      logo: await leerLogo(c),
      datos: await constructor(c, f),
      obrador: (await c.query("SELECT nombre, razon_social, registro_sanitario FROM obradores WHERE id = $1", [req.usuario.obrador_id])).rows[0],
    }));
    const sufijo = [f.desde, f.hasta].filter(Boolean).join("_") || new Date().toISOString().slice(0, 10);
    const base = req.params.seccion === "produccion" && f.interna ? NOMBRE_ARCHIVO[f.interna === "1" ? "intermedia" : "final"] : NOMBRE_ARCHIVO[req.params.seccion];
    const nombre = `${base}_${sufijo}.${f.formato}`;
    if (f.formato === "xlsx") {
      res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.set("Content-Disposition", `attachment; filename="${nombre}"`);
      return res.send(await generarExcel(datos, obrador, f, logo));
    }
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `inline; filename="${nombre}"`);
    res.send(await generarPdf(datos, obrador, f, logo));
  })
);
