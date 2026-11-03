import React, { useEffect, useState } from "react";
import { Pencil, Trash2, ChevronRight, FileText, Upload } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Cargando, Hoja, useSesion, useToast, num, fecha } from "../componentes/ui.jsx";
import Cabecera from "../componentes/Cabecera.jsx";
import { rutaLote } from "../componentes/elaboracion.js";

/** Ficha de una salida: cliente, pedido y los lotes entregados (enlazados a su lote). */
export default function SalidaDetalle({ id }) {
  const { puede } = useSesion();
  const toast = useToast();
  const [s, setS] = useState(null);
  const [error, setError] = useState("");
  const [borrando, setBorrando] = useState(false);
  useEffect(() => { api.get(`/salidas/${id}`).then(({ salida }) => setS(salida)).catch((e) => setError(e.message)); }, [id]);

  async function borrar() {
    try { await api.delete(`/salidas/${id}`); toast("Salida eliminada"); window.location.hash = "/salidas"; }
    catch (e) { setBorrando(false); setError(e.message); }
  }

  return (
    <>
      <Cabecera titulo="Salida a cliente" volver="/salidas"
        accion={s && puede("editar") && <button className="boton-icono" aria-label="Editar" onClick={() => (window.location.hash = `/salidas/${id}/editar`)}><Pencil size={22} /></button>} />
      <main className="contenido">
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!s && !error && <Cargando />}
        {s && (
          <>
            <div className="etiqueta" style={{ cursor: "default" }}>
              <div style={{ minWidth: 0 }}>
                <div className="producto">{s.cliente}</div>
                <div className="lote">{s.num_pedido}</div>
              </div>
              <div className="cantidad"><strong>{s.lineas.length}</strong> <span className="suave">{s.lineas.length === 1 ? "línea" : "líneas"}</span></div>
              <div className="meta"><span>{fecha(s.fecha)}</span></div>
            </div>
            <dl className="ficha panel">
              <dt>Fecha</dt><dd>{fecha(s.fecha)}</dd>
              <dt>Cliente</dt><dd>{s.cliente}</dd>
              <dt>NIF</dt><dd>{s.cliente_nif || "—"}</dd>
              <dt>Nº de pedido</dt><dd>{s.num_pedido}</dd>
              {s.observaciones && <><dt>Notas</dt><dd style={{ fontWeight: 400 }}>{s.observaciones}</dd></>}
              <dt>Registró</dt><dd>{s.creado_por_nombre || "—"}</dd>
              {s.modificado_en && <><dt>Modificó</dt><dd>{s.modificado_por_nombre} · {fecha(s.modificado_en)}</dd></>}
            </dl>
            <section className="seccion">
              <h2>Productos y lotes</h2>
              <ul className="lista">
                {s.lineas.map((l) => (
                  <li key={l.id}>
                    <button className="item" disabled={l.origen === "manual"} onClick={() => l.lote_id && (window.location.hash = rutaLote(l.origen, l.lote_id))}>
                      <span className="principal">
                        <strong>{l.producto}</strong>
                        <span className="suave pequeno">Lote {l.num_lote || "sin nº"}{l.origen === "manual" ? " · anotado a mano" : ""}</span>
                      </span>
                      <span className="numero" style={{ textAlign: "right" }}>{num(l.cantidad)} {l.unidad}{l.precio != null && <div className="pequeno suave">{num(l.precio)} €/ud</div>}</span>
                      {l.origen !== "manual" && <ChevronRight size={18} aria-hidden className="suave" />}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <div className="fila" style={{ flexWrap: "wrap" }}>
              <button className="boton" onClick={() => api.descargar(`/informes/salidas?formato=pdf&salida_id=${id}`, `salida_${s.num_pedido}.pdf`, true).catch((e) => setError(e.message))}>
                <FileText size={20} aria-hidden /> PDF del pedido
              </button>
              <button className="boton" onClick={() => api.descargar(`/informes/salidas?formato=holded&salida_id=${id}`, `pedido-holded_${s.num_pedido}.xlsx`).catch((e) => setError(e.message))}>
                <Upload size={20} aria-hidden /> Excel para Holded
              </button>
            </div>
            {puede("borrar") && <button className="boton peligro bloque" onClick={() => setBorrando(true)}><Trash2 size={20} aria-hidden /> Eliminar salida</button>}
          </>
        )}
      </main>
      {borrando && (
        <Hoja titulo="¿Eliminar esta salida?" onCerrar={() => setBorrando(false)}>
          <p>Se borrará el pedido {s.num_pedido} de {s.cliente} con todas sus líneas. No se puede deshacer.</p>
          <button className="boton peligro grande bloque" onClick={borrar}><Trash2 size={20} aria-hidden /> Eliminar</button>
          <button className="boton bloque" onClick={() => setBorrando(false)}>Cancelar</button>
        </Hoja>
      )}
    </>
  );
}
