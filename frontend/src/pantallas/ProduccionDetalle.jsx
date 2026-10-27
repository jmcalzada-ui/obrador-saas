import React, { useEffect, useState } from "react";
import { Pencil, Trash2, PackageX, PackageCheck, Snowflake, ChevronRight } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Cargando, Hoja, useSesion, useToast, num, fecha, aNumero } from "../componentes/ui.jsx";
import ControlTermico, { aISO, horaAhora, evaluar } from "../componentes/ControlTermico.jsx";
import EstadoTermico from "../componentes/EstadoTermico.jsx";
import Cabecera from "../componentes/Cabecera.jsx";
import { ELABORACION, rutaLote } from "../componentes/elaboracion.js";
import { CONTROL_STOCK } from "../componentes/fase.js";

const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "");
const horaInput = (iso) => (iso ? new Date(iso).toTimeString().slice(0, 5) : "");
const txt = (v) => (v == null ? "" : String(v).replace(".", ","));

export default function ProduccionDetalle({ id, tipo = "final" }) {
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
      <Cabecera titulo={cfg.titulo} volver="/produccion"
        accion={p && puede("editar") && <button className="boton-icono" aria-label="Editar" onClick={() => (window.location.hash = `${cfg.rutaFicha}/${id}/editar`)}><Pencil size={22} /></button>} />
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
                <strong>{num(cfg.conStock && CONTROL_STOCK ? p.disponible : p.cantidad)}</strong> <span className="suave">{p.unidad}</span>
                <div className="pequeno suave">{cfg.conStock && CONTROL_STOCK ? `de ${num(p.cantidad)}` : p.unidades != null ? `${num(p.unidades)} uds.` : "elaborado"}</div>
              </div>
              <div className="meta"><span className={`distintivo ${cfg.interna ? "azul" : ""}`}>{cfg.interna ? "Producción interna" : "Producción final"}</span><EstadoTermico control={t} />{!p.activo && <span className="distintivo">De baja</span>}</div>
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
                          Lote {i.num_lote || "sin nº"}{i.marca ? ` · ${i.marca}` : ""}{i.origen === "manual" ? " · anotado a mano" : i.origen === "preparado" ? " · producción interna" : ""}
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

            <ListaIngredientes declaracion={datos.declaracion} puedeEditar={puede("editar")}
              guardar={async (texto) => { await api.patch(`${cfg.api}/${id}`, { declaracion_ingredientes: texto }); toast(texto == null ? "Lista automática" : "Lista de ingredientes guardada"); cargar(); }} />

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
      {hoja === "borrar" && (
        <Hoja titulo="¿Eliminar este lote?" onCerrar={() => setHoja(null)}>
          <p>Se borrará el lote {p.num_lote} con sus ingredientes y controles. No se puede deshacer.</p>
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

/**
 * Lista de ingredientes del lote, lista para la etiqueta: se rellena sola con
 * los ingredientes usados (en orden de peso, con el % de los principales y
 * la composición de cada uno) y se puede retocar a mano.
 */
function ListaIngredientes({ declaracion, puedeEditar, guardar }) {
  const ajustada = declaracion?.ajustada;
  const valorInicial = ajustada ?? declaracion?.auto ?? "";
  const [texto, setTexto] = useState(valorInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  useEffect(() => { setTexto(valorInicial); }, [valorInicial]);
  const cambiado = texto.trim() !== valorInicial.trim();

  async function enviar(valor) {
    setGuardando(true);
    setError("");
    try { await guardar(valor); } catch (e) { setError(e.message); } finally { setGuardando(false); }
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(texto); toast("Copiado"); } catch { setError("No se ha podido copiar."); }
  }

  return (
    <section className="panel pila">
      <div className="fila entre" style={{ flexWrap: "wrap" }}>
        <h2>Lista de ingredientes</h2>
        <span className={`distintivo ${ajustada ? "ambar" : "verde"}`}>{ajustada ? "Ajustada a mano" : "Automática"}</span>
      </div>
      <p className="suave pequeno">
        Se rellena sola con los ingredientes usados en el lote, de más a menos peso, con el % de los que pesan un 10 % o más y la composición
        que figura en la ficha de cada producto (marca). Al final, los alérgenos y las trazas.
      </p>
      {puedeEditar ? (
        <textarea className="entrada declaracion" aria-label="Lista de ingredientes" value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} />
      ) : (
        <p className="declaracion-texto">{texto || "Sin ingredientes."}</p>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="fila" style={{ flexWrap: "wrap" }}>
        {puedeEditar && <button className="boton principal" disabled={!cambiado || guardando} onClick={() => enviar(texto.trim() || null)}>Guardar lista</button>}
        {puedeEditar && ajustada && <button className="boton" disabled={guardando} onClick={() => enviar(null)}>Volver a la automática</button>}
        <button className="boton" onClick={copiar} disabled={!texto}>Copiar</button>
      </div>
    </section>
  );
}
