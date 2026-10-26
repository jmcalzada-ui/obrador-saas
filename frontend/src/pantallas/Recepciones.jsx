import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Cargando, useSesion, num, fecha, euros, diasHasta } from "../componentes/ui.jsx";
import Cabecera from "../componentes/Cabecera.jsx";
import EtiquetaLote from "../componentes/EtiquetaLote.jsx";
import Filtros, { filtrosVacios, aParametros } from "../componentes/Filtros.jsx";
import Tabla from "../componentes/Tabla.jsx";
import useEscritorio from "../hooks/useEscritorio.js";

const ir = (r) => (window.location.hash = `/entradas/${r.id}`);

function EstadoLote({ r }) {
  const dias = diasHasta(r.caducidad);
  if (!r.activo) return <span className="distintivo">De baja</span>;
  if (r.estado_entrada === "no_conforme") return <span className="distintivo rojo">No conforme</span>;
  if (r.disponible <= 0) return <span className="distintivo">Agotado</span>;
  if (dias !== null && dias < 0) return <span className="distintivo rojo">Caducado</span>;
  if (dias !== null && dias <= 7) return <span className="distintivo ambar">Caduca {dias === 0 ? "hoy" : `en ${dias} d`}</span>;
  return <span className="distintivo verde">Con stock</span>;
}

const COLUMNAS = [
  { titulo: "Fecha", celda: (r) => fecha(r.fecha), ancho: 110 },
  { titulo: "Producto", ajustar: true, celda: (r) => <strong>{r.producto}</strong> },
  { titulo: "Marca", ajustar: true, celda: (r) => r.marca || "—" },
  { titulo: "Proveedor", ajustar: true, celda: (r) => r.proveedor || "—" },
  { titulo: "Lote", celda: (r) => <span className="lote-tabla">{r.num_lote || "—"}</span> },
  { titulo: "Caducidad", celda: (r) => fecha(r.caducidad) },
  { titulo: "Cantidad", num: true, celda: (r) => `${num(r.cantidad)} ${r.unidad}` },
  { titulo: "Stock", num: true, celda: (r) => `${num(r.disponible)} ${r.unidad}` },
  { titulo: "€/ud", num: true, celda: (r) => (r.precio_unidad != null ? euros(r.precio_unidad) : "—") },
  { titulo: "T.ª", num: true, celda: (r) => (r.temp_entrada != null ? `${num(r.temp_entrada)} °C` : "—") },
  { titulo: "Estado", celda: (r) => <EstadoLote r={r} /> },
];

export default function Recepciones() {
  const { puede } = useSesion();
  const escritorio = useEscritorio();
  const [f, setF] = useState(filtrosVacios);
  const [soloStock, setSoloStock] = useState(true);
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");

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
          <div className="opciones compactas" role="radiogroup" aria-label="Qué mostrar">
            <button type="button" role="radio" className="opcion" aria-checked={soloStock} onClick={() => setSoloStock(true)}>Con stock</button>
            <button type="button" role="radio" className="opcion" aria-checked={!soloStock} onClick={() => setSoloStock(false)}>Todas</button>
          </div>
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
              ? <Tabla columnas={COLUMNAS} filas={lista} onFila={ir} etiqueta="Entradas de mercancía" />
              : lista.map((r) => <EtiquetaLote key={r.id} r={r} onClick={() => ir(r)} />)}
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
