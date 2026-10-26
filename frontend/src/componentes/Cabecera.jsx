import React from "react";
import { ArrowLeft } from "lucide-react";
import { useSesion } from "./ui.jsx";

/** Cabecera de cada pantalla: título y, si procede, botón de volver. */
export default function Cabecera({ titulo, volver, accion }) {
  const { obrador } = useSesion();
  return (
    <header className="cabecera">
      {volver && (
        <button className="boton-icono" onClick={() => (window.location.hash = volver)} aria-label="Volver">
          <ArrowLeft size={24} />
        </button>
      )}
      <div className="titulo">
        <h1>{titulo}</h1>
        {!volver && <div className="obrador">{obrador.nombre}</div>}
      </div>
      {accion}
    </header>
  );
}
