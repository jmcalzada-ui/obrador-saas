import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Plus, Trash2, Flame, Snowflake } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Campo, Cargando, Opciones, useSesion, useToast, hoyISO, aNumero, num, fecha } from "../componentes/ui.jsx";
import Autocompletar from "../componentes/Autocompletar.jsx";
import ControlTermico, { aISO, horaAhora, evaluar } from "../componentes/ControlTermico.jsx";
import Cabecera from "../componentes/Cabecera.jsx";

const OBJETIVOS = { coccion_temp_min: 75, abatimiento_temp_max: 10, abatimiento_minutos_max: 120 };
let siguienteId = 1;
const filaVacia = (producto = null) => ({ k: siguienteId++, producto, lote: null, manual: false, num_lote: "", cantidad: "", texto: producto?.nombre || "" });

/** Hora de fin del abatimiento: si es anterior a la de inicio, es del día siguiente. */
function finISO(fecha, ini, fin) {
  const i = aISO(fecha, ini);
  const f = aISO(fecha, fin);
  if (!i || !f) return f;
  return new Date(f) < new Date(i) ? new Date(new Date(f).getTime() + 86400000).toISOString() : f;
}

export default function NuevoPreparado() {
  const { usuario } = useSesion();
  const toast = useToast();
  const [paso, setPaso] = useState("preparado");
  const [catalogo, setCatalogo] = useState(null); // todos los productos (ingredientes y preparados)
  const [lotes, setLotes] = useState([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [elegido, setElegido] = useState(null); // preparado guardado
  const [nuevo, setNuevo] = useState(null); // { nombre, unidad_medida, proceso_termico, vida_util_dias, conservacion }
  const [filas, setFilas] = useState([filaVacia()]);
  const [lote, setLote] = useState({ num_lote: "", cantidad: "", fecha: hoyISO(), caducidad: "", responsable: usuario.nombre, observaciones: "" });
  const [termico, setTermico] = useState({ coccion_temp: "", coccion_minutos: "", abat_temp_inicio: "", abat_hora_inicio: horaAhora(), abat_temp_fin: "", abat_hora_fin: "", medida_correctora: "" });

  useEffect(() => {
    Promise.all([api.get("/catalogo/productos"), api.get("/stock/lotes")])
      .then(([c, l]) => { setCatalogo(c.productos.filter((p) => p.activo)); setLotes(l.lotes); })
      .catch((e) => setError(e.message));
  }, []);

  const datos = elegido || nuevo; // lo que define el preparado
  const conTermico = Boolean(datos?.proceso_termico);
  const obj = elegido?.proceso_termico ? elegido : OBJETIVOS;
  const unidad = datos?.unidad_medida;
  const pasos = ["preparado", "ingredientes", "lote", ...(conTermico ? ["termico"] : []), "revisar"];
  const indice = pasos.indexOf(paso === "nuevo" ? "preparado" : paso);

  function elegirGuardado(p) {
    setElegido(p);
    setNuevo(null);
    // Se proponen los ingredientes de la última vez.
    const habituales = (p.ingredientes_habituales || []).map((h) => catalogo.find((c) => c.id === h.producto_id)).filter(Boolean);
    setFilas(habituales.length ? habituales.map((prod) => conLotePorDefecto(filaVacia(prod))) : [filaVacia()]);
    irA("ingredientes");
  }
  function conLotePorDefecto(fila) {
    const primero = lotes.find((l) => l.producto_id === fila.producto?.id);
    return { ...fila, lote: primero || null, manual: !primero };
  }

  // Al pasar al paso de lote se propone nº de lote y caducidad.
  useEffect(() => {
    if (paso !== "lote" || lote.num_lote) return;
    const p = new URLSearchParams({ fecha: lote.fecha, ...(elegido ? { producto_id: elegido.id } : { nombre: nuevo?.nombre || "" }) });
    api.get(`/preparados/siguiente-lote?${p}`).then(({ num_lote }) => setLote((x) => ({ ...x, num_lote: x.num_lote || num_lote }))).catch(() => {});
    const vida = aNumero(datos?.vida_util_dias);
    if (vida > 0 && !lote.caducidad) {
      const d = new Date(`${lote.fecha}T12:00:00`);
      d.setDate(d.getDate() + vida);
      setLote((x) => ({ ...x, caducidad: d.toISOString().slice(0, 10) }));
    }
  }, [paso]);

  function irA(p) { setError(""); setPaso(p); window.scrollTo(0, 0); }

  function validar() {
    if (paso === "nuevo") {
      if (!nuevo.nombre.trim()) return "Escribe el nombre del preparado.";
      if (nuevo.proceso_termico === null) return "Indica si el preparado lleva proceso térmico.";
    }
    if (paso === "ingredientes") {
      const validas = filas.filter((f) => f.producto);
      if (!validas.length) return "Añade al menos un ingrediente.";
      for (const f of validas) {
        const c = aNumero(f.cantidad);
        if (!(c > 0)) return `Indica la cantidad usada de ${f.producto.nombre}.`;
        if (!f.manual && !f.lote) return `Elige el lote de ${f.producto.nombre}.`;
        if (!f.manual && c > f.lote.disponible + 1e-9) return `Del lote ${f.lote.num_lote || "sin nº"} de ${f.producto.nombre} solo quedan ${num(f.lote.disponible)} ${f.lote.unidad}.`;
      }
    }
    if (paso === "lote") {
      if (!lote.num_lote.trim()) return "Indica el nº de lote.";
      if (!(aNumero(lote.cantidad) > 0)) return "Indica la cantidad obtenida.";
    }
    if (paso === "termico") {
      if (aNumero(termico.coccion_temp) == null) return "Anota la temperatura de cocción.";
      for (const k of ["coccion_temp", "coccion_minutos", "abat_temp_inicio", "abat_temp_fin"]) if (Number.isNaN(aNumero(termico[k]))) return "Revisa los valores: alguno no es un número.";
      if (termico.abat_temp_fin && !termico.abat_hora_fin) return "Indica la hora de salida del abatimiento, o deja vacía la temperatura de salida.";
      if (evaluar(obj, termico, lote.fecha).fuera && !termico.medida_correctora.trim()) return "Un control está fuera del objetivo: anota la medida correctora.";
    }
    return "";
  }
  function siguiente() {
    const e = validar();
    if (e) return setError(e);
    const actual = paso === "nuevo" ? "preparado" : paso;
    irA(pasos[pasos.indexOf(actual) + 1]);
  }
  function atras() {
    if (paso === "nuevo") return irA("preparado");
    irA(pasos[indice - 1]);
  }

  async function guardar() {
    setGuardando(true);
    setError("");
    const t = conTermico ? {
      coccion_temp: aNumero(termico.coccion_temp), coccion_minutos: aNumero(termico.coccion_minutos),
      abat_temp_inicio: aNumero(termico.abat_temp_inicio), abat_hora_inicio: termico.abat_temp_inicio || termico.abat_hora_fin ? aISO(lote.fecha, termico.abat_hora_inicio) : null,
      abat_temp_fin: aNumero(termico.abat_temp_fin), abat_hora_fin: termico.abat_hora_fin ? finISO(lote.fecha, termico.abat_hora_inicio, termico.abat_hora_fin) : null,
      medida_correctora: termico.medida_correctora.trim(),
    } : {};
    try {
      const { preparado } = await api.post("/preparados", {
        ...(elegido ? { producto_id: elegido.id } : { nuevo: { ...nuevo, nombre: nuevo.nombre.trim(), vida_util_dias: aNumero(nuevo.vida_util_dias) } }),
        fecha: lote.fecha, num_lote: lote.num_lote.trim(), cantidad: aNumero(lote.cantidad), caducidad: lote.caducidad || null,
        responsable: lote.responsable.trim(), observaciones: lote.observaciones.trim(),
        ingredientes: filas.filter((f) => f.producto).map((f) => f.manual
          ? { origen: "manual", producto_id: f.producto.id, num_lote: f.num_lote.trim(), cantidad: aNumero(f.cantidad) }
          : { origen: f.lote.origen, lote_id: f.lote.id, cantidad: aNumero(f.cantidad) }),
        ...t,
      });
      toast("Preparado registrado");
      window.location.hash = `/preparados/${preparado.id}`;
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  }

  if (!catalogo) {
    return (
      <>
        <Cabecera titulo="Nuevo preparado" volver="/preparados" />
        <main className="contenido">{error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />}</main>
      </>
    );
  }

  const titulos = { preparado: "¿Qué vas a preparar?", nuevo: "Preparado nuevo", ingredientes: "Ingredientes", lote: "Lote obtenido", termico: "Control térmico", revisar: "Revisar" };

  return (
    <>
      <Cabecera titulo="Nuevo preparado" volver={paso === "preparado" ? "/preparados" : undefined} />
      <main className="contenido">
        <div className="pasos" aria-hidden>{pasos.map((p, i) => <span key={p} className={i <= indice ? "hecho" : ""} />)}</div>
        <div className="paso-titulo">
          <span className="suave pequeno">Paso {indice + 1} de {pasos.length}</span>
          <h2>{titulos[paso]}</h2>
          {datos && paso !== "preparado" && paso !== "nuevo" && <span className="suave">{datos.nombre}</span>}
        </div>

        {paso === "preparado" && (
          <PasoPreparado catalogo={catalogo} onElegir={elegirGuardado}
            onCrear={(nombre) => { setElegido(null); setNuevo({ nombre, unidad_medida: "kg", proceso_termico: null, vida_util_dias: "", conservacion: "refrigerado" }); setFilas([filaVacia()]); irA("nuevo"); }} />
        )}
        {paso === "nuevo" && <PasoNuevo nuevo={nuevo} setNuevo={setNuevo} />}
        {paso === "ingredientes" && (
          <PasoIngredientes filas={filas} setFilas={setFilas} catalogo={catalogo.filter((c) => c.id !== elegido?.id)} lotes={lotes} conLotePorDefecto={conLotePorDefecto} />
        )}
        {paso === "lote" && <PasoLote lote={lote} setLote={setLote} unidad={unidad} />}
        {paso === "termico" && (
          <ControlTermico obj={obj} v={termico} fecha={lote.fecha} cambiar={(p) => setTermico((x) => ({ ...x, ...p }))} />
        )}
        {paso === "revisar" && <PasoRevisar datos={datos} filas={filas} lote={lote} unidad={unidad} termico={conTermico ? termico : null} obj={obj} irA={irA} />}

        {error && <Aviso tipo="error">{error}</Aviso>}
      </main>

      {paso !== "preparado" && (
        <div className="accion-fija">
          <div className="fila">
            <button className="boton grande" onClick={atras}>Atrás</button>
            {paso !== "revisar" ? (
              <button className="boton principal grande" style={{ flex: 1 }} onClick={siguiente}>Siguiente <ChevronRight size={22} aria-hidden /></button>
            ) : (
              <button className="boton principal grande" style={{ flex: 1 }} onClick={guardar} disabled={guardando}>
                <Check size={22} aria-hidden /> {guardando ? "Guardando…" : "Guardar preparado"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function PasoPreparado({ catalogo, onElegir, onCrear }) {
  const [q, setQ] = useState("");
  const guardados = catalogo.filter((p) => p.tipo === "preparado");
  return (
    <div className="pila">
      <Autocompletar
        valor={q}
        onTexto={setQ}
        opciones={guardados.map((p) => ({ id: p.id, texto: p.nombre, detalle: p.proceso_termico ? "Con proceso térmico" : "Sin proceso térmico", p }))}
        onElegir={(o) => onElegir(o.p)}
        onCrear={onCrear}
        textoCrear={(t) => `Crear el preparado «${t}»`}
        placeholder="Nombre del preparado, p. ej. Bechamel"
        autoFocus
        mostrarTodasVacio
        maxSugerencias={12}
      />
      {guardados.length === 0 && <p className="suave">Es tu primer preparado. Escribe su nombre: quedará guardado para las próximas veces.</p>}
    </div>
  );
}

function PasoNuevo({ nuevo, setNuevo }) {
  const c = (p) => setNuevo((x) => ({ ...x, ...p }));
  return (
    <div className="pila">
      <Campo etiqueta="Nombre del preparado" id="pn-nombre">
        <input id="pn-nombre" className="entrada" value={nuevo.nombre} onChange={(e) => c({ nombre: e.target.value })} />
      </Campo>
      <div className="campo">
        <span style={{ fontWeight: 700 }}>¿Lleva proceso térmico?</span>
        <span className="ayuda">Cocción y abatimiento. Si es así, cada lote pedirá sus temperaturas y tiempos de control.</span>
        <div className="si-no" role="radiogroup" aria-label="¿Lleva proceso térmico?">
          <button type="button" role="radio" className="opcion" aria-checked={nuevo.proceso_termico === true} onClick={() => c({ proceso_termico: true })} style={{ minHeight: 76 }}>
            <Flame size={24} aria-hidden /> Sí, se cocina
          </button>
          <button type="button" role="radio" className="opcion" aria-checked={nuevo.proceso_termico === false} onClick={() => c({ proceso_termico: false })} style={{ minHeight: 76 }}>
            <Snowflake size={24} aria-hidden /> No
          </button>
        </div>
      </div>
      <Opciones etiqueta="Unidad del lote obtenido" valor={nuevo.unidad_medida} onCambio={(v) => c({ unidad_medida: v })} opciones={["kg", "g", "l", "ml", "ud"].map((u) => ({ valor: u, texto: u }))} />
      <Opciones etiqueta="Conservación" valor={nuevo.conservacion} onCambio={(v) => c({ conservacion: v })}
        opciones={[{ valor: "ambiente", texto: "Ambiente" }, { valor: "refrigerado", texto: "Refrigerado" }, { valor: "congelado", texto: "Congelado" }]} />
      <Campo etiqueta="Vida útil (días)" id="pn-vida" ayuda="Opcional. Sirve para proponer la caducidad de cada lote.">
        <input id="pn-vida" className="entrada" inputMode="numeric" value={nuevo.vida_util_dias} onChange={(e) => c({ vida_util_dias: e.target.value })} />
      </Campo>
    </div>
  );
}

function PasoIngredientes({ filas, setFilas, catalogo, lotes, conLotePorDefecto }) {
  const cambiarFila = (k, p) => setFilas((l) => l.map((f) => (f.k === k ? { ...f, ...p } : f)));
  const opciones = useMemo(() => catalogo.map((p) => ({ id: p.id, texto: p.nombre, detalle: p.tipo === "preparado" ? "Preparado propio" : p.unidad_medida, p })), [catalogo]);

  return (
    <div className="pila">
      {filas.map((f, i) => {
        const delProducto = f.producto ? lotes.filter((l) => l.producto_id === f.producto.id) : [];
        const unidad = f.manual ? f.producto?.unidad_medida : f.lote?.unidad || f.producto?.unidad_medida;
        return (
          <div key={f.k} className="ingrediente">
            <div className="cabeza">
              <strong>Ingrediente {i + 1}</strong>
              {filas.length > 1 && (
                <button className="boton-icono" aria-label={`Quitar ingrediente ${i + 1}`} onClick={() => setFilas((l) => l.filter((x) => x.k !== f.k))}><Trash2 size={20} /></button>
              )}
            </div>
            <Autocompletar
              valor={f.texto}
              onTexto={(t) => cambiarFila(f.k, { texto: t, ...(f.producto && t !== f.producto.nombre ? { producto: null, lote: null } : {}) })}
              opciones={opciones}
              onElegir={(o) => cambiarFila(f.k, conLotePorDefecto({ ...f, producto: o.p, texto: o.texto }))}
              placeholder="Escribe el ingrediente"
            />
            {f.producto && (
              <>
                <div className="lotes" role="radiogroup" aria-label={`Lote de ${f.producto.nombre}`}>
                  {delProducto.map((l) => (
                    <button key={l.id} type="button" role="radio" className="opcion" aria-checked={!f.manual && f.lote?.id === l.id}
                      onClick={() => cambiarFila(f.k, { lote: l, manual: false })}>
                      <span className="lote-opcion">
                        <strong>{l.num_lote || "Sin nº de lote"}</strong>
                        <span className="numero">{num(l.disponible)} {l.unidad}</span>
                      </span>
                      <span className="desc">{[l.marca, l.caducidad && `cad. ${fecha(l.caducidad, { day: "numeric", month: "short" })}`].filter(Boolean).join(" · ") || fecha(l.fecha)}</span>
                    </button>
                  ))}
                  <button type="button" role="radio" className="opcion" aria-checked={f.manual} onClick={() => cambiarFila(f.k, { manual: true, lote: null })}>
                    <span>{delProducto.length ? "Otro lote (anotar a mano)" : "Sin stock registrado: anotar lote a mano"}</span>
                  </button>
                </div>
                {f.manual && (
                  <input className="entrada" placeholder="Nº de lote del envase" aria-label="Nº de lote" value={f.num_lote} onChange={(e) => cambiarFila(f.k, { num_lote: e.target.value })} />
                )}
                <Campo etiqueta={`Cantidad usada${unidad ? ` (${unidad})` : ""}`} id={`cant-${f.k}`}>
                  <input id={`cant-${f.k}`} className="entrada grande" inputMode="decimal" value={f.cantidad} onChange={(e) => cambiarFila(f.k, { cantidad: e.target.value })} />
                </Campo>
              </>
            )}
          </div>
        );
      })}
      <button className="boton bloque" onClick={() => setFilas((l) => [...l, filaVacia()])}><Plus size={20} aria-hidden /> Añadir ingrediente</button>
    </div>
  );
}

function PasoLote({ lote, setLote, unidad }) {
  const c = (p) => setLote((x) => ({ ...x, ...p }));
  return (
    <div className="pila">
      <Campo etiqueta="Nº de lote" id="pl-lote" ayuda="Propuesto automáticamente; puedes cambiarlo.">
        <input id="pl-lote" className="entrada grande" autoCapitalize="characters" value={lote.num_lote} onChange={(e) => c({ num_lote: e.target.value })} />
      </Campo>
      <Campo etiqueta={`Cantidad obtenida (${unidad})`} id="pl-cant">
        <input id="pl-cant" className="entrada grande" inputMode="decimal" value={lote.cantidad} onChange={(e) => c({ cantidad: e.target.value })} />
      </Campo>
      <div className="dos-columnas">
        <Campo etiqueta="Fecha" id="pl-fecha">
          <input id="pl-fecha" className="entrada" type="date" max={hoyISO()} value={lote.fecha} onChange={(e) => c({ fecha: e.target.value })} />
        </Campo>
        <Campo etiqueta="Caducidad" id="pl-cad">
          <input id="pl-cad" className="entrada" type="date" value={lote.caducidad} onChange={(e) => c({ caducidad: e.target.value })} />
        </Campo>
      </div>
      <Campo etiqueta="Responsable" id="pl-resp">
        <input id="pl-resp" className="entrada" value={lote.responsable} onChange={(e) => c({ responsable: e.target.value })} />
      </Campo>
      <Campo etiqueta="Observaciones" id="pl-obs">
        <textarea id="pl-obs" className="entrada" value={lote.observaciones} onChange={(e) => c({ observaciones: e.target.value })} />
      </Campo>
    </div>
  );
}

function PasoRevisar({ datos, filas, lote, unidad, termico, obj, irA }) {
  const r = termico ? evaluar(obj, termico, lote.fecha) : null;
  return (
    <div className="pila">
      <dl className="ficha panel">
        <dt>Preparado</dt><dd>{datos.nombre}</dd>
        <dt>Lote</dt><dd>{lote.num_lote}</dd>
        <dt>Obtenido</dt><dd>{num(aNumero(lote.cantidad))} {unidad}</dd>
        <dt>Fecha</dt><dd>{fecha(lote.fecha)}</dd>
        <dt>Caducidad</dt><dd>{fecha(lote.caducidad)}</dd>
        <dt>Responsable</dt><dd>{lote.responsable || "—"}</dd>
      </dl>
      <section className="seccion">
        <div className="fila entre"><h3>Ingredientes</h3><button className="boton" onClick={() => irA("ingredientes")}>Cambiar</button></div>
        <ul className="lista">
          {filas.filter((f) => f.producto).map((f) => (
            <li key={f.k}>
              <div className="item" style={{ cursor: "default" }}>
                <span className="principal"><strong>{f.producto.nombre}</strong><span className="suave pequeno">Lote {f.manual ? f.num_lote || "sin nº" : f.lote.num_lote || "sin nº"}</span></span>
                <span className="numero">{num(aNumero(f.cantidad))} {f.manual ? f.producto.unidad_medida : f.lote.unidad}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {termico && (
        <section className="panel pila">
          <div className="fila entre"><h3>Control térmico</h3><button className="boton" onClick={() => irA("termico")}>Cambiar</button></div>
          <p>Cocción: {termico.coccion_temp || "—"} °C · {termico.coccion_minutos || "—"} min {r.coccionOk === false && <span className="distintivo rojo">Fuera de objetivo</span>}</p>
          <p>Abatimiento: {termico.abat_hora_fin ? `${termico.abat_temp_inicio || "—"} → ${termico.abat_temp_fin} °C en ${r.minutos} min` : "pendiente de completar"} {r.abatOk === false && <span className="distintivo rojo">Fuera de objetivo</span>}</p>
          {termico.medida_correctora && <p className="suave">Medida correctora: {termico.medida_correctora}</p>}
        </section>
      )}
    </div>
  );
}
