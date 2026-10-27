import express from "express";
import helmet from "helmet";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { authRouter } from "./routes/auth.js";
import { usuariosRouter } from "./routes/usuarios.js";
import { obradorRouter } from "./routes/obrador.js";
import { catalogoRouter } from "./routes/catalogo.js";
import { recepcionesRouter } from "./routes/recepciones.js";
import { altaRouter } from "./routes/alta.js";
import { produccionRouter, preparadosRouter, produccionesRouter, stockRouter } from "./routes/preparados.js";
import { adminRouter } from "./routes/admin.js";
import { informesRouter } from "./routes/informes.js";
import { stripeWebhookRouter } from "./routes/stripe-webhook.js";
import { errorPostgres } from "./lib/utiles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// En producción el servidor sirve también la app compilada (frontend/dist).
const publicDir = path.resolve(__dirname, "../../frontend/dist");

export function crearApp() {
  const app = express();
  app.set("trust proxy", 1); // Railway pone un proxy delante: IP real para el límite de intentos de login
  app.use(helmet({ contentSecurityPolicy: false }));
  // El aviso de Stripe necesita el cuerpo tal cual (firma): va antes de express.json().
  app.use("/api/stripe/webhook", stripeWebhookRouter);
  const json = express.json({ limit: "2mb" });
  // La subida de fichas técnicas (PDF) y del logotipo tiene su propio límite.
  app.use((req, res, next) => (req.method === "PUT" && /\/(ficha|logo)$/.test(req.path) ? next() : json(req, res, next)));

  app.get("/api/salud", (req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/usuarios", usuariosRouter);
  app.use("/api/obrador", obradorRouter);
  app.use("/api/catalogo", catalogoRouter);
  app.use("/api/recepciones", recepcionesRouter);
  app.use("/api/preparados", preparadosRouter);
  app.use("/api/producciones", produccionesRouter);
  app.use("/api/produccion", produccionRouter);
  app.use("/api/stock", stockRouter);
  app.use("/api/informes", informesRouter);
  app.use("/api/alta", altaRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api", (req, res) => res.status(404).json({ error: "Ruta no encontrada." }));

  if (fs.existsSync(path.join(publicDir, "index.html"))) {
    app.use(express.static(publicDir, { maxAge: "1h", index: false }));
    app.get(/^(?!\/api\/).*/, (req, res) => {
      res.set("Cache-Control", "no-cache");
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const conocido = errorPostgres(err);
    if (conocido) return res.status(conocido.status).json({ error: conocido.error });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Datos mal formados." });
    console.error(err);
    res.status(500).json({ error: "Error interno del servidor." });
  });
  return app;
}
