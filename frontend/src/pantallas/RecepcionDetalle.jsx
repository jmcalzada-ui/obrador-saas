import React, { useEffect, useState } from "react";
import { Pencil, Trash2, PackageX, PackageCheck } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Cargando, Hoja, useSesion, useToast, num, fecha, euros } from "../componentes/ui.jsx";
import Cabecera from "../componentes/Cabecera.jsx";
import EtiquetaLote from "../componentes/EtiquetaLote.jsx";

const control = (v) => (v === true ? "Correcto" : v === false ? <span style={{ color: "var(--rojo)" }}>Incorrecto</span> : "—");
const ESTADOS = { conforme: "Conforme", conforme_con_incidencia: "Conforme con incidencia", no_conforme: "No conforme" };

export default function RecepcionDetalle({ id }) {
  const { puede } = useSesion();
  const toast = useToast();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [borrando, setBorrando] = useState(false);

  const cargar = () =>
    api.get(`/recepciones/${id}`).then(setDatos).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, [id]);

  async function cambiarActivo() {
    try {
      const { recepcion } = await api.patch(`/recepciones/${id}`, { activo: !datos.recepcion.activo });
      setDatos((d) => ({ ...d, recepcion }));
      toast(recepcion.activo ? "Lote dado de alta" : "Lote dado de baja");
    } catch (e) { setError(e.message); }
  }

  async function borrar() {
    try {
      await api.delete(`/recepciones/${id}`);
      toast("Entrada eliminada");
      window.location.hash = "/entradas";
    } catch (e) {
      setBorrando(false);
      setError(e.message);
    }
  }

  const r = datos?.recepcion;
  return (
    <>
      <Cabecera
        titulo="Entrada de mercancía"
        volver="/entradas"
        accion={r && puede("editar") && (
          <button className="boton-icono" aria-label="Editar" onClick={() => (window.location.hash = `/entradas/${id}/editar`)}><Pencil size={22} /></button>
        )}
      />
      <main className="contenido">
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!datos && !error && <Cargando />}
        {r && (
          <>
            <EtiquetaLote r={r} onClick={() => {}} />
            <dl className="ficha panel">
              <dt>Entrada</dt><dd>{fecha(r.fecha)}</dd>
              <dt>Caducidad</dt><dd>{fecha(r.caducidad)}</dd>
              <dt>Marca (fabricante)</dt><dd>{r.marca || "—"}</dd>
              <dt>Proveedor</dt><dd>{r.proveedor || "—"}</dd>
              <dt>Factura</dt><dd>{r.factura || "—"}</dd>
              <dt>Bultos</dt><dd>{r.bultos ?? "—"}</dd>
              <dt>Envase</dt><dd>{control(r.control_envase)}</dd>
              <dt>Etiquetado</dt><dd>{control(r.control_etiquetado)}</dd>
              <dt>Transporte</dt><dd>{control(r.control_transporte)}</dd>
              <dt>Estado</dt><dd>{ESTADOS[r.estado_entrada]}</dd>
              <dt>Temperatura</dt><dd>{r.temp_entrada !== null ? `${num(r.temp_entrada)} °C` : "—"}</dd>
              <dt>Importe</dt><dd>{euros(r.precio_total)}</dd>
              <dt>Precio / {r.unidad}</dt><dd>{r.precio_unidad !== null ? euros(r.precio_unidad) : "—"}</dd>
              {r.observaciones && (<><dt>Notas</dt><dd style={{ fontWeight: 400 }}>{r.observaciones}</dd></>)}
              <dt>Registró</dt><dd>{r.creado_por_nombre || "—"}</dd>
              {r.modificado_en && (<><dt>Modificó</dt><dd>{r.modificado_por_nombre} · {fecha(r.modificado_en)}</dd></>)}
            </dl>

            <section className="seccion">
              <h2>Dónde se ha usado</h2>
              {datos.usos.length === 0 ? (
                <p className="suave">Este lote todavía no se ha usado en ninguna elaboración.</p>
              ) : (
                <ul className="lista">
                  {datos.usos.map((u, i) => (
                    <li key={i}>
                      <div className="item" role="link"
                        onClick={() => (window.location.hash = u.destino_tipo === "preparado" ? `/produccion/i/${u.destino_id}` : `/produccion/f/${u.destino_id}`)}>
                        <span className="principal">
                          <strong>Lote {u.lote_destino}</strong>
                          <span className="suave pequeno">{u.destino_tipo === "preparado" ? "Producción interna" : "Producción final"} · {fecha(u.fecha)}</span>
                        </span>
                        <span className="numero">{num(u.cantidad)} {u.unidad}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {(puede("editar") || puede("borrar")) && (
              <div className="pila">
                {puede("editar") && (
                  <button className="boton bloque" onClick={cambiarActivo}>
                    {r.activo ? <><PackageX size={20} aria-hidden /> Dar de baja el lote</> : <><PackageCheck size={20} aria-hidden /> Volver a dar de alta</>}
                  </button>
                )}
                {puede("borrar") && (
                  <button className="boton peligro bloque" onClick={() => setBorrando(true)}>
                    <Trash2 size={20} aria-hidden /> Eliminar entrada
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {borrando && (
        <Hoja titulo="¿Eliminar esta entrada?" onCerrar={() => setBorrando(false)}>
          <p>Se borrará el registro del lote {r.num_lote || "sin número"}. Si el lote ya se ha usado en alguna elaboración no se podrá eliminar; en ese caso, dalo de baja.</p>
          <button className="boton peligro grande bloque" onClick={borrar}><Trash2 size={20} aria-hidden /> Eliminar</button>
          <button className="boton bloque" onClick={() => setBorrando(false)}>Cancelar</button>
        </Hoja>
      )}
    </>
  );
}
