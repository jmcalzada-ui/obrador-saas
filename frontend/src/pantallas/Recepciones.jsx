import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Cargando, useSesion, num, fecha, euros, diasHasta } from "../componentes/ui.jsx";
import Cabecera from "../componentes/Cabecera.jsx";
import EtiquetaLote from "../componentes/EtiquetaLote.jsx";
import Filtros, { filtrosVacios, aParametros } from "../componentes/Filtros.jsx";
import Tabla, { ordenar, SelectorOrden } from "../componentes/Tabla.jsx";
import useEscritorio from "../hooks/useEscritorio.js";
import { CONTROL_STOCK } from "../componentes/fase.js";

const ir = (r) => (window.location.hash = `/entradas/${r.id}`);

function EstadoLote({ r }) {
  const dias = diasHasta(r.caducidad);
  if (!r.activo) return <span className="distintivo">De baja</span>;
  if (r.estado_entrada === "no_conforme") return <span className="distintivo rojo">No conforme</span>;
  if (CONTROL_STOCK && r.disponible <= 0) return <span className="distintivo">Agotado</span>;
  if (dias !== null && dias < 0) return <span className="distintivo rojo">Caducado</span>;
  if (dias !== null && dias <= 7) return <span className="distintivo ambar">Caduca {dias === 0 ? "hoy" : `en ${dias} d`}</span>;
  if (r.estado_entrada === "conforme_con_incidencia") return <span className="distintivo ambar">Con incidencia</span>;
  return <span className="distintivo verde">Conforme</span>;
}

const COLUMNAS = [
  { titulo: "Fecha", celda: (r) => fecha(r.fecha), orden: (r) => r.fecha, ancho: 110 },
  { titulo: "Producto", ajustar: true, celda: (r) => <strong>{r.producto}</strong>, orden: (r) => r.producto },
  { titulo: "Marca", ajustar: true, celda: (r) => r.marca || "—", orden: (r) => r.marca || "" },
  { titulo: "Proveedor", ajustar: true, celda: (r) => r.proveedor || "—", orden: (r) => r.proveedor || "" },
  { titulo: "Lote", celda: (r) => <span className="lote-tabla">{r.num_lote || "—"}</span>, orden: (r) => r.num_lote || "" },
  { titulo: "Caducidad", celda: (r) => fecha(r.caducidad), orden: (r) => r.caducidad || "" },
  { titulo: "Cantidad", num: true, celda: (r) => `${num(r.cantidad)} ${r.unidad}`, orden: (r) => r.cantidad },
  { titulo: "Bultos", num: true, celda: (r) => r.bultos ?? "—", orden: (r) => r.bultos ?? -1 },
  ...(CONTROL_STOCK ? [{ titulo: "Stock", num: true, celda: (r) => `${num(r.disponible)} ${r.unidad}`, orden: (r) => r.disponible }] : []),
  { titulo: "€/ud", num: true, celda: (r) => (r.precio_unidad != null ? euros(r.precio_unidad) : "—"), orden: (r) => r.precio_unidad ?? -1 },
  { titulo: "T.ª", num: true, celda: (r) => (r.temp_entrada != null ? `${num(r.temp_entrada)} °C` : "—"), orden: (r) => r.temp_entrada ?? -99 },
  { titulo: "Estado", celda: (r) => <EstadoLote r={r} />, orden: (r) => (!r.activo ? "4" : r.estado_entrada === "no_conforme" ? "0" : r.estado_entrada === "conforme_con_incidencia" ? "1" : "2") },
];

export default function Recepciones() {
  const { puede } = useSesion();
  const escritorio = useEscritorio();
  const [f, setF] = useState(filtrosVacios);
  const [soloStock, setSoloStock] = useState(CONTROL_STOCK);
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const [orden, setOrden] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .get(`/recepciones?${aParametros(f, soloStock ? { con_stock: "1" } : {})}`)
        .then(({ recepciones }) => { setLista(recepciones); setError(""); })
        .catch((e) => setError(e.message));
    }, f.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [f, soloStock]);

  const filtrando = f.q || f.desde || f.hasta;

  return (
    <>
      <Cabecera titulo="Entradas de mercancía" />
      <main className="contenido ancho">
        <Filtros f={f} setF={setF} placeholder="Producto (primeras letras), lote o proveedor" informe="entradas"
          parametros={soloStock ? { con_stock: "1" } : {}} etiquetaFechas="Entrada">
          {CONTROL_STOCK && (
            <div className="opciones compactas" role="radiogroup" aria-label="Qué mostrar">
              <button type="button" role="radio" className="opcion" aria-checked={soloStock} onClick={() => setSoloStock(true)}>Con stock</button>
              <button type="button" role="radio" className="opcion" aria-checked={!soloStock} onClick={() => setSoloStock(false)}>Todas</button>
            </div>
          )}
        </Filtros>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!lista && !error && <Cargando />}
        {lista && lista.length === 0 && (
          <div className="vacio panel">
            <p>{filtrando ? "Nada coincide con los filtros." : soloStock ? "No hay lotes con stock." : "Aún no hay entradas registradas."}</p>
          </div>
        )}
        {lista && lista.length > 0 && (
          <>
            <p className="suave pequeno">{lista.length} {lista.length === 1 ? "entrada" : "entradas"}</p>
            {escritorio
              ? <Tabla columnas={COLUMNAS} filas={ordenar(lista, COLUMNAS, orden)} orden={orden} onOrden={setOrden} onFila={ir} etiqueta="Entradas de mercancía" />
              : <>
                  <SelectorOrden columnas={COLUMNAS} orden={orden} onOrden={setOrden} />
                  {ordenar(lista, COLUMNAS, orden).map((r) => <EtiquetaLote key={r.id} r={r} onClick={() => ir(r)} />)}
                </>}
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
