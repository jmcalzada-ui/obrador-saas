import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Cargando, useSesion, diasHasta } from "../componentes/ui.jsx";
import Cabecera from "../componentes/Cabecera.jsx";
import EtiquetaLote from "../componentes/EtiquetaLote.jsx";

function saludo() {
  const h = new Date().getHours();
  return h < 13 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches";
}

export default function Inicio() {
  const { usuario, obrador, puede } = useSesion();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/recepciones?con_stock=1&limite=500")
      .then(({ recepciones }) => setDatos(recepciones))
      .catch((e) => setError(e.message));
  }, []);

  const caducan = datos?.filter((r) => {
    const d = diasHasta(r.caducidad);
    return d !== null && d <= 7;
  });
  const diasPrueba = obrador.estado === "prueba" ? diasHasta(obrador.prueba_hasta) : null;

  return (
    <>
      <Cabecera titulo={`${saludo()}, ${usuario.nombre.split(" ")[0]}`} />
      <main className="contenido">
        {usuario.rol === "gestor" && diasPrueba !== null && (
          <Aviso>
            {diasPrueba > 0 ? `Te quedan ${diasPrueba} días de prueba gratuita.` : "Tu periodo de prueba ha terminado."}
          </Aviso>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!datos && !error && <Cargando />}
        {datos && (
          <>
            <div className="datos">
              <div className="dato">
                <strong>{datos.length}</strong>
                <span>lotes con stock</span>
              </div>
              <div className="dato">
                <strong style={{ color: caducan.length ? "var(--ambar)" : undefined }}>{caducan.length}</strong>
                <span>caducan en 7 días o menos</span>
              </div>
            </div>
            {caducan.length > 0 && (
              <section className="seccion">
                <h2>Usar primero</h2>
                {caducan
                  .sort((a, b) => (a.caducidad || "").localeCompare(b.caducidad || ""))
                  .slice(0, 5)
                  .map((r) => (
                    <EtiquetaLote key={r.id} r={r} onClick={() => (window.location.hash = `/recepcion/${r.id}`)} />
                  ))}
              </section>
            )}
            {datos.length === 0 && (
              <div className="vacio panel">
                <p>Todavía no hay mercancía con stock. Empieza registrando la primera recepción.</p>
              </div>
            )}
          </>
        )}
      </main>
      {puede("registrar") && (
        <div className="accion-fija">
          <button className="boton principal grande" onClick={() => (window.location.hash = "/recepcion/nueva")}>
            <Plus size={22} aria-hidden /> Registrar recepción
          </button>
        </div>
      )}
    </>
  );
}
