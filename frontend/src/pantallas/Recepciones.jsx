import React, { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Cargando, useSesion } from "../componentes/ui.jsx";
import Cabecera from "../componentes/Cabecera.jsx";
import EtiquetaLote from "../componentes/EtiquetaLote.jsx";

export default function Recepciones() {
  const { puede } = useSesion();
  const [q, setQ] = useState("");
  const [soloStock, setSoloStock] = useState(true);
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ limite: "200" });
      if (q.trim()) p.set("q", q.trim());
      if (soloStock) p.set("con_stock", "1");
      api
        .get(`/recepciones?${p}`)
        .then(({ recepciones }) => { setLista(recepciones); setError(""); })
        .catch((e) => setError(e.message));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, soloStock]);

  return (
    <>
      <Cabecera titulo="Recepción" />
      <main className="contenido">
        <div className="buscador">
          <Search size={20} aria-hidden />
          <input
            className="entrada" type="search" placeholder="Producto, lote o proveedor"
            aria-label="Buscar recepciones" value={q} onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="opciones" role="radiogroup" aria-label="Qué mostrar">
          <button type="button" role="radio" className="opcion" aria-checked={soloStock} onClick={() => setSoloStock(true)}>Con stock</button>
          <button type="button" role="radio" className="opcion" aria-checked={!soloStock} onClick={() => setSoloStock(false)}>Todas</button>
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!lista && !error && <Cargando />}
        {lista && lista.length === 0 && (
          <div className="vacio panel">
            <p>{q ? `Nada coincide con «${q}».` : soloStock ? "No hay lotes con stock." : "Aún no hay recepciones registradas."}</p>
          </div>
        )}
        {lista?.map((r) => (
          <EtiquetaLote key={r.id} r={r} onClick={() => (window.location.hash = `/recepcion/${r.id}`)} />
        ))}
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
