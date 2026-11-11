// Datos públicos del titular para las páginas legales (aviso legal, privacidad…).
import { Router } from "express";
import { config } from "../config.js";

export const legalRouter = Router();

legalRouter.get("/titular", (req, res) => {
  res.json({ ...config.titular, version: config.versionLegal });
});
