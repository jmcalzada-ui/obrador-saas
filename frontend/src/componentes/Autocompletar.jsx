import React, { useId, useMemo, useState } from "react";
import { Plus } from "lucide-react";

export const normal = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Campo con sugerencias al escribir las primeras letras. Al elegir una
 * opción se llama a onElegir(opcion). Si no existe, ofrece crearla.
 *   opciones: [{ id, texto, detalle? }]
 */
export default function Autocompletar({
  etiqueta, valor, onTexto, opciones, onElegir, onCrear, textoCrear = (t) => `Añadir «${t}»`,
  placeholder, autoFocus, maxSugerencias = 8, mostrarTodasVacio = false,
}) {
  const id = useId();
  const [abierto, setAbierto] = useState(Boolean(autoFocus));
  const filtradas = useMemo(() => {
    const n = normal(valor);
    if (!n) return mostrarTodasVacio ? opciones.slice(0, maxSugerencias) : [];
    // Primero las que empiezan por lo escrito, luego las que lo contienen.
    const empieza = opciones.filter((o) => normal(o.texto).startsWith(n));
    const contiene = opciones.filter((o) => !normal(o.texto).startsWith(n) && normal(o.texto).includes(n));
    return [...empieza, ...contiene].slice(0, maxSugerencias);
  }, [valor, opciones, maxSugerencias, mostrarTodasVacio]);
  const exacto = opciones.some((o) => normal(o.texto) === normal(valor));

  return (
    <div className="campo autocompletar">
      {etiqueta && <label htmlFor={id}>{etiqueta}</label>}
      <input
        id={id}
        className="entrada"
        value={valor}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={abierto && (filtradas.length > 0 || Boolean(onCrear))}
        aria-controls={`${id}-lista`}
        onFocus={() => setAbierto(true)}
        onChange={(e) => { onTexto(e.target.value); setAbierto(true); }}
      />
      {abierto && (filtradas.length > 0 || (onCrear && valor.trim() && !exacto)) && (
        <ul className="sugerencias" id={`${id}-lista`} role="listbox">
          {filtradas.map((o) => (
            <li key={o.id} role="option" aria-selected="false">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onElegir(o); setAbierto(false); }}>
                <span>{o.texto}</span>
                {o.detalle && <span className="suave pequeno">{o.detalle}</span>}
              </button>
            </li>
          ))}
          {onCrear && valor.trim() && !exacto && (
            <li role="option" aria-selected="false">
              <button type="button" className="crear" onMouseDown={(e) => e.preventDefault()} onClick={() => { onCrear(valor.trim()); setAbierto(false); }}>
                <Plus size={18} aria-hidden /> {textoCrear(valor.trim())}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
