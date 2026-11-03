import React from "react";

/** Monograma OC de Obrador Control (la O del obrador y la C del control con la marca de verificado). */
export function MonogramaOC({ alto = 22, color = "currentColor", acento = "currentColor" }) {
  return (
    <svg height={alto} viewBox="0 0 230 120" role="img" aria-label="Obrador Control">
      <circle cx="58" cy="60" r="44" fill="none" stroke={color} strokeWidth="16" />
      <path d="M197.1 28.9 A44 44 0 1 0 197.1 91.1" fill="none" stroke={color} strokeWidth="16" strokeLinecap="round" />
      <path d="M150 62 L162 74 L190 44" fill="none" stroke={acento} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Firma discreta de la plataforma, como en sombra. */
export default function MarcaOC({ className = "" }) {
  return (
    <div className={`marca-oc ${className}`}>
      <MonogramaOC alto={18} />
      <span>Obrador Control</span>
    </div>
  );
}
