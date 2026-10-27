import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Plus, Trash2, Flame, Snowflake, CornerDownRight } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Campo, Cargando, Opciones, useSesion, useToast, hoyISO, aNumero, num, fecha } from "../componentes/ui.jsx";
import Autocompletar from "../componentes/Autocompletar.jsx";
import ControlTermico, { aISO, horaAhora, evaluar } from "../componentes/ControlTermico.jsx";
import Cabecera from "../componentes/Cabecera.jsx";
import { ELABORACION } from "../componentes/elaboracion.js";
import { CONTROL_STOCK } from "../componentes/fase.js";

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

const horaInput = (iso) => (iso ? new Date(iso).toTimeString().slice(0, 5) : "");
const txt = (v) => (v == null ? "" : String(v).replace(".", ","));

/** Registrar una producción nueva o, con `id` y `tipo`, editar un lote existente (todas sus casillas). */
export default function NuevaProduccion({ id, tipo }) {
  const editar = Boolean(id);
  const { usuario } = useSesion();
  const toast = useToast();
  const [paso, setPaso] = useState("preparado");
  const [catalogo, setCatalogo] = useState(null); // todos los productos (ingredientes y nombres de producción)
  const [lotes, setLotes] = useState([]); // fase 1: últimos 3 lotes de cada ingrediente · fase 2: lotes con stock
  const [interna, setInterna] = useState(false); // producción interna (se usa como ingrediente) o final (se vende)
  const cfg = ELABORACION[interna ? "intermedia" : "final"];
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [elegido, setElegido] = useState(null); // preparado guardado
  const [nuevo, setNuevo] = useState(null); // { nombre, unidad_medida, proceso_termico, vida_util_dias, conservacion }
  const [filas, setFilas] = useState([filaVacia()]);
  const [lote, setLote] = useState({ num_lote: "", cantidad: "", unidades: "", fecha: hoyISO(), caducidad: "", responsable: usuario.nombre, observaciones: "" });
  const [termico, setTermico] = useState({ coccion_temp: "", coccion_minutos: "", abat_temp_inicio: "", abat_hora_inicio: horaAhora(), abat_temp_fin: "", abat_hora_fin: "", medida_correctora: "" });

  useEffect(() => {
    const origen = editar ? ELABORACION[tipo] : null;
    Promise.all([api.get("/catalogo/productos"), api.get(CONTROL_STOCK ? "/stock/lotes" : "/produccion/ultimos-lotes"),
      editar ? api.get(`${origen.api}/${id}`) : null])
      .then(([c, l, actual]) => {
        const lote0 = actual?.[origen.uno];
        const todos = c.productos.filter((p) => p.activo || p.id === lote0?.producto_id || actual?.ingredientes.some((i) => i.producto_id === p.id));
        setCatalogo(todos);
        setLotes(l.lotes);
        if (lote0) {
          setInterna(tipo === "intermedia");
          setElegido(todos.find((p) => p.id === lote0.producto_id) || null);
          setFilas(actual.ingredientes.map((i) => ({
            k: siguienteId++,
            producto: todos.find((p) => p.id === i.producto_id) || { id: i.producto_id, nombre: i.producto, unidad_medida: i.unidad, tipo: "materia_prima" },
            texto: i.producto,
            lote: i.origen === "manual" ? null : { origen: i.origen, id: i.lote_id, num_lote: i.num_lote, unidad: i.unidad, fecha: null },
            manual: i.origen === "manual",
            num_lote: i.num_lote || "",
            cantidad: txt(i.cantidad),
          })));
          setLote({
            num_lote: lote0.num_lote, cantidad: txt(lote0.cantidad), unidades: txt(lote0.unidades), fecha: lote0.fecha,
            caducidad: lote0.caducidad || "", responsable: lote0.responsable || "", observaciones: lote0.observaciones || "",
          });
          setTermico({
            coccion_temp: txt(lote0.coccion_temp), coccion_minutos: txt(lote0.coccion_minutos), abat_temp_inicio: txt(lote0.abat_temp_inicio),
            abat_hora_inicio: horaInput(lote0.abat_hora_inicio) || "", abat_temp_fin: txt(lote0.abat_temp_fin), abat_hora_fin: horaInput(lote0.abat_hora_fin),
            medida_correctora: lote0.medida_correctora || "",
          });
        }
      })
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
    if (editar) return; // al editar se mantienen la casilla y los ingredientes del lote
    setInterna(p.tipo === "preparado");
    // Se proponen los ingredientes de la última vez.
    const habituales = (p.ingredientes_habituales || []).map((h) => catalogo.find((c) => c.id === h.producto_id)).filter(Boolean);
    setFilas(habituales.length ? habituales.map((prod) => conLotePorDefecto(filaVacia(prod))) : [filaVacia()]);
    irA("ingredientes");
  }
  function conLotePorDefecto(fila) {
    // Fase 1: no se propone ningún lote; al pulsar en el campo salen los 3 últimos.
    if (!CONTROL_STOCK) return { ...fila, lote: null, manual: true, num_lote: "" };
    const primero = lotes.find((l) => l.producto_id === fila.producto?.id);
    return { ...fila, lote: primero || null, manual: !primero };
  }

  // Al pasar al paso de lote se propone nº de lote y caducidad.
  useEffect(() => {
    if (paso !== "lote" || lote.num_lote) return;
    const p = new URLSearchParams({ fecha: lote.fecha, ...(elegido ? { producto_id: elegido.id } : { nombre: nuevo?.nombre || "" }) });
    api.get(`${cfg.api}/siguiente-lote?${p}`).then(({ num_lote }) => setLote((x) => ({ ...x, num_lote: x.num_lote || num_lote }))).catch(() => {});
    const vida = aNumero(datos?.vida_util_dias);
    if (vida > 0 && !lote.caducidad) {
      const d = new Date(`${lote.fecha}T12:00:00`);
      d.setDate(d.getDate() + vida);
      setLote((x) => ({ ...x, caducidad: d.toISOString().slice(0, 10) }));
    }
  }, [paso]);

  function irA(p) { setError(""); setPaso(p); window.scrollTo(0, 0); }

  function validar() {
    if (paso === "preparado" && !elegido) return "Elige el producto elaborado.";
    if (paso === "nuevo") {
      if (!nuevo.nombre.trim()) return "Escribe el nombre.";
      if (nuevo.proceso_termico === null) return "Indica si lleva proceso térmico.";
    }
    if (paso === "ingredientes") {
      const validas = filas.filter((f) => f.producto);
      if (!validas.length) return "Añade al menos un ingrediente.";
      for (const f of validas) {
        const c = aNumero(f.cantidad);
        if (!(c > 0)) return `Indica la cantidad usada de ${f.producto.nombre}.`;
        if (!f.manual && !f.lote) return `Elige el lote de ${f.producto.nombre}.`;
        if (CONTROL_STOCK && !f.manual && c > f.lote.disponible + 1e-9) return `Del lote ${f.lote.num_lote || "sin nº"} de ${f.producto.nombre} solo quedan ${num(f.lote.disponible)} ${f.lote.unidad}.`;
      }
    }
    if (paso === "lote") {
      if (!lote.num_lote.trim()) return "Indica el nº de lote.";
      if (!(aNumero(lote.cantidad) > 0)) return "Indica la cantidad obtenida.";
      if (cfg.conUnidades && lote.unidades.trim() && !Number.isInteger(aNumero(lote.unidades))) return "Las unidades deben ser un número entero.";
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
      const enviar = editar
        ? (cuerpo) => api.patch(`${ELABORACION[tipo].api}/${id}`, { ...cuerpo, interna })
        : (cuerpo) => api.post(cfg.api, cuerpo);
      const respuesta = await enviar({
        ...(elegido ? { producto_id: elegido.id } : { nuevo: { ...nuevo, nombre: nuevo.nombre.trim(), vida_util_dias: aNumero(nuevo.vida_util_dias) } }),
        fecha: lote.fecha, num_lote: lote.num_lote.trim(), cantidad: aNumero(lote.cantidad), caducidad: lote.caducidad || null,
        responsable: lote.responsable.trim(), observaciones: lote.observaciones.trim(),
        ...(cfg.conUnidades ? { unidades: lote.unidades.trim() ? aNumero(lote.unidades) : null } : {}),
        ingredientes: filas.filter((f) => f.producto).map((f) => f.manual
          ? { origen: "manual", producto_id: f.producto.id, num_lote: f.num_lote.trim(), cantidad: aNumero(f.cantidad) }
          : { origen: f.lote.origen, lote_id: f.lote.id, cantidad: aNumero(f.cantidad) }),
        ...t,
      });
      toast(editar ? "Cambios guardados" : interna ? "Producción interna registrada" : "Producción registrada");
      window.location.hash = `${cfg.rutaFicha}/${respuesta[cfg.uno].id}`;
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  }

  if (!catalogo) {
    return (
      <>
        <Cabecera titulo={editar ? "Editar producción" : "Nueva producción"} volver={editar ? `${ELABORACION[tipo].rutaFicha}/${id}` : "/produccion"} />
        <main className="contenido">{error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />}</main>
      </>
    );
  }

  const titulos = { preparado: "¿Qué vas a elaborar?", nuevo: "Producto nuevo", ingredientes: "Ingredientes", lote: "Lote obtenido", termico: "Control térmico", revisar: "Revisar" };

  return (
    <>
      <Cabecera titulo={editar ? "Editar producción" : "Nueva producción"}
        volver={editar ? `${ELABORACION[tipo].rutaFicha}/${id}` : paso === "preparado" ? "/produccion" : undefined} />
      <main className="contenido">
        <div className="pasos" aria-hidden>{pasos.map((p, i) => <span key={p} className={i <= indice ? "hecho" : ""} />)}</div>
        <div className="paso-titulo">
          <span className="suave pequeno">Paso {indice + 1} de {pasos.length}</span>
          <h2>{titulos[paso]}</h2>
          {datos && paso !== "preparado" && paso !== "nuevo" && (
            <span className="suave">{datos.nombre} {interna && <span className="distintivo azul">Interna</span>}</span>
          )}
        </div>

        {paso === "preparado" && (
          <PasoPreparado interna={interna} setInterna={setInterna} catalogo={catalogo} onElegir={elegirGuardado} elegido={editar ? elegido : null}
            onCrear={editar ? undefined : (nombre) => { setElegido(null); setNuevo({ nombre, unidad_medida: "kg", proceso_termico: null, vida_util_dias: "", conservacion: "refrigerado" }); setFilas([filaVacia()]); irA("nuevo"); }} />
        )}
        {paso === "nuevo" && <PasoNuevo nuevo={nuevo} setNuevo={setNuevo} interna={interna} setInterna={setInterna} />}
        {paso === "ingredientes" && (
          <PasoIngredientes filas={filas} setFilas={setFilas} catalogo={catalogo.filter((c) => c.id !== elegido?.id && c.tipo !== "elaborado")} lotes={lotes} conLotePorDefecto={conLotePorDefecto} />
        )}
        {paso === "lote" && <PasoLote cfg={cfg} lote={lote} setLote={setLote} unidad={unidad} />}
        {paso === "termico" && (
          <ControlTermico obj={obj} v={termico} fecha={lote.fecha} cambiar={(p) => setTermico((x) => ({ ...x, ...p }))} />
        )}
        {paso === "revisar" && <PasoRevisar cfg={cfg} interna={interna} datos={datos} filas={filas} lote={lote} unidad={unidad} termico={conTermico ? termico : null} obj={obj} irA={irA} />}

        {error && <Aviso tipo="error">{error}</Aviso>}
      </main>

      {(paso !== "preparado" || editar) && (
        <div className="accion-fija">
          <div className="fila">
            {paso !== "preparado" && <button className="boton grande" onClick={atras}>Atrás</button>}
            {paso !== "revisar" ? (
              <button className="boton principal grande" style={{ flex: 1 }} onClick={siguiente}>Siguiente <ChevronRight size={22} aria-hidden /></button>
            ) : (
              <button className="boton principal grande" style={{ flex: 1 }} onClick={guardar} disabled={guardando}>
                <Check size={22} aria-hidden /> {guardando ? "Guardando…" : editar ? "Guardar cambios" : "Guardar lote"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Casilla "producción interna": se usa como ingrediente y no se vende. */
function CasillaInterna({ interna, setInterna }) {
  return (
    <label className="casilla">
      <input type="checkbox" checked={interna} onChange={(e) => setInterna(e.target.checked)} />
      <span>
        <strong>Producción interna</strong>
        <span className="suave pequeno">Se elabora para usarla como ingrediente (sofrito, salsa, crema pastelera…), no se vende.</span>
      </span>
    </label>
  );
}

function PasoPreparado({ interna, setInterna, catalogo, onElegir, onCrear, elegido }) {
  const [q, setQ] = useState(elegido?.nombre || "");
  const guardados = catalogo.filter((p) => p.tipo === "preparado" || p.tipo === "elaborado");
  return (
    <div className="pila">
      <CasillaInterna interna={interna} setInterna={setInterna} />
      <Autocompletar
        valor={q}
        onTexto={setQ}
        opciones={guardados.map((p) => ({ id: p.id, texto: p.nombre, detalle: [p.tipo === "preparado" ? "Producción interna" : "Producción final", p.proceso_termico ? "con proceso térmico" : "sin proceso térmico"].join(" · "), p }))}
        onElegir={(o) => onElegir(o.p)}
        onCrear={onCrear}
        textoCrear={(t) => `Crear «${t}»${interna ? " como producción interna" : ""}`}
        placeholder="Nombre, p. ej. Croquetas de jamón o Bechamel"
        autoFocus={!elegido}
        mostrarTodasVacio
        maxSugerencias={12}
      />
      {elegido && <p className="suave pequeno">Producto: <strong>{elegido.nombre}</strong>. Puedes cambiarlo eligiendo otro de la lista.</p>}
      {guardados.length === 0 && <p className="suave">Es tu primera producción. Escribe su nombre: quedará guardado para las próximas veces.</p>}
    </div>
  );
}

function PasoNuevo({ nuevo, setNuevo, interna, setInterna }) {
  const c = (p) => setNuevo((x) => ({ ...x, ...p }));
  return (
    <div className="pila">
      <CasillaInterna interna={interna} setInterna={setInterna} />
      <Campo etiqueta="Nombre" id="pn-nombre">
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
  const opciones = useMemo(() => catalogo.map((p) => ({ id: p.id, texto: p.nombre, detalle: p.tipo === "preparado" ? `Producción interna · ${p.unidad_medida}` : p.unidad_medida, p })), [catalogo]);

  return (
    <div className="pila">
      {filas.map((f, i) => {
        const delProducto = f.producto ? lotes.filter((l) => l.producto_id === f.producto.id) : [];
        const unidad = f.lote?.unidad || f.producto?.unidad_medida;
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
            {f.producto && !CONTROL_STOCK && (
              <>
                <LoteSugerido fila={f} lotes={delProducto} cambiar={(p) => cambiarFila(f.k, p)} />
                <Campo etiqueta={`Cantidad usada${unidad ? ` (${unidad})` : ""}`} id={`cant-${f.k}`}>
                  <input id={`cant-${f.k}`} className="entrada grande" inputMode="decimal" value={f.cantidad} onChange={(e) => cambiarFila(f.k, { cantidad: e.target.value })} />
                </Campo>
              </>
            )}
            {f.producto && CONTROL_STOCK && (
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

/**
 * Fase 1: nº de lote del ingrediente. Al pulsar en el campo se despliegan los
 * tres últimos lotes registrados de ese ingrediente; también se puede escribir
 * otro a mano.
 */
function LoteSugerido({ fila, lotes, cambiar }) {
  const opciones = lotes.map((l) => ({
    id: `${l.origen}-${l.id}`,
    texto: l.num_lote || "Sin nº de lote",
    detalle: [l.origen === "preparado" ? "Producción interna" : "Entrada", fecha(l.fecha, { day: "numeric", month: "short", year: "numeric" }),
      l.marca, l.proveedor, l.caducidad && `cad. ${fecha(l.caducidad, { day: "numeric", month: "short" })}`].filter(Boolean).join(" · "),
    l,
  }));
  const texto = fila.lote ? fila.lote.num_lote || "Sin nº de lote" : fila.num_lote;
  return (
    <div className="pila" style={{ gap: 6 }}>
      <Autocompletar
        etiqueta="Nº de lote"
        valor={texto}
        onTexto={(t) => cambiar({ lote: null, manual: true, num_lote: t })}
        opciones={opciones}
        onElegir={(o) => cambiar({ lote: o.l, manual: false, num_lote: o.l.num_lote || "" })}
        placeholder={opciones.length ? "Pulsa para ver los últimos lotes" : "Nº de lote del envase"}
        titulo={opciones.length === 1 ? "Último lote" : opciones.length ? `Últimos ${opciones.length} lotes` : undefined}
        mostrarTodasVacio
        mostrarSiempre
        maxSugerencias={3}
      />
      {fila.lote && (
        <span className="suave pequeno fila" style={{ gap: 6 }}>
          <CornerDownRight size={16} aria-hidden /> Enlazado con la {fila.lote.origen === "preparado" ? "producción interna" : "entrada"} del {fecha(fila.lote.fecha)}
        </span>
      )}
      {!fila.lote && !opciones.length && <span className="suave pequeno">Aún no hay entradas de este ingrediente: anota el lote del envase.</span>}
    </div>
  );
}

function PasoLote({ cfg, lote, setLote, unidad }) {
  const c = (p) => setLote((x) => ({ ...x, ...p }));
  return (
    <div className="pila">
      <Campo etiqueta="Nº de lote" id="pl-lote" ayuda="Propuesto automáticamente; puedes cambiarlo.">
        <input id="pl-lote" className="entrada grande" autoCapitalize="characters" value={lote.num_lote} onChange={(e) => c({ num_lote: e.target.value })} />
      </Campo>
      <Campo etiqueta={`Cantidad obtenida (${unidad})`} id="pl-cant">
        <input id="pl-cant" className="entrada grande" inputMode="decimal" value={lote.cantidad} onChange={(e) => c({ cantidad: e.target.value })} />
      </Campo>
      {cfg.conUnidades && unidad !== "ud" && (
        <Campo etiqueta="Unidades o raciones (opcional)" id="pl-uds" ayuda="Piezas, bandejas o raciones que salen del lote.">
          <input id="pl-uds" className="entrada" inputMode="numeric" value={lote.unidades} onChange={(e) => c({ unidades: e.target.value })} />
        </Campo>
      )}
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

function PasoRevisar({ cfg, interna, datos, filas, lote, unidad, termico, obj, irA }) {
  const r = termico ? evaluar(obj, termico, lote.fecha) : null;
  return (
    <div className="pila">
      <dl className="ficha panel">
        <dt>Producto</dt><dd>{datos.nombre}</dd>
        <dt>Tipo</dt><dd>{interna ? "Producción interna" : "Producción final"}</dd>
        <dt>Lote</dt><dd>{lote.num_lote}</dd>
        <dt>Obtenido</dt><dd>{num(aNumero(lote.cantidad))} {unidad}{cfg.conUnidades && lote.unidades ? ` · ${lote.unidades} uds.` : ""}</dd>
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
