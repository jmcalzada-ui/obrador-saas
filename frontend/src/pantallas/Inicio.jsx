import React, { useEffect, useState } from "react";
import { Truck, CookingPot } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Cargando, useSesion, diasHasta, hoyISO } from "../componentes/ui.jsx";
import Cabecera from "../componentes/Cabecera.jsx";
import EtiquetaLote from "../componentes/EtiquetaLote.jsx";
import { rutaLote } from "../componentes/elaboracion.js";

function saludo() {
  const h = new Date().getHours();
  return h < 13 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches";
}
const haceDias = (n) => {
  const d = new Date(`${hoyISO()}T12:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export default function Inicio() {
  const { usuario, obrador, puede } = useSesion();
  const [entradas, setEntradas] = useState(null);
  const [produccion, setProduccion] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // Entradas de los últimos 90 días (para avisar de caducidades) y producción de la última semana.
    api.get(`/recepciones?desde=${haceDias(90)}&limite=500`).then(({ recepciones }) => setEntradas(recepciones)).catch((e) => setError(e.message));
    api.get(`/produccion?desde=${haceDias(30)}&limite=500`).then(({ produccion }) => setProduccion(produccion)).catch(() => setProduccion([]));
  }, []);

  const semana = haceDias(6);
  const entradasSemana = entradas?.filter((r) => r.fecha >= semana).length ?? 0;
  const produccionSemana = produccion?.filter((p) => p.fecha >= semana).length ?? 0;
  const pendientes = (produccion || []).filter((p) => p.control_termico?.estado === "pendiente");
  const caducan = (entradas || [])
    .filter((r) => { const d = diasHasta(r.caducidad); return r.activo && d !== null && d >= 0 && d <= 7; })
    .sort((a, b) => (a.caducidad || "").localeCompare(b.caducidad || ""));
  const diasPrueba = obrador.estado === "prueba" ? diasHasta(obrador.prueba_hasta) : null;

  return (
    <>
      <Cabecera titulo={`${saludo()}, ${usuario.nombre.split(" ")[0]}`} />
      <main className="contenido">
        {usuario.rol === "gestor" && diasPrueba !== null && (
          <Aviso>{diasPrueba > 0 ? `Te quedan ${diasPrueba} días de prueba gratuita.` : "Tu periodo de prueba ha terminado."}</Aviso>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!entradas && !error && <Cargando />}
        {entradas && (
          <>
            <div className="datos">
              <button type="button" className="dato" onClick={() => (window.location.hash = "/entradas")}>
                <strong>{entradasSemana}</strong>
                <span>entradas en los últimos 7 días</span>
              </button>
              <button type="button" className="dato" onClick={() => (window.location.hash = "/produccion")}>
                <strong>{produccionSemana}</strong>
                <span>producciones en los últimos 7 días</span>
              </button>
            </div>
            {pendientes.length > 0 && (
              <section className="seccion">
                <h2>Abatimientos por completar</h2>
                <ul className="lista">
                  {pendientes.map((p) => (
                    <li key={`${p.clase}-${p.id}`}>
                      <button className="item" onClick={() => (window.location.hash = rutaLote(p.clase, p.id))}>
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
                <h2>Caducan en los próximos 7 días</h2>
                {caducan.slice(0, 5).map((r) => (
                  <EtiquetaLote key={r.id} r={r} onClick={() => (window.location.hash = `/entradas/${r.id}`)} />
                ))}
              </section>
            )}
            {entradas.length === 0 && (produccion || []).length === 0 && (
              <div className="vacio panel">
                <p>Todavía no hay registros. Empieza por la primera entrada de mercancía.</p>
              </div>
            )}
          </>
        )}
      </main>
      {puede("registrar") && (
        <div className="accion-fija">
          <div className="fila doble">
            <button className="boton principal grande" style={{ flex: 1 }} onClick={() => (window.location.hash = "/entradas/nueva")}>
              <Truck size={22} aria-hidden /> Entrada
            </button>
            <button className="boton principal grande" style={{ flex: 1 }} onClick={() => (window.location.hash = "/produccion/nueva")}>
              <CookingPot size={22} aria-hidden /> Producción
            </button>
          </div>
        </div>
      )}
    </>
  );
}
