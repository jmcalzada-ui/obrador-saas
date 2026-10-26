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
  const [pendientes, setPendientes] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/recepciones?con_stock=1&limite=500")
      .then(({ recepciones }) => setDatos(recepciones))
      .catch((e) => setError(e.message));
    Promise.all([api.get("/preparados?limite=100"), api.get("/producciones?limite=100")])
      .then(([a, b]) => setPendientes([
        ...a.preparados.map((p) => ({ ...p, ruta: `/intermedia/${p.id}` })),
        ...b.producciones.map((p) => ({ ...p, ruta: `/final/${p.id}` })),
      ].filter((p) => p.control_termico?.estado === "pendiente")))
      .catch(() => {});
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
            {pendientes.length > 0 && (
              <section className="seccion">
                <h2>Abatimientos por completar</h2>
                <ul className="lista">
                  {pendientes.map((p) => (
                    <li key={p.ruta}>
                      <button className="item" onClick={() => (window.location.hash = p.ruta)}>
                        <span className="principal"><strong>{p.producto}</strong><span className="suave pequeno">Lote {p.num_lote}</span></span>
                        <span className="distintivo ambar">Pendiente</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {caducan.length > 0 && (
              <section className="seccion">
                <h2>Usar primero</h2>
                {caducan
                  .sort((a, b) => (a.caducidad || "").localeCompare(b.caducidad || ""))
                  .slice(0, 5)
                  .map((r) => (
                    <EtiquetaLote key={r.id} r={r} onClick={() => (window.location.hash = `/entradas/${r.id}`)} />
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
          <button className="boton principal grande" onClick={() => (window.location.hash = "/entradas/nueva")}>
            <Plus size={22} aria-hidden /> Registrar entrada
          </button>
        </div>
      )}
    </>
  );
}
