import React from "react";

const TEXTO = {
  ok: ["verde", "Control térmico correcto"],
  pendiente: ["ambar", "Abatimiento pendiente"],
  fuera_de_rango: ["rojo", "Control térmico fuera de rango"],
};

/** Distintivo con el estado de cocción y abatimiento de un lote. */
export default function EstadoTermico({ control }) {
  if (!control || control.estado === "no_aplica") return null;
  const [tono, texto] = TEXTO[control.estado];
  return <span className={`distintivo ${tono}`}>{texto}</span>;
}
