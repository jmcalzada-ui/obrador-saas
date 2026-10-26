import React, { useEffect, useState } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Cargando, useSesion, num, fecha, diasHasta } from "../componentes/ui.jsx";
import EstadoTermico from "../componentes/EstadoTermico.jsx";
import Cabecera from "../componentes/Cabecera.jsx";
import Filtros, { filtrosVacios, aParametros } from "../componentes/Filtros.jsx";
import Tabla from "../componentes/Tabla.jsx";
import useEscritorio from "../hooks/useEscritorio.js";
import { ELABORACION } from "../componentes/elaboracion.js";

function Caducidad({ p }) {
  const dias = diasHasta(p.caducidad);
  const vivo = p.disponible == null ? p.activo : p.disponible > 0;
  if (dias === null || !vivo) return null;
  if (dias < 0) return <span className="distintivo rojo">Caducado</span>;
  if (dias <= 2) return <span className="distintivo ambar">Caduca {dias === 0 ? "hoy" : `en ${dias} d`}</span>;
  return null;
}

/** Listado de producción intermedia o de producto final (según `tipo`). */
export default function Preparados({ tipo = "intermedia" }) {
  const cfg = ELABORACION[tipo];
  const { puede } = useSesion();
  const escritorio = useEscritorio();
  const [vista, setVista] = useState(cfg.conStock ? "stock" : "todos"); // stock | todos | guardados
  const [f, setF] = useState(filtrosVacios);
  const [lista, setLista] = useState(null);
  const [guardados, setGuardados] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { setVista(cfg.conStock ? "stock" : "todos"); setF(filtrosVacios()); setLista(null); setGuardados(null); }, [tipo]);

  useEffect(() => {
    if (vista === "guardados") {
      api.get(`/catalogo/productos?tipo=${cfg.tipoProducto}`).then(({ productos }) => setGuardados(productos)).catch((e) => setError(e.message));
      return;
    }
    const t = setTimeout(() => {
      api.get(`${cfg.api}?${aParametros(f, vista === "stock" ? { con_stock: "1" } : {})}`)
        .then((d) => { setLista(d[cfg.lista]); setError(""); })
        .catch((e) => setError(e.message));
    }, f.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [f, vista, tipo]);

  const ir = (p) => (window.location.hash = `${cfg.ruta}/${p.id}`);
  const filtrando = f.q || f.desde || f.hasta;
  const vistas = [...(cfg.conStock ? [["stock", "Con stock"]] : []), ["todos", "Todos los lotes"], ["guardados", "Nombres guardados"]];

  const columnas = [
    { titulo: "Fecha", celda: (p) => fecha(p.fecha), ancho: 110 },
    { titulo: "Producto", ajustar: true, celda: (p) => <strong>{p.producto}</strong> },
    { titulo: "Lote", celda: (p) => <span className="lote-tabla">{p.num_lote}</span> },
    { titulo: "Cantidad", num: true, celda: (p) => `${num(p.cantidad)} ${p.unidad}` },
    ...(cfg.conStock ? [{ titulo: "Stock", num: true, celda: (p) => `${num(p.disponible)} ${p.unidad}` }] : []),
    ...(cfg.conUnidades ? [{ titulo: "Unidades", num: true, celda: (p) => (p.unidades != null ? num(p.unidades) : "—") }] : []),
    { titulo: "Caducidad", celda: (p) => <span className="fila" style={{ gap: 6 }}>{fecha(p.caducidad)} <Caducidad p={p} /></span> },
    { titulo: "Responsable", ajustar: true, celda: (p) => p.responsable || "—" },
    { titulo: "Control térmico", celda: (p) => (p.proceso_termico ? <EstadoTermico control={p.control_termico} /> : <span className="suave">No aplica</span>) },
  ];

  return (
    <>
      <Cabecera titulo={cfg.titulo} />
      <main className="contenido ancho">
        <div className="opciones compactas" role="radiogroup" aria-label="Qué mostrar">
          {vistas.map(([v, t]) => (
            <button key={v} type="button" role="radio" className="opcion" aria-checked={vista === v} onClick={() => setVista(v)}>{t}</button>
          ))}
        </div>
        {vista !== "guardados" && (
          <Filtros f={f} setF={setF} placeholder="Producto (primeras letras) o lote" informe={cfg.clave}
            parametros={vista === "stock" ? { con_stock: "1" } : {}} etiquetaFechas="Elaborado" />
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}

        {vista === "guardados" ? (
          !guardados ? <Cargando /> : guardados.length === 0 ? (
            <div className="vacio panel"><p>Aún no hay nombres guardados. Se guardan solos la primera vez que registras un lote.</p></div>
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
              <div className="vacio panel"><p>{filtrando ? "Nada coincide con los filtros." : vista === "stock" ? "No hay lotes con stock." : "Aún no hay lotes registrados."}</p></div>
            )}
            {lista && lista.length > 0 && <p className="suave pequeno">{lista.length} {lista.length === 1 ? "lote" : "lotes"}</p>}
            {lista && lista.length > 0 && escritorio && <Tabla columnas={columnas} filas={lista} onFila={ir} etiqueta={cfg.titulo} />}
            {lista && lista.length > 0 && !escritorio && lista.map((p) => {
              const conStock = p.disponible != null;
              const pct = conStock && p.cantidad > 0 ? Math.max(0, Math.min(100, (p.disponible / p.cantidad) * 100)) : 0;
              return (
                <button key={p.id} type="button" className="etiqueta" onClick={() => ir(p)}>
                  <div style={{ minWidth: 0 }}>
                    <div className="producto">{p.producto}</div>
                    <div className="lote">{p.num_lote}</div>
                  </div>
                  <div className="cantidad">
                    <strong>{num(conStock ? p.disponible : p.cantidad)}</strong> <span className="suave">{p.unidad}</span>
                    <div className="pequeno suave">{conStock ? `de ${num(p.cantidad)}` : p.unidades != null ? `${num(p.unidades)} uds.` : "elaborado"}</div>
                  </div>
                  {conStock && <div className={`barra-stock ${p.disponible <= 0 ? "agotado" : ""}`} aria-hidden><span style={{ width: `${pct}%` }} /></div>}
                  <div className="meta">
                    <span>{fecha(p.fecha, { day: "numeric", month: "short" })}</span>
                    {p.responsable && <span>{p.responsable}</span>}
                    <Caducidad p={p} />
                    <EstadoTermico control={p.control_termico} />
                    {!p.activo && <span className="distintivo">De baja</span>}
                  </div>
                </button>
              );
            })}
          </>
        )}
      </main>
      {puede("registrar") && (
        <div className="accion-fija">
          <button className="boton principal grande" onClick={() => (window.location.hash = `${cfg.ruta}/nuevo`)}><Plus size={22} aria-hidden /> {cfg.botonNuevo}</button>
        </div>
      )}
    </>
  );
}
