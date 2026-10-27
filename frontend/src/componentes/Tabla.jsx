import React, { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

const comparar = (a, b) => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a ?? "").localeCompare(String(b ?? ""), "es", { numeric: true, sensitivity: "base" });
};

/** Ordena filas según { titulo, dir } (1 = A-Z / menor a mayor, -1 = Z-A / mayor a menor). */
export function ordenar(filas, columnas, orden) {
  const col = orden && columnas.find((c) => c.titulo === orden.titulo);
  if (!filas || !col?.orden) return filas;
  return [...filas].sort((a, b) => comparar(col.orden(a), col.orden(b)) * orden.dir);
}

/** Siguiente estado al pulsar una cabecera: A-Z → Z-A → sin ordenar. */
export const siguienteOrden = (o, titulo) => (o?.titulo !== titulo ? { titulo, dir: 1 } : o.dir === 1 ? { titulo, dir: -1 } : null);

/**
 * Tabla para ordenador. columnas: [{ titulo, celda: (fila) => nodo, orden?: (fila) => valor
 * (pulsando el título se ordena A-Z / Z-A), num?, ajustar? (texto largo), ancho? }]
 * El orden puede llevarlo la pantalla (orden + onOrden) para compartirlo con la vista de móvil.
 */
export default function Tabla({ columnas, filas, clave = (f) => f.id, onFila, etiqueta, orden: ordenExterno, onOrden }) {
  const [ordenInterno, setOrdenInterno] = useState(null);
  const orden = onOrden ? ordenExterno : ordenInterno;
  const setOrden = onOrden || setOrdenInterno;
  const ordenadas = onOrden ? filas : ordenar(filas, columnas, orden);

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
                    <button type="button" className={`ordenar ${activa ? "activa" : ""}`} onClick={() => setOrden(siguienteOrden(orden, c.titulo))}
                      title={activa && orden.dir === 1 ? "Ordenar de Z a A (de mayor a menor)" : "Ordenar de A a Z (de menor a mayor)"}>
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

/** En el móvil (sin tabla): desplegable para ordenar por cualquier columna, A-Z o Z-A. */
export function SelectorOrden({ columnas, orden, onOrden, textoDefecto = "Orden: más recientes primero" }) {
  const valor = orden ? `${orden.titulo}|${orden.dir}` : "";
  return (
    <label className="selector-orden">
      <ArrowUpDown size={18} aria-hidden />
      <span className="oculto-visual">Ordenar por</span>
      <select className="entrada" value={valor} onChange={(e) => {
        const [titulo, dir] = e.target.value.split("|");
        onOrden(titulo ? { titulo, dir: Number(dir) } : null);
      }}>
        <option value="">{textoDefecto}</option>
        {columnas.filter((c) => c.orden).flatMap((c) => [
          <option key={`${c.titulo}1`} value={`${c.titulo}|1`}>{c.titulo}: A → Z / menor a mayor</option>,
          <option key={`${c.titulo}-1`} value={`${c.titulo}|-1`}>{c.titulo}: Z → A / mayor a menor</option>,
        ])}
      </select>
    </label>
  );
}
