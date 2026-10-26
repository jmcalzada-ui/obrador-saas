import React, { useState } from "react";
import { Search, FileSpreadsheet, FileText, X } from "lucide-react";
import { api } from "../api.js";
import { useToast } from "./ui.jsx";

/**
 * Barra de filtros común a Productos, Entradas, Producción intermedia y
 * Producto final: lupa por producto, rango de fechas y descarga de lo que
 * se está viendo en Excel o PDF (A4 apaisado, en casillas).
 */
const NOMBRE = { productos: "productos", entradas: "entradas", intermedia: "produccion-intermedia", final: "producto-final" };

export default function Filtros({ f, setF, placeholder, informe, parametros = {}, etiquetaFechas = "Fecha", children }) {
  const toast = useToast();
  const [bajando, setBajando] = useState(null);
  const cambiar = (p) => setF((x) => ({ ...x, ...p }));
  const hayFechas = f.desde || f.hasta;

  async function descargar(formato) {
    const p = new URLSearchParams({ formato, ...parametros });
    if (f.q.trim()) p.set("q", f.q.trim());
    if (f.desde) p.set("desde", f.desde);
    if (f.hasta) p.set("hasta", f.hasta);
    setBajando(formato);
    try {
      const sufijo = [f.desde, f.hasta].filter(Boolean).join("_") || new Date().toISOString().slice(0, 10);
      await api.descargar(`/informes/${informe}?${p}`, `${NOMBRE[informe] || informe}_${sufijo}.${formato}`, formato === "pdf");
    } catch (e) {
      toast(e.message);
    } finally {
      setBajando(null);
    }
  }

  return (
    <div className="filtros">
      <div className="buscador">
        <Search size={20} aria-hidden />
        <input className="entrada" type="search" placeholder={placeholder} aria-label="Buscar por producto"
          value={f.q} onChange={(e) => cambiar({ q: e.target.value })} />
      </div>
      <div className="fechas">
        <label>
          <span>{etiquetaFechas} desde</span>
          <input className="entrada" type="date" value={f.desde} max={f.hasta || undefined} onChange={(e) => cambiar({ desde: e.target.value })} />
        </label>
        <label>
          <span>hasta</span>
          <input className="entrada" type="date" value={f.hasta} min={f.desde || undefined} onChange={(e) => cambiar({ hasta: e.target.value })} />
        </label>
        {hayFechas && (
          <button type="button" className="boton-icono" aria-label="Quitar fechas" onClick={() => cambiar({ desde: "", hasta: "" })}><X size={20} /></button>
        )}
      </div>
      {children}
      <div className="exportar">
        <button type="button" className="boton" disabled={!!bajando} onClick={() => descargar("xlsx")}>
          <FileSpreadsheet size={20} aria-hidden /> {bajando === "xlsx" ? "Generando…" : "Excel"}
        </button>
        <button type="button" className="boton" disabled={!!bajando} onClick={() => descargar("pdf")}>
          <FileText size={20} aria-hidden /> {bajando === "pdf" ? "Generando…" : "Imprimir PDF"}
        </button>
      </div>
    </div>
  );
}

export const filtrosVacios = () => ({ q: "", desde: "", hasta: "" });

/** Pasa los filtros a parámetros de la API. */
export function aParametros(f, extra = {}) {
  const p = new URLSearchParams({ limite: "500", ...extra });
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.desde) p.set("desde", f.desde);
  if (f.hasta) p.set("hasta", f.hasta);
  return p;
}
