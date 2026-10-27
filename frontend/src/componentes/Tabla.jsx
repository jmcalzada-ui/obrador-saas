import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

const comparar = (a, b) => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a ?? "").localeCompare(String(b ?? ""), "es", { numeric: true, sensitivity: "base" });
};

/**
 * Tabla para ordenador. columnas: [{ titulo, celda: (fila) => nodo, orden?: (fila) => valor
 * (la columna se puede ordenar pulsando su título), num?, ajustar? (texto largo), ancho? }]
 */
export default function Tabla({ columnas, filas, clave = (f) => f.id, onFila, etiqueta }) {
  const [orden, setOrden] = useState(null); // { titulo, dir: 1 | -1 }

  const ordenadas = useMemo(() => {
    const col = orden && columnas.find((c) => c.titulo === orden.titulo);
    if (!col?.orden) return filas;
    return [...filas].sort((a, b) => comparar(col.orden(a), col.orden(b)) * orden.dir);
  }, [filas, orden, columnas]);

  function pulsar(c) {
    if (!c.orden) return;
    setOrden((o) => (o?.titulo !== c.titulo ? { titulo: c.titulo, dir: 1 } : o.dir === 1 ? { titulo: c.titulo, dir: -1 } : null));
  }

  return (
    <div className="tabla-scroll">
      <table className="tabla datos-tabla" aria-label={etiqueta}>
        <thead>
          <tr>
            {columnas.map((c) => {
              const activa = orden?.titulo === c.titulo;
              const Icono = activa ? (orden.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <th key={c.titulo} className={c.num ? "num" : undefined} style={c.ancho ? { width: c.ancho } : undefined}
                  aria-sort={activa ? (orden.dir === 1 ? "ascending" : "descending") : undefined}>
                  {c.orden ? (
                    <button type="button" className={`ordenar ${activa ? "activa" : ""}`} onClick={() => pulsar(c)} title="Ordenar">
                      {c.titulo} <Icono size={14} aria-hidden />
                    </button>
                  ) : c.titulo}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f) => (
            <tr key={clave(f)} onClick={onFila ? () => onFila(f) : undefined} tabIndex={onFila ? 0 : undefined}
              onKeyDown={onFila ? (e) => e.key === "Enter" && onFila(f) : undefined}>
              {columnas.map((c) => (
                <td key={c.titulo} className={[c.num && "num", c.ajustar && "ajustar"].filter(Boolean).join(" ") || undefined}>{c.celda(f)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
