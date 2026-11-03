import React, { useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Campo, Cargando, Hoja, Opciones, useSesion, useToast, num, fecha } from "../componentes/ui.jsx";
import { normal } from "../componentes/Autocompletar.jsx";
import Cabecera from "../componentes/Cabecera.jsx";
import Filtros, { filtrosVacios, aParametros } from "../componentes/Filtros.jsx";
import Tabla, { ordenar, SelectorOrden } from "../componentes/Tabla.jsx";
import useEscritorio from "../hooks/useEscritorio.js";

/** "Croquetas de jamón · CR-4 · 12 bandejas" */
export const textoLinea = (l) => [l.producto, l.num_lote && `lote ${l.num_lote}`, `${num(l.cantidad)} ${l.unidad || ""}`.trim()].filter(Boolean).join(" · ");

const ir = (s) => (window.location.hash = `/salidas/${s.id}`);

const COLUMNAS = [
  { titulo: "Fecha", celda: (s) => fecha(s.fecha), orden: (s) => s.fecha, ancho: 110 },
  { titulo: "Nº pedido", celda: (s) => <span className="lote-tabla">{s.num_pedido}</span>, orden: (s) => s.num_pedido },
  { titulo: "Cliente", ajustar: true, celda: (s) => <strong>{s.cliente}</strong>, orden: (s) => s.cliente },
  {
    titulo: "Productos y lotes", ajustar: true,
    celda: (s) => <span className="lineas-salida">{s.lineas.map((l) => <span key={l.id}>{textoLinea(l)}</span>)}</span>,
    orden: (s) => s.lineas.map((l) => l.producto).join(", "),
  },
  { titulo: "Líneas", num: true, celda: (s) => s.lineas.length, orden: (s) => s.lineas.length },
];

/** Salidas | Clientes */
function Pestanas({ vista, setVista }) {
  return (
    <div className="opciones compactas" role="radiogroup" aria-label="Qué mostrar">
      {[["salidas", "Salidas"], ["clientes", "Clientes"]].map(([v, t]) => (
        <button key={v} type="button" role="radio" className="opcion" aria-checked={vista === v} onClick={() => setVista(v)}>{t}</button>
      ))}
    </div>
  );
}

export default function Salidas() {
  const [vista, setVista] = useState("salidas");
  return vista === "salidas" ? <ListaSalidas vista={vista} setVista={setVista} /> : <Clientes vista={vista} setVista={setVista} />;
}

function ListaSalidas({ vista, setVista }) {
  const { puede } = useSesion();
  const escritorio = useEscritorio();
  const [f, setF] = useState(filtrosVacios);
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const [orden, setOrden] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/salidas?${aParametros(f)}`).then(({ salidas }) => { setLista(salidas); setError(""); }).catch((e) => setError(e.message));
    }, f.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [f]);

  const filtrando = f.q || f.desde || f.hasta;
  return (
    <>
      <Cabecera titulo="Salidas a clientes" />
      <main className="contenido ancho">
        <Pestanas vista={vista} setVista={setVista} />
        <Filtros f={f} setF={setF} placeholder="Producto, lote, cliente o nº de pedido" informe="salidas" etiquetaFechas="Salida" />
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!lista && !error && <Cargando />}
        {lista && lista.length === 0 && (
          <div className="vacio panel"><p>{filtrando ? "Nada coincide con los filtros." : "Aún no hay salidas registradas."}</p></div>
        )}
        {lista && lista.length > 0 && <p className="suave pequeno">{lista.length} {lista.length === 1 ? "pedido" : "pedidos"}</p>}
        {lista && lista.length > 0 && escritorio && (
          <Tabla columnas={COLUMNAS} filas={ordenar(lista, COLUMNAS, orden)} orden={orden} onOrden={setOrden} onFila={ir} etiqueta="Salidas a clientes" />
        )}
        {lista && lista.length > 0 && !escritorio && <SelectorOrden columnas={COLUMNAS} orden={orden} onOrden={setOrden} />}
        {lista && lista.length > 0 && !escritorio && ordenar(lista, COLUMNAS, orden).map((s) => (
          <button key={s.id} type="button" className="etiqueta" onClick={() => ir(s)}>
            <div style={{ minWidth: 0 }}>
              <div className="producto">{s.cliente}</div>
              <div className="lote">{s.num_pedido}</div>
            </div>
            <div className="cantidad">
              <strong>{s.lineas.length}</strong> <span className="suave">{s.lineas.length === 1 ? "línea" : "líneas"}</span>
            </div>
            <div className="meta">
              <span>{fecha(s.fecha, { day: "numeric", month: "short" })}</span>
              {s.lineas.slice(0, 3).map((l) => <span key={l.id}>{textoLinea(l)}</span>)}
              {s.lineas.length > 3 && <span>y {s.lineas.length - 3} más</span>}
            </div>
          </button>
        ))}
      </main>
      {puede("registrar") && (
        <div className="accion-fija">
          <button className="boton principal grande" onClick={() => (window.location.hash = "/salidas/nueva")}><Plus size={22} aria-hidden /> Registrar salida</button>
        </div>
      )}
    </>
  );
}

/** Clientes: nombre, CIF, contacto y dirección; darlos de baja o eliminarlos. */
function Clientes({ vista, setVista }) {
  const { puede } = useSesion();
  const toast = useToast();
  const escritorio = useEscritorio();
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState(null);
  const [orden, setOrden] = useState(null);
  const cargar = () => api.get("/clientes").then(({ clientes }) => setLista(clientes)).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(() => {
    if (!lista) return [];
    const n = normal(q.trim());
    if (!n) return lista;
    return [...lista.filter((c) => normal(c.nombre).startsWith(n)), ...lista.filter((c) => !normal(c.nombre).startsWith(n) && normal(c.nombre).includes(n))];
  }, [lista, q]);
  const columnas = [
    { titulo: "Cliente", ajustar: true, celda: (c) => <strong>{c.nombre}</strong>, orden: (c) => c.nombre },
    { titulo: "CIF / NIF", celda: (c) => c.cif || "—", orden: (c) => c.cif || "" },
    { titulo: "Contacto", ajustar: true, celda: (c) => c.contacto || "—", orden: (c) => c.contacto || "" },
    { titulo: "Dirección", ajustar: true, celda: (c) => c.direccion || "—", orden: (c) => c.direccion || "" },
    { titulo: "Salidas", num: true, celda: (c) => c.salidas, orden: (c) => c.salidas },
    { titulo: "Estado", celda: (c) => (c.activo ? <span className="distintivo verde">Activo</span> : <span className="distintivo">De baja</span>), orden: (c) => c.activo },
  ];
  const abrir = (c) => puede("editar") && setEditando(c);

  return (
    <>
      <Cabecera titulo="Clientes" />
      <main className="contenido ancho">
        <Pestanas vista={vista} setVista={setVista} />
        <div className="buscador">
          <Search size={20} aria-hidden />
          <input className="entrada" type="search" placeholder="Cliente (primeras letras)" aria-label="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!lista && !error && <Cargando />}
        {lista && filtrados.length === 0 && <div className="vacio panel"><p>{q ? "Nada coincide." : "Aún no hay clientes. También se añaden al registrar una salida."}</p></div>}
        {filtrados.length > 0 && escritorio && <Tabla columnas={columnas} filas={ordenar(filtrados, columnas, orden)} orden={orden} onOrden={setOrden} onFila={abrir} etiqueta="Clientes" />}
        {filtrados.length > 0 && !escritorio && (
          <ul className="lista">
            {ordenar(filtrados, columnas, orden).map((c) => (
              <li key={c.id}>
                <button className="item" onClick={() => abrir(c)}>
                  <span className="principal"><strong>{c.nombre}</strong><span className="suave pequeno">{[c.cif, c.contacto].filter(Boolean).join(" · ") || "Sin CIF ni contacto"} · {c.salidas} {c.salidas === 1 ? "salida" : "salidas"}</span></span>
                  {!c.activo && <span className="distintivo">De baja</span>}
                  {puede("editar") && <Pencil size={18} aria-hidden className="suave" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
      {puede("registrar") && (
        <div className="accion-fija">
          <button className="boton principal grande" onClick={() => setEditando({})}><Plus size={22} aria-hidden /> Añadir cliente</button>
        </div>
      )}
      {editando && <EditarCliente c={editando} onCerrar={() => setEditando(null)} onHecho={(msg) => { setEditando(null); toast(msg); cargar(); }} />}
    </>
  );
}

export function EditarCliente({ c, onCerrar, onHecho }) {
  const { puede } = useSesion();
  const nuevo = !c.id;
  const [f, setF] = useState({ nombre: c.nombre || "", cif: c.cif || "", contacto: c.contacto || "", direccion: c.direccion || "", activo: c.activo ?? true });
  const [error, setError] = useState("");
  async function guardar() {
    setError("");
    const cuerpo = { nombre: f.nombre.trim(), cif: f.cif.trim() || null, contacto: f.contacto.trim() || null, direccion: f.direccion.trim() || null };
    try {
      const r = nuevo ? await api.post("/clientes", cuerpo) : await api.patch(`/clientes/${c.id}`, { ...cuerpo, activo: f.activo });
      onHecho(nuevo ? "Cliente añadido" : "Cliente guardado", r.cliente);
    } catch (e) { setError(e.message); }
  }
  async function borrar() {
    try { await api.delete(`/clientes/${c.id}`); onHecho("Cliente eliminado"); } catch (e) { setError(e.message); }
  }
  return (
    <Hoja titulo={nuevo ? "Añadir cliente" : "Editar cliente"} onCerrar={onCerrar}>
      <Campo etiqueta="Nombre o razón social" id="cl-nombre"><input id="cl-nombre" className="entrada" autoFocus value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
      <Campo etiqueta="CIF / NIF" id="cl-cif"><input id="cl-cif" className="entrada" value={f.cif} onChange={(e) => setF({ ...f, cif: e.target.value })} /></Campo>
      <Campo etiqueta="Contacto" id="cl-con" ayuda="Teléfono, email o persona de contacto.">
        <input id="cl-con" className="entrada" value={f.contacto} onChange={(e) => setF({ ...f, contacto: e.target.value })} />
      </Campo>
      <Campo etiqueta="Dirección de entrega" id="cl-dir"><input id="cl-dir" className="entrada" value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} /></Campo>
      {!nuevo && <Opciones etiqueta="Estado" valor={f.activo} onCambio={(v) => setF({ ...f, activo: v })} opciones={[{ valor: true, texto: "Activo" }, { valor: false, texto: "De baja" }]} />}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <button className="boton principal grande bloque" onClick={guardar} disabled={!f.nombre.trim()}>Guardar</button>
      {!nuevo && puede("borrar") && <button className="boton peligro bloque" onClick={borrar}><Trash2 size={18} aria-hidden /> Eliminar cliente</button>}
    </Hoja>
  );
}
