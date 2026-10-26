import React from "react";
import { num, fecha, diasHasta } from "./ui.jsx";

/** Un lote presentado como una etiqueta colgante: nº de lote grande, stock con barra. */
export default function EtiquetaLote({ r, onClick }) {
  const pct = r.cantidad > 0 ? Math.max(0, Math.min(100, (r.disponible / r.cantidad) * 100)) : 0;
  const dias = diasHasta(r.caducidad);
  const agotado = r.disponible <= 0;
  return (
    <button type="button" className="etiqueta" onClick={onClick}>
      <div style={{ minWidth: 0 }}>
        <div className="producto">{r.producto}</div>
        <div className={`lote ${r.num_lote ? "" : "sin-lote"}`}>{r.num_lote || "Sin nº de lote"}</div>
      </div>
      <div className="cantidad">
        <strong>{num(r.disponible)}</strong> <span className="suave">{r.unidad}</span>
        <div className="pequeno suave">de {num(r.cantidad)}</div>
      </div>
      <div className={`barra-stock ${agotado ? "agotado" : ""}`} aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="meta">
        <span>{fecha(r.fecha, { day: "numeric", month: "short" })}</span>
        {r.marca && <span>{r.marca}</span>}
        {r.proveedor && <span>{r.proveedor}</span>}
        {agotado && <span className="distintivo">Agotado</span>}
        {!agotado && dias !== null && dias < 0 && <span className="distintivo rojo">Caducado</span>}
        {!agotado && dias !== null && dias >= 0 && dias <= 7 && (
          <span className="distintivo ambar">Caduca {dias === 0 ? "hoy" : `en ${dias} d`}</span>
        )}
        {r.estado_entrada === "no_conforme" && <span className="distintivo rojo">No conforme</span>}
        {!r.activo && <span className="distintivo">De baja</span>}
      </div>
    </button>
  );
}
