import React from "react";

/** Tabla para ordenador. columnas: [{ titulo, celda: (fila) => nodo, num?: bool, ajustar?: bool (texto largo que puede partirse), ancho? }] */
export default function Tabla({ columnas, filas, clave = (f) => f.id, onFila, etiqueta }) {
  return (
    <div className="tabla-scroll">
      <table className="tabla datos-tabla" aria-label={etiqueta}>
        <thead>
          <tr>{columnas.map((c) => <th key={c.titulo} className={c.num ? "num" : undefined} style={c.ancho ? { width: c.ancho } : undefined}>{c.titulo}</th>)}</tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={clave(f)} onClick={onFila ? () => onFila(f) : undefined} tabIndex={onFila ? 0 : undefined}
              onKeyDown={onFila ? (e) => e.key === "Enter" && onFila(f) : undefined}>
              {columnas.map((c) => <td key={c.titulo} className={[c.num && "num", c.ajustar && "ajustar"].filter(Boolean).join(" ") || undefined}>{c.celda(f)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
