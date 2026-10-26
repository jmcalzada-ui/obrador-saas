import React, { useEffect, useState } from "react";
import { Plus, Search, ChevronRight } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Cargando, useSesion, num, fecha, diasHasta } from "../componentes/ui.jsx";
import EstadoTermico from "../componentes/EstadoTermico.jsx";
import Cabecera from "../componentes/Cabecera.jsx";

export default function Preparados() {
  const { puede } = useSesion();
  const [vista, setVista] = useState("stock"); // stock | todos | guardados
  const [q, setQ] = useState("");
  const [lista, setLista] = useState(null);
  const [guardados, setGuardados] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (vista === "guardados") {
      api.get("/catalogo/productos?tipo=preparado").then(({ productos }) => setGuardados(productos)).catch((e) => setError(e.message));
      return;
    }
    const t = setTimeout(() => {
      const p = new URLSearchParams({ limite: "200" });
      if (q.trim()) p.set("q", q.trim());
      if (vista === "stock") p.set("con_stock", "1");
      api.get(`/preparados?${p}`).then(({ preparados }) => { setLista(preparados); setError(""); }).catch((e) => setError(e.message));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, vista]);

  return (
    <>
      <Cabecera titulo="Preparados internos" />
      <main className="contenido">
        <div className="opciones" role="radiogroup" aria-label="Qué mostrar">
          {[["stock", "Con stock"], ["todos", "Todos"], ["guardados", "Guardados"]].map(([v, t]) => (
            <button key={v} type="button" role="radio" className="opcion" aria-checked={vista === v} onClick={() => setVista(v)}>{t}</button>
          ))}
        </div>
        {vista !== "guardados" && (
          <div className="buscador">
            <Search size={20} aria-hidden />
            <input className="entrada" type="search" placeholder="Preparado o lote" aria-label="Buscar preparados" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}

        {vista === "guardados" ? (
          !guardados ? <Cargando /> : guardados.length === 0 ? (
            <div className="vacio panel"><p>Aún no hay preparados guardados. Se guardan solos la primera vez que registras uno.</p></div>
          ) : (
            <ul className="lista">
              {guardados.map((p) => (
                <li key={p.id}>
                  <button className="item" onClick={() => (window.location.hash = `/productos/${p.id}`)}>
                    <span className="principal">
                      <strong>{p.nombre}</strong>
                      <span className="suave pequeno">{p.proceso_termico ? "Con proceso térmico" : "Sin proceso térmico"}{p.vida_util_dias ? ` · vida útil ${p.vida_util_dias} días` : ""}</span>
                    </span>
                    <span className="distintivo">{p.unidad_medida}</span>
                    <ChevronRight size={20} aria-hidden className="suave" />
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <>
            {!lista && !error && <Cargando />}
            {lista && lista.length === 0 && (
              <div className="vacio panel"><p>{q ? `Nada coincide con «${q}».` : vista === "stock" ? "No hay preparados con stock." : "Aún no hay preparados registrados."}</p></div>
            )}
            {lista?.map((p) => {
              const dias = diasHasta(p.caducidad);
              const pct = p.cantidad > 0 ? Math.max(0, Math.min(100, (p.disponible / p.cantidad) * 100)) : 0;
              return (
                <button key={p.id} type="button" className="etiqueta" onClick={() => (window.location.hash = `/preparados/${p.id}`)}>
                  <div style={{ minWidth: 0 }}>
                    <div className="producto">{p.producto}</div>
                    <div className="lote">{p.num_lote}</div>
                  </div>
                  <div className="cantidad">
                    <strong>{num(p.disponible)}</strong> <span className="suave">{p.unidad}</span>
                    <div className="pequeno suave">de {num(p.cantidad)}</div>
                  </div>
                  <div className={`barra-stock ${p.disponible <= 0 ? "agotado" : ""}`} aria-hidden><span style={{ width: `${pct}%` }} /></div>
                  <div className="meta">
                    <span>{fecha(p.fecha, { day: "numeric", month: "short" })}</span>
                    {p.responsable && <span>{p.responsable}</span>}
                    {dias !== null && dias < 0 && p.disponible > 0 && <span className="distintivo rojo">Caducado</span>}
                    {dias !== null && dias >= 0 && dias <= 2 && p.disponible > 0 && <span className="distintivo ambar">Caduca {dias === 0 ? "hoy" : `en ${dias} d`}</span>}
                    <EstadoTermico control={p.control_termico} />
                  </div>
                </button>
              );
            })}
          </>
        )}
      </main>
      {puede("registrar") && (
        <div className="accion-fija">
          <button className="boton principal grande" onClick={() => (window.location.hash = "/preparados/nuevo")}><Plus size={22} aria-hidden /> Registrar preparado</button>
        </div>
      )}
    </>
  );
}
