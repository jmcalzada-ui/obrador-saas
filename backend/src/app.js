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
import { errorPostgres } from "./lib/utiles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// En producción el servidor sirve también la app compilada (frontend/dist).
const publicDir = path.resolve(__dirname, "../../frontend/dist");

export function crearApp() {
  const app = express();
  app.set("trust proxy", 1); // Railway pone un proxy delante: IP real para el límite de intentos de login
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/salud", (req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/usuarios", usuariosRouter);
  app.use("/api/obrador", obradorRouter);
  app.use("/api/catalogo", catalogoRouter);
  app.use("/api/recepciones", recepcionesRouter);
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
