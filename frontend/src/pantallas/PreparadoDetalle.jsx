import React, { useEffect, useState } from "react";
import { Pencil, Trash2, PackageX, PackageCheck, Snowflake, ChevronRight } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Campo, Cargando, Hoja, useSesion, useToast, num, fecha, aNumero } from "../componentes/ui.jsx";
import ControlTermico, { aISO, horaAhora, evaluar } from "../componentes/ControlTermico.jsx";
import EstadoTermico from "../componentes/EstadoTermico.jsx";
import Cabecera from "../componentes/Cabecera.jsx";
import { ELABORACION, rutaLote } from "../componentes/elaboracion.js";

const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "");
const horaInput = (iso) => (iso ? new Date(iso).toTimeString().slice(0, 5) : "");
const txt = (v) => (v == null ? "" : String(v).replace(".", ","));

export default function PreparadoDetalle({ id, tipo = "intermedia" }) {
  const cfg = ELABORACION[tipo];
  const { puede } = useSesion();
  const toast = useToast();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [hoja, setHoja] = useState(null); // abatimiento | editar | borrar

  const cargar = () => api.get(`${cfg.api}/${id}`).then(setDatos).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, [id]);

  const p = datos?.[cfg.uno];
  const t = p?.control_termico;

  async function cambiarActivo() {
    try {
      await api.patch(`${cfg.api}/${id}`, { activo: !p.activo });
      toast(p.activo ? "Lote dado de baja" : "Lote dado de alta");
      cargar();
    } catch (e) { setError(e.message); }
  }
  async function borrar() {
    try { await api.delete(`${cfg.api}/${id}`); toast("Lote eliminado"); window.location.hash = cfg.ruta; }
    catch (e) { setHoja(null); setError(e.status === 409 ? "Este lote ya se ha usado como ingrediente: no se puede eliminar. Puedes darlo de baja." : e.message); }
  }

  return (
    <>
      <Cabecera titulo={cfg.detalleTitulo} volver={cfg.ruta}
        accion={p && puede("editar") && <button className="boton-icono" aria-label="Editar" onClick={() => setHoja("editar")}><Pencil size={22} /></button>} />
      <main className="contenido">
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!datos && !error && <Cargando />}
        {p && (
          <>
            <div className="etiqueta" style={{ cursor: "default" }}>
              <div style={{ minWidth: 0 }}>
                <div className="producto">{p.producto}</div>
                <div className="lote">{p.num_lote}</div>
              </div>
              <div className="cantidad">
                <strong>{num(cfg.conStock ? p.disponible : p.cantidad)}</strong> <span className="suave">{p.unidad}</span>
                <div className="pequeno suave">{cfg.conStock ? `de ${num(p.cantidad)}` : p.unidades != null ? `${num(p.unidades)} uds.` : "elaborado"}</div>
              </div>
              <div className="meta"><EstadoTermico control={t} />{!p.activo && <span className="distintivo">De baja</span>}</div>
            </div>

            <dl className="ficha panel">
              <dt>Fecha</dt><dd>{fecha(p.fecha)}</dd>
              <dt>Caducidad</dt><dd>{fecha(p.caducidad)}</dd>
              <dt>Responsable</dt><dd>{p.responsable || "—"}</dd>
              {p.observaciones && <><dt>Notas</dt><dd style={{ fontWeight: 400 }}>{p.observaciones}</dd></>}
              <dt>Registró</dt><dd>{p.creado_por_nombre || "—"}</dd>
              {p.modificado_en && <><dt>Modificó</dt><dd>{p.modificado_por_nombre} · {fecha(p.modificado_en)}</dd></>}
            </dl>

            {p.proceso_termico && (
              <section className="panel pila">
                <h2>Control térmico</h2>
                <dl className="ficha">
                  <dt>Cocción</dt>
                  <dd>
                    {p.coccion_temp != null ? `${num(p.coccion_temp)} °C · ${p.coccion_minutos ?? "—"} min` : "—"}
                    <div className="suave pequeno" style={{ fontWeight: 400 }}>Objetivo ≥ {p.coccion_temp_min} °C {t.coccion_ok === false && "· fuera de objetivo"}</div>
                  </dd>
                  <dt>Abatimiento</dt>
                  <dd>
                    {p.abat_hora_fin
                      ? `${num(p.abat_temp_inicio)} °C (${hora(p.abat_hora_inicio)}) → ${num(p.abat_temp_fin)} °C (${hora(p.abat_hora_fin)}) · ${t.abat_minutos} min`
                      : p.abat_hora_inicio ? `Iniciado a las ${hora(p.abat_hora_inicio)}${p.abat_temp_inicio != null ? ` con ${num(p.abat_temp_inicio)} °C` : ""}` : "Pendiente"}
                    <div className="suave pequeno" style={{ fontWeight: 400 }}>Objetivo ≤ {p.abatimiento_temp_max} °C en {p.abatimiento_minutos_max} min {t.abat_ok === false && "· fuera de objetivo"}</div>
                  </dd>
                  {p.medida_correctora && <><dt>Medida correctora</dt><dd style={{ fontWeight: 400 }}>{p.medida_correctora}</dd></>}
                </dl>
                {!p.abat_hora_fin && puede("registrar") && (
                  <button className="boton principal bloque" onClick={() => setHoja("abatimiento")}><Snowflake size={20} aria-hidden /> Completar abatimiento</button>
                )}
              </section>
            )}

            <section className="seccion">
              <h2>Ingredientes y lotes usados</h2>
              <ul className="lista">
                {datos.ingredientes.map((i) => (
                  <li key={i.id}>
                    <button className="item" disabled={i.origen === "manual"}
                      onClick={() => i.lote_id && (window.location.hash = rutaLote(i.origen, i.lote_id))}>
                      <span className="principal">
                        <strong>{i.producto}</strong>
                        <span className="suave pequeno">
                          Lote {i.num_lote || "sin nº"}{i.marca ? ` · ${i.marca}` : ""}{i.origen === "manual" ? " · anotado a mano" : i.origen === "preparado" ? " · producción intermedia" : ""}
                        </span>
                      </span>
                      <span className="numero">{num(i.cantidad)} {i.unidad}</span>
                      {i.origen !== "manual" && <ChevronRight size={18} aria-hidden className="suave" />}
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {cfg.conStock && <section className="seccion">
              <h2>Dónde se ha usado</h2>
              {datos.usos.length === 0 ? <p className="suave">Este lote todavía no se ha usado.</p> : (
                <ul className="lista">
                  {datos.usos.map((u, k) => (
                    <li key={k}>
                      <button className="item" onClick={() => (window.location.hash = rutaLote(u.destino_tipo, u.destino_id))}>
                        <span className="principal"><strong>{u.producto_destino} · lote {u.lote_destino}</strong><span className="suave pequeno">{fecha(u.fecha)}</span></span>
                        <span className="numero">{num(u.cantidad)} {u.unidad}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>}

            {(puede("editar") || puede("borrar")) && (
              <div className="pila">
                {puede("editar") && (
                  <button className="boton bloque" onClick={cambiarActivo}>
                    {p.activo ? <><PackageX size={20} aria-hidden /> Dar de baja el lote</> : <><PackageCheck size={20} aria-hidden /> Volver a dar de alta</>}
                  </button>
                )}
                {puede("borrar") && <button className="boton peligro bloque" onClick={() => setHoja("borrar")}><Trash2 size={20} aria-hidden /> Eliminar lote</button>}
              </div>
            )}
          </>
        )}
      </main>

      {hoja === "abatimiento" && <CompletarAbatimiento cfg={cfg} p={p} onCerrar={() => setHoja(null)} onHecho={() => { setHoja(null); toast("Abatimiento registrado"); cargar(); }} />}
      {hoja === "editar" && <EditarPreparado cfg={cfg} p={p} onCerrar={() => setHoja(null)} onHecho={() => { setHoja(null); toast("Cambios guardados"); cargar(); }} />}
      {hoja === "borrar" && (
        <Hoja titulo="¿Eliminar este lote?" onCerrar={() => setHoja(null)}>
          <p>Se borrará el lote {p.num_lote} y se devolverá al stock lo que consumió.</p>
          <button className="boton peligro grande bloque" onClick={borrar}><Trash2 size={20} aria-hidden /> Eliminar</button>
          <button className="boton bloque" onClick={() => setHoja(null)}>Cancelar</button>
        </Hoja>
      )}
    </>
  );
}

function CompletarAbatimiento({ cfg, p, onCerrar, onHecho }) {
  const fechaBase = (p.abat_hora_inicio || `${p.fecha}T12:00:00`).slice(0, 10);
  const [v, setV] = useState({
    coccion_temp: txt(p.coccion_temp), abat_temp_inicio: txt(p.abat_temp_inicio),
    abat_hora_inicio: horaInput(p.abat_hora_inicio) || "", abat_temp_fin: "", abat_hora_fin: horaAhora(), medida_correctora: "",
  });
  const [error, setError] = useState("");
  async function guardar() {
    const fin = aNumero(v.abat_temp_fin);
    if (fin == null || Number.isNaN(fin)) return setError("Anota la temperatura de salida.");
    if (!v.abat_hora_inicio) return setError("Falta la hora de entrada al abatidor.");
    if (evaluar(p, v, fechaBase).fuera && !v.medida_correctora.trim()) return setError("Fuera del objetivo: anota la medida correctora.");
    const ini = aISO(fechaBase, v.abat_hora_inicio);
    let finIso = aISO(fechaBase, v.abat_hora_fin);
    if (new Date(finIso) < new Date(ini)) finIso = new Date(new Date(finIso).getTime() + 86400000).toISOString();
    try {
      await api.post(`${cfg.api}/${p.id}/abatimiento`, {
        abat_temp_fin: fin, abat_hora_fin: finIso, abat_temp_inicio: aNumero(v.abat_temp_inicio), abat_hora_inicio: ini,
        medida_correctora: v.medida_correctora.trim() || undefined,
      });
      onHecho();
    } catch (e) { setError(e.message); }
  }
  return (
    <Hoja titulo="Completar abatimiento" onCerrar={onCerrar}>
      <ControlTermico obj={p} v={v} fecha={fechaBase} soloAbatimiento cambiar={(x) => setV((y) => ({ ...y, ...x }))} />
      {error && <Aviso tipo="error">{error}</Aviso>}
      <button className="boton principal grande bloque" onClick={guardar}>Guardar abatimiento</button>
    </Hoja>
  );
}

function EditarPreparado({ cfg, p, onCerrar, onHecho }) {
  const fechaBase = p.fecha;
  const [f, setF] = useState({ num_lote: p.num_lote, cantidad: txt(p.cantidad), caducidad: p.caducidad || "", responsable: p.responsable || "", observaciones: p.observaciones || "", unidades: p.unidades != null ? String(p.unidades) : "" });
  const [v, setV] = useState({
    coccion_temp: txt(p.coccion_temp), coccion_minutos: txt(p.coccion_minutos), abat_temp_inicio: txt(p.abat_temp_inicio),
    abat_hora_inicio: horaInput(p.abat_hora_inicio), abat_temp_fin: txt(p.abat_temp_fin), abat_hora_fin: horaInput(p.abat_hora_fin),
    medida_correctora: p.medida_correctora || "",
  });
  const [error, setError] = useState("");
  async function guardar() {
    const cuerpo = { num_lote: f.num_lote.trim(), cantidad: aNumero(f.cantidad), caducidad: f.caducidad || null, responsable: f.responsable.trim(), observaciones: f.observaciones.trim() };
    if (!(cuerpo.cantidad > 0)) return setError("Indica una cantidad mayor que 0.");
    if (cfg.conUnidades) {
      cuerpo.unidades = f.unidades.trim() ? aNumero(f.unidades) : null;
      if (cuerpo.unidades != null && !Number.isInteger(cuerpo.unidades)) return setError("Las unidades deben ser un número entero.");
    }
    if (p.proceso_termico) {
      const fb = (p.abat_hora_inicio || `${fechaBase}T12:00:00`).slice(0, 10);
      const ini = aISO(fb, v.abat_hora_inicio);
      let fin = v.abat_hora_fin ? aISO(fb, v.abat_hora_fin) : null;
      if (ini && fin && new Date(fin) < new Date(ini)) fin = new Date(new Date(fin).getTime() + 86400000).toISOString();
      Object.assign(cuerpo, {
        coccion_temp: aNumero(v.coccion_temp), coccion_minutos: aNumero(v.coccion_minutos), abat_temp_inicio: aNumero(v.abat_temp_inicio),
        abat_hora_inicio: ini, abat_temp_fin: aNumero(v.abat_temp_fin), abat_hora_fin: fin, medida_correctora: v.medida_correctora.trim(),
      });
      if (Object.values(cuerpo).some((x) => Number.isNaN(x))) return setError("Revisa los valores numéricos.");
    }
    try { await api.patch(`${cfg.api}/${p.id}`, cuerpo); onHecho(); } catch (e) { setError(e.message); }
  }
  return (
    <Hoja titulo="Editar lote" onCerrar={onCerrar}>
      <Campo etiqueta="Nº de lote" id="ep-lote"><input id="ep-lote" className="entrada grande" value={f.num_lote} onChange={(e) => setF({ ...f, num_lote: e.target.value })} /></Campo>
      <Campo etiqueta={`Cantidad obtenida (${p.unidad})`} id="ep-cant"><input id="ep-cant" className="entrada" inputMode="decimal" value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} /></Campo>
      {cfg.conUnidades && <Campo etiqueta="Unidades o raciones" id="ep-uds"><input id="ep-uds" className="entrada" inputMode="numeric" value={f.unidades} onChange={(e) => setF({ ...f, unidades: e.target.value })} /></Campo>}
      <Campo etiqueta="Caducidad" id="ep-cad"><input id="ep-cad" className="entrada" type="date" value={f.caducidad} onChange={(e) => setF({ ...f, caducidad: e.target.value })} /></Campo>
      <Campo etiqueta="Responsable" id="ep-resp"><input id="ep-resp" className="entrada" value={f.responsable} onChange={(e) => setF({ ...f, responsable: e.target.value })} /></Campo>
      {p.proceso_termico && <ControlTermico obj={p} v={v} fecha={fechaBase} cambiar={(x) => setV((y) => ({ ...y, ...x }))} />}
      <Campo etiqueta="Observaciones" id="ep-obs"><textarea id="ep-obs" className="entrada" value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} /></Campo>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <button className="boton principal grande bloque" onClick={guardar}>Guardar cambios</button>
    </Hoja>
  );
}
