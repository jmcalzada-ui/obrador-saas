import React from "react";

export const ALERGENOS = [
  ["gluten", "Gluten"], ["crustaceos", "Crustáceos"], ["huevo", "Huevo"], ["pescado", "Pescado"], ["cacahuetes", "Cacahuetes"],
  ["soja", "Soja"], ["leche", "Leche"], ["frutos_cascara", "Frutos de cáscara"], ["apio", "Apio"], ["mostaza", "Mostaza"],
  ["sesamo", "Sésamo"], ["sulfitos", "Sulfitos"], ["altramuces", "Altramuces"], ["moluscos", "Moluscos"],
];
export const nombreAlergeno = Object.fromEntries(ALERGENOS);

/**
 * Los 14 alérgenos con tres estados. Cada pulsación pasa al siguiente:
 * sin marcar → contiene (azul) → trazas (verde) → sin marcar.
 */
export default function SelectorAlergenos({ alergenos, trazas, onCambio }) {
  function pulsar(k) {
    if (alergenos.includes(k)) onCambio({ alergenos: alergenos.filter((a) => a !== k), trazas: [...trazas.filter((a) => a !== k), k] });
    else if (trazas.includes(k)) onCambio({ alergenos, trazas: trazas.filter((a) => a !== k) });
    else onCambio({ alergenos: [...alergenos, k], trazas: trazas.filter((a) => a !== k) });
  }
  return (
    <div className="campo">
      <span style={{ fontWeight: 700 }}>Alérgenos y trazas</span>
      <div className="leyenda-alergenos" aria-hidden>
        <span><i className="muestra contiene" /> Contiene</span>
        <span><i className="muestra trazas" /> Trazas (puede contener)</span>
        <span className="suave">Pulsa una vez: contiene · otra: trazas · otra: quitar</span>
      </div>
      <div className="alergenos">
        {ALERGENOS.map(([k, t]) => {
          const estado = alergenos.includes(k) ? "contiene" : trazas.includes(k) ? "trazas" : "";
          return (
            <button key={k} type="button" className={`alergeno ${estado}`} onClick={() => pulsar(k)}
              aria-label={`${t}: ${estado === "contiene" ? "contiene" : estado === "trazas" ? "trazas" : "no"}`}>
              <span>{t}</span>
              <small>{estado === "contiene" ? "Contiene" : estado === "trazas" ? "Trazas" : " "}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Resumen en texto: "Contiene: …" y "Trazas: …". */
export function ResumenAlergenos({ alergenos = [], trazas = [] }) {
  const t = trazas.filter((a) => !alergenos.includes(a));
  if (!alergenos.length && !t.length) return <span className="suave" style={{ fontWeight: 400 }}>Ninguno indicado</span>;
  return (
    <span className="resumen-alergenos">
      {alergenos.map((a) => <span key={a} className="alergeno-mini contiene">{nombreAlergeno[a] || a}</span>)}
      {t.map((a) => <span key={a} className="alergeno-mini trazas">Trazas: {nombreAlergeno[a] || a}</span>)}
    </span>
  );
}
