import React, { useEffect, useState } from "react";
import { Pencil, Trash2, PackageX, PackageCheck } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Campo, Cargando, Hoja, Opciones, useSesion, useToast, num, fecha, euros, aNumero } from "../componentes/ui.jsx";
import Cabecera from "../componentes/Cabecera.jsx";
import EtiquetaLote from "../componentes/EtiquetaLote.jsx";

const control = (v) => (v === true ? "Correcto" : v === false ? <span style={{ color: "var(--rojo)" }}>Incorrecto</span> : "—");
const ESTADOS = { conforme: "Conforme", conforme_con_incidencia: "Conforme con incidencia", no_conforme: "No conforme" };

export default function RecepcionDetalle({ id }) {
  const { puede } = useSesion();
  const toast = useToast();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState(false);
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
          <button className="boton-icono" aria-label="Editar" onClick={() => setEditando(true)}><Pencil size={22} /></button>
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
              <dt>Marca</dt><dd>{r.marca || "—"}</dd>
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

      {editando && (
        <EditarRecepcion
          r={r}
          onCerrar={() => setEditando(false)}
          onGuardado={(recepcion) => { setDatos((d) => ({ ...d, recepcion })); setEditando(false); toast("Cambios guardados"); }}
        />
      )}
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

function EditarRecepcion({ r, onCerrar, onGuardado }) {
  const [f, setF] = useState({
    num_lote: r.num_lote, cantidad: String(r.cantidad).replace(".", ","), unidad: r.unidad,
    caducidad: r.caducidad || "", fecha: r.fecha, factura: r.factura,
    temp_entrada: r.temp_entrada !== null ? String(r.temp_entrada).replace(".", ",") : "",
    estado_entrada: r.estado_entrada, observaciones: r.observaciones,
  });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const cambiar = (p) => setF((x) => ({ ...x, ...p }));

  async function guardar() {
    const cantidad = aNumero(f.cantidad);
    const temp = aNumero(f.temp_entrada);
    if (!(cantidad > 0)) return setError("Indica una cantidad mayor que 0.");
    if (Number.isNaN(temp)) return setError("La temperatura no es un número.");
    setGuardando(true);
    try {
      const { recepcion } = await api.patch(`/recepciones/${r.id}`, {
        num_lote: f.num_lote.trim(), cantidad, caducidad: f.caducidad || null, fecha: f.fecha,
        factura: f.factura.trim(), temp_entrada: temp, estado_entrada: f.estado_entrada, observaciones: f.observaciones.trim(),
      });
      onGuardado(recepcion);
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  }

  return (
    <Hoja titulo="Editar entrada" onCerrar={onCerrar}>
      <Campo etiqueta="Nº de lote" id="e-lote">
        <input id="e-lote" className="entrada grande" value={f.num_lote} onChange={(e) => cambiar({ num_lote: e.target.value })} />
      </Campo>
      <Campo etiqueta={`Cantidad recibida (${r.unidad})`} id="e-cant">
        <input id="e-cant" className="entrada grande" inputMode="decimal" value={f.cantidad} onChange={(e) => cambiar({ cantidad: e.target.value })} />
      </Campo>
      <div className="dos-columnas">
        <Campo etiqueta="Caducidad" id="e-cad">
          <input id="e-cad" className="entrada" type="date" value={f.caducidad} onChange={(e) => cambiar({ caducidad: e.target.value })} />
        </Campo>
        <Campo etiqueta="Entrada" id="e-fe">
          <input id="e-fe" className="entrada" type="date" value={f.fecha} onChange={(e) => cambiar({ fecha: e.target.value })} />
        </Campo>
      </div>
      <Campo etiqueta="Factura o albarán" id="e-fac">
        <input id="e-fac" className="entrada" value={f.factura} onChange={(e) => cambiar({ factura: e.target.value })} />
      </Campo>
      <Opciones etiqueta="Estado" anchas valor={f.estado_entrada} onCambio={(v) => cambiar({ estado_entrada: v })}
        opciones={Object.entries(ESTADOS).map(([valor, texto]) => ({ valor, texto, tono: valor === "conforme" ? "verde" : valor === "no_conforme" ? "rojo" : "" }))} />
      <Campo etiqueta="Temperatura (°C)" id="e-temp">
        <input id="e-temp" className="entrada" inputMode="decimal" value={f.temp_entrada} onChange={(e) => cambiar({ temp_entrada: e.target.value })} />
      </Campo>
      <Campo etiqueta="Observaciones" id="e-obs">
        <textarea id="e-obs" className="entrada" value={f.observaciones} onChange={(e) => cambiar({ observaciones: e.target.value })} />
      </Campo>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <button className="boton principal grande bloque" onClick={guardar} disabled={guardando}>
        {guardando ? "Guardando…" : "Guardar cambios"}
      </button>
    </Hoja>
  );
}
