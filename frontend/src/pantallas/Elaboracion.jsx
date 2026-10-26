import React from "react";
import Cabecera from "../componentes/Cabecera.jsx";

export default function Elaboracion() {
  return (
    <>
      <Cabecera titulo="Elaboración" />
      <main className="contenido">
        <div className="panel pila">
          <h2>Preparados y producción</h2>
          <p>
            Aquí registrarás los preparados internos y los lotes de producción, eligiendo los lotes de ingredientes con
            stock. Llega en la siguiente fase del desarrollo; la base de datos ya está preparada para ello.
          </p>
        </div>
      </main>
    </>
  );
}
