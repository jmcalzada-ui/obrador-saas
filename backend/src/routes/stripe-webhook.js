// Avisos de Stripe (cobros correctos, fallidos, cambios de suscripción).
// Necesita el cuerpo sin procesar para verificar la firma: se monta antes
// de express.json() en app.js.
import express, { Router } from "express";
import { procesarEvento, verificarEvento } from "../lib/cobros.js";

export const stripeWebhookRouter = Router();

stripeWebhookRouter.post("/", express.raw({ type: "application/json" }), async (req, res) => {
  let evento;
  try {
    evento = verificarEvento(req.body, req.headers["stripe-signature"]);
  } catch (e) {
    return res.status(e.status || 400).json({ error: `Aviso no válido: ${e.message}` });
  }
  try {
    const resultado = await procesarEvento(evento);
    res.json({ recibido: true, resultado });
  } catch (e) {
    console.error("[stripe] error procesando", evento.type, e);
    // 500 → Stripe reintentará el aviso más tarde.
    res.status(500).json({ error: "Error procesando el aviso." });
  }
});
