import React, { useState } from "react";
import { Printer } from "lucide-react";
import { api } from "../api.js";
import { useToast } from "./ui.jsx";

/**
 * Un clic: PDF con la ficha de trazabilidad del lote (datos, de qué está
 * hecho y a qué clientes ha llegado), lista para imprimir o enseñar en una inspección.
 */
export default function BotonTrazabilidad({ origen, id, numLote }) {
  const toast = useToast();
  const [generando, setGenerando] = useState(false);
  async function abrir() {
    setGenerando(true);
    try { await api.descargar(`/informes/lote/${origen}/${id}`, `trazabilidad-lote_${numLote || "sin-numero"}.pdf`, true); }
    catch (e) { toast(e.message); }
    finally { setGenerando(false); }
  }
  return (
    <button className="boton principal bloque" onClick={abrir} disabled={generando}>
      <Printer size={20} aria-hidden /> {generando ? "Generando…" : "Imprimir trazabilidad del lote (PDF)"}
    </button>
  );
}
