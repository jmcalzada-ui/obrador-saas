import React from "react";
import { num, fecha, diasHasta } from "./ui.jsx";
import { CONTROL_STOCK } from "./fase.js";

/** Un lote presentado como una etiqueta colgante: nº de lote grande y cantidad. */
export default function EtiquetaLote({ r, onClick }) {
  const pct = r.cantidad > 0 ? Math.max(0, Math.min(100, (r.disponible / r.cantidad) * 100)) : 0;
  const dias = diasHasta(r.caducidad);
  const agotado = CONTROL_STOCK && r.disponible <= 0;
  return (
    <button type="button" className="etiqueta" onClick={onClick}>
      <div style={{ minWidth: 0 }}>
        <div className="producto">{r.producto}</div>
        <div className={`lote ${r.num_lote ? "" : "sin-lote"}`}>{r.num_lote || "Sin nº de lote"}</div>
      </div>
      <div className="cantidad">
        {CONTROL_STOCK ? (
          <>
            <strong>{num(r.disponible)}</strong> <span className="suave">{r.unidad}</span>
            <div className="pequeno suave">de {num(r.cantidad)}</div>
          </>
        ) : (
          <>
            <strong>{num(r.cantidad)}</strong> <span className="suave">{r.unidad}</span>
            {r.bultos != null && <div className="pequeno suave">{r.bultos} {r.bultos === 1 ? "bulto" : "bultos"}</div>}
          </>
        )}
      </div>
      {CONTROL_STOCK && (
        <div className={`barra-stock ${agotado ? "agotado" : ""}`} aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="meta">
        <span>{fecha(r.fecha, { day: "numeric", month: "short" })}</span>
        {r.marca && <span>{r.marca}</span>}
        {r.proveedor && <span>{r.proveedor}</span>}
        {agotado && <span className="distintivo">Agotado</span>}
        {!agotado && r.activo && dias !== null && dias < 0 && <span className="distintivo rojo">Caducado</span>}
        {!agotado && r.activo && dias !== null && dias >= 0 && dias <= 7 && (
          <span className="distintivo ambar">Caduca {dias === 0 ? "hoy" : `en ${dias} d`}</span>
        )}
        {r.estado_entrada === "no_conforme" && <span className="distintivo rojo">No conforme</span>}
        {!r.activo && <span className="distintivo">De baja</span>}
      </div>
    </button>
  );
}
