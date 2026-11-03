// Firma de la plataforma en las impresiones: monograma OC de Obrador Control,
// en gris claro y centrado al pie de cada página (como una marca de agua).
const GRIS_MARCA = "#b9c1bd";
const SVG_OC = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 230 120">
  <circle cx="58" cy="60" r="44" fill="none" stroke="${GRIS_MARCA}" stroke-width="16"/>
  <path d="M197.1 28.9 A44 44 0 1 0 197.1 91.1" fill="none" stroke="${GRIS_MARCA}" stroke-width="16" stroke-linecap="round"/>
  <path d="M150 62 L162 74 L190 44" fill="none" stroke="${GRIS_MARCA}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/** Columna central del pie de página de los PDF. */
export const marcaPie = () => ({
  width: 110,
  stack: [
    { svg: SVG_OC, width: 20, alignment: "center" },
    { text: "OBRADOR CONTROL", fontSize: 5.5, bold: true, color: GRIS_MARCA, alignment: "center", characterSpacing: 1.2, margin: [0, 1, 0, 0] },
  ],
});
