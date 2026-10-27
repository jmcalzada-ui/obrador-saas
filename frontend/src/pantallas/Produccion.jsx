import React, { useEffect, useMemo, useState } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Cargando, useSesion, num, fecha, diasHasta } from "../componentes/ui.jsx";
import EstadoTermico from "../componentes/EstadoTermico.jsx";
import Cabecera from "../componentes/Cabecera.jsx";
import Filtros, { filtrosVacios, aParametros } from "../componentes/Filtros.jsx";
import Tabla from "../componentes/Tabla.jsx";
import useEscritorio from "../hooks/useEscritorio.js";
import { rutaLote } from "../componentes/elaboracion.js";

const TIPOS = [["todas", "Todas"], ["internas", "Internas"], ["finales", "Finales"], ["guardados", "Nombres guardados"]];
const PARAM = { todas: {}, internas: { interna: "1" }, finales: { interna: "0" } };

function Caducidad({ p }) {
  const dias = diasHasta(p.caducidad);
  if (dias === null || !p.activo) return null;
  if (dias < 0) return <span className="distintivo rojo">Caducado</span>;
  if (dias <= 2) return <span className="distintivo ambar">Caduca {dias === 0 ? "hoy" : `en ${dias} d`}</span>;
  return null;
}
const Interna = ({ p }) => (p.interna ? <span className="distintivo azul">Interna</span> : <span className="distintivo">Final</span>);

const ir = (p) => (window.location.hash = rutaLote(p.clase, p.id));

const COLUMNAS = [
  { titulo: "Fecha", celda: (p) => fecha(p.fecha), orden: (p) => p.fecha, ancho: 110 },
  { titulo: "Producto", ajustar: true, celda: (p) => <strong>{p.producto}</strong>, orden: (p) => p.producto },
  { titulo: "Interna", celda: (p) => <Interna p={p} />, orden: (p) => p.interna, ancho: 90 },
  { titulo: "Lote", celda: (p) => <span className="lote-tabla">{p.num_lote}</span>, orden: (p) => p.num_lote },
  { titulo: "Cantidad", num: true, celda: (p) => `${num(p.cantidad)} ${p.unidad}`, orden: (p) => p.cantidad },
  { titulo: "Uds.", num: true, celda: (p) => (p.unidades != null ? num(p.unidades) : "—"), orden: (p) => p.unidades ?? -1 },
  { titulo: "Caducidad", celda: (p) => <span className="fila" style={{ gap: 6 }}>{fecha(p.caducidad)} <Caducidad p={p} /></span>, orden: (p) => p.caducidad || "" },
  { titulo: "Responsable", ajustar: true, celda: (p) => p.responsable || "—", orden: (p) => p.responsable || "" },
  { titulo: "Control térmico", celda: (p) => (p.proceso_termico ? <EstadoTermico control={p.control_termico} /> : <span className="suave">No aplica</span>), orden: (p) => p.control_termico?.estado || "" },
];

/** Producción: lotes elaborados, internos (se usan como ingrediente) y finales (se venden). */
export default function Produccion() {
  const { puede } = useSesion();
  const escritorio = useEscritorio();
  const [vista, setVista] = useState("todas");
  const [f, setF] = useState(filtrosVacios);
  const [lista, setLista] = useState(null);
  const [guardados, setGuardados] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (vista === "guardados") {
      api.get("/catalogo/productos").then(({ productos }) => setGuardados(productos.filter((p) => p.tipo === "preparado" || p.tipo === "elaborado")))
        .catch((e) => setError(e.message));
      return;
    }
    const t = setTimeout(() => {
      api.get(`/produccion?${aParametros(f, PARAM[vista])}`)
        .then(({ produccion }) => { setLista(produccion); setError(""); })
        .catch((e) => setError(e.message));
    }, f.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [f, vista]);

  const filtrando = f.q || f.desde || f.hasta;
  const internas = useMemo(() => lista?.filter((p) => p.interna).length ?? 0, [lista]);

  return (
    <>
      <Cabecera titulo="Producción" />
      <main className="contenido ancho">
        <div className="opciones compactas" role="radiogroup" aria-label="Qué mostrar">
          {TIPOS.map(([v, t]) => (
            <button key={v} type="button" role="radio" className="opcion" aria-checked={vista === v} onClick={() => setVista(v)}>{t}</button>
          ))}
        </div>
        {vista !== "guardados" && (
          <Filtros f={f} setF={setF} placeholder="Producto (primeras letras) o lote" informe="produccion" parametros={PARAM[vista]} etiquetaFechas="Elaborado" />
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}

        {vista === "guardados" ? (
          !guardados ? <Cargando /> : guardados.length === 0 ? (
            <div className="vacio panel"><p>Aún no hay nombres guardados. Se guardan solos la primera vez que registras una producción.</p></div>
          ) : (
            <ul className="lista">
              {guardados.map((p) => (
                <li key={p.id}>
                  <button className="item" onClick={() => (window.location.hash = `/productos/${p.id}`)}>
                    <span className="principal">
                      <strong>{p.nombre}</strong>
                      <span className="suave pequeno">{p.proceso_termico ? "Con proceso térmico" : "Sin proceso térmico"}{p.vida_util_dias ? ` · vida útil ${p.vida_util_dias} días` : ""}</span>
                    </span>
                    <Interna p={{ interna: p.tipo === "preparado" }} />
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
              <div className="vacio panel"><p>{filtrando || vista !== "todas" ? "Nada coincide con los filtros." : "Aún no hay producciones registradas."}</p></div>
            )}
            {lista && lista.length > 0 && (
              <p className="suave pequeno">
                {lista.length} {lista.length === 1 ? "lote" : "lotes"}
                {vista === "todas" && ` · ${internas} ${internas === 1 ? "interna" : "internas"}, ${lista.length - internas} ${lista.length - internas === 1 ? "final" : "finales"}`}
              </p>
            )}
            {lista && lista.length > 0 && escritorio && <Tabla columnas={COLUMNAS} filas={lista} clave={(p) => `${p.clase}-${p.id}`} onFila={ir} etiqueta="Producción" />}
            {lista && lista.length > 0 && !escritorio && lista.map((p) => (
              <button key={`${p.clase}-${p.id}`} type="button" className="etiqueta" onClick={() => ir(p)}>
                <div style={{ minWidth: 0 }}>
                  <div className="producto">{p.producto}</div>
                  <div className="lote">{p.num_lote}</div>
                </div>
                <div className="cantidad">
                  <strong>{num(p.cantidad)}</strong> <span className="suave">{p.unidad}</span>
                  {p.unidades != null && <div className="pequeno suave">{num(p.unidades)} uds.</div>}
                </div>
                <div className="meta">
                  <Interna p={p} />
                  <span>{fecha(p.fecha, { day: "numeric", month: "short" })}</span>
                  {p.responsable && <span>{p.responsable}</span>}
                  <Caducidad p={p} />
                  <EstadoTermico control={p.control_termico} />
                  {!p.activo && <span className="distintivo">De baja</span>}
                </div>
              </button>
            ))}
          </>
        )}
      </main>
      {puede("registrar") && (
        <div className="accion-fija">
          <button className="boton principal grande" onClick={() => (window.location.hash = "/produccion/nueva")}><Plus size={22} aria-hidden /> Registrar producción</button>
        </div>
      )}
    </>
  );
}
