import React, { useEffect, useMemo, useState } from "react";
import { Plus, ChevronRight, FileText, Search, Pencil, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Campo, Cargando, Hoja, Opciones, useSesion, useToast, euros, fecha } from "../componentes/ui.jsx";
import { normal } from "../componentes/Autocompletar.jsx";
import Cabecera from "../componentes/Cabecera.jsx";
import Filtros, { filtrosVacios } from "../componentes/Filtros.jsx";
import Tabla, { ordenar, SelectorOrden } from "../componentes/Tabla.jsx";
import { ResumenAlergenos } from "../componentes/Alergenos.jsx";
import { FICHAS_TECNICAS } from "../componentes/fase.js";
import useEscritorio from "../hooks/useEscritorio.js";

/** Alérgenos y trazas de un producto: los de todas sus marcas. */
function alergenosDe(p) {
  const a = new Set(p.marcas.flatMap((m) => m.alergenos || []));
  const t = new Set(p.marcas.flatMap((m) => m.trazas || []).filter((x) => !a.has(x)));
  return { alergenos: [...a], trazas: [...t] };
}

const CONSERVACION = { ambiente: "Ambiente", refrigerado: "Refrigerado", congelado: "Congelado" };
const ir = (p) => (window.location.hash = `/productos/${p.id}`);

const COLUMNAS = [
  { titulo: "Producto", ajustar: true, celda: (p) => <strong>{p.nombre}</strong>, orden: (p) => p.nombre },
  { titulo: "Marcas", ajustar: true, celda: (p) => (p.marcas.length ? p.marcas.map((m) => m.nombre).join(", ") : <span className="suave">Sin marcas</span>), orden: (p) => p.marcas.map((m) => m.nombre).join(", ") },
  { titulo: "Categoría", ajustar: true, celda: (p) => p.categoria || "—", orden: (p) => p.categoria || "" },
  { titulo: "Ud.", celda: (p) => p.unidad_medida, orden: (p) => p.unidad_medida, ancho: 60 },
  { titulo: "Conservación", celda: (p) => CONSERVACION[p.conservacion] || "—", orden: (p) => p.conservacion || "" },
  { titulo: "Alérgenos", ajustar: true, celda: (p) => <ResumenAlergenos alergenos={alergenosDe(p).alergenos} trazas={alergenosDe(p).trazas} />, orden: (p) => alergenosDe(p).alergenos.length * 100 + alergenosDe(p).trazas.length },
  { titulo: "Último precio", num: true, celda: (p) => (p.ultimo_precio != null ? `${euros(p.ultimo_precio)}/${p.unidad_medida}` : "—"), orden: (p) => p.ultimo_precio ?? -1 },
  ...(FICHAS_TECNICAS ? [{ titulo: "Fichas", num: true, celda: (p) => { const n = p.marcas.filter((m) => m.tiene_ficha).length; return n ? <span className="fila" style={{ justifyContent: "flex-end", gap: 4 }}><FileText size={16} aria-hidden />{n}</span> : "—"; }, orden: (p) => p.marcas.filter((m) => m.tiene_ficha).length }] : []),
  { titulo: "Alta", celda: (p) => fecha(p.creado_en), orden: (p) => p.creado_en },
  { titulo: "Estado", celda: (p) => (p.activo ? <span className="distintivo verde">Activo</span> : <span className="distintivo">De baja</span>), orden: (p) => p.activo },
];

/** Productos: todos los ingredientes y materias primas que entran en el obrador. */
export default function Productos() {
  const [vista, setVista] = useState("productos");
  return vista === "productos" ? <ListaProductos vista={vista} setVista={setVista} /> : <Proveedores vista={vista} setVista={setVista} />;
}

/** Productos | Proveedores */
function Pestanas({ vista, setVista }) {
  return (
    <div className="opciones compactas" role="radiogroup" aria-label="Qué mostrar">
      {[["productos", "Productos"], ["proveedores", "Proveedores"]].map(([v, t]) => (
        <button key={v} type="button" role="radio" className="opcion" aria-checked={vista === v} onClick={() => setVista(v)}>{t}</button>
      ))}
    </div>
  );
}

function ListaProductos({ vista, setVista }) {
  const { puede } = useSesion();
  const escritorio = useEscritorio();
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const [f, setF] = useState(filtrosVacios);
  const [alta, setAlta] = useState(false);
  const [orden, setOrden] = useState(null);

  useEffect(() => {
    api.get("/catalogo/productos?tipo=materia_prima").then(({ productos }) => setLista(productos)).catch((e) => setError(e.message));
  }, []);

  // Lupa: primero los que empiezan por lo escrito, luego los que lo contienen (también en la marca).
  const filtrados = useMemo(() => {
    if (!lista) return [];
    const n = normal(f.q.trim());
    const dia = (iso) => (iso ? String(iso).slice(0, 10) : "");
    let r = lista.filter((p) => (!f.desde || dia(p.creado_en) >= f.desde) && (!f.hasta || dia(p.creado_en) <= f.hasta));
    if (n) {
      const empieza = r.filter((p) => normal(p.nombre).startsWith(n));
      const contiene = r.filter((p) => !normal(p.nombre).startsWith(n) && (normal(p.nombre).includes(n) || p.marcas.some((m) => normal(m.nombre).includes(n))));
      r = [...empieza, ...contiene];
    }
    return r;
  }, [lista, f]);

  const filtrando = f.q || f.desde || f.hasta;

  return (
    <>
      <Cabecera titulo="Productos" />
      <main className="contenido ancho">
        <Pestanas vista={vista} setVista={setVista} />
        <Filtros f={f} setF={setF} placeholder="Producto (primeras letras) o marca" informe="productos" etiquetaFechas="Alta" />
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!lista && !error && <Cargando />}
        {lista && filtrados.length === 0 && (
          <div className="vacio panel"><p>{filtrando ? "Nada coincide con los filtros." : "Aún no hay productos. Añade los ingredientes que compras habitualmente."}</p></div>
        )}
        {filtrados.length > 0 && <p className="suave pequeno">{filtrados.length} {filtrados.length === 1 ? "producto" : "productos"}</p>}
        {filtrados.length > 0 && escritorio && <Tabla columnas={COLUMNAS} filas={ordenar(filtrados, COLUMNAS, orden)} orden={orden} onOrden={setOrden} onFila={ir} etiqueta="Productos" />}
        {filtrados.length > 0 && !escritorio && <SelectorOrden columnas={COLUMNAS} orden={orden} onOrden={setOrden} textoDefecto="Orden: alfabético" />}
        {filtrados.length > 0 && !escritorio && (
          <ul className="lista">
            {ordenar(filtrados, COLUMNAS, orden).map((p) => {
              const fichas = p.marcas.filter((m) => m.tiene_ficha).length;
              return (
                <li key={p.id}>
                  <button className="item" onClick={() => ir(p)}>
                    <span className="principal">
                      <strong>{p.nombre}</strong>
                      <span className="suave pequeno">
                        {p.marcas.length ? p.marcas.map((m) => m.nombre).join(", ") : "Sin marcas"}
                      </span>
                    </span>
                    <span style={{ textAlign: "right" }}>
                      <span className="distintivo">{p.unidad_medida}</span>
                      {p.ultimo_precio != null && <div className="pequeno suave numero">{euros(p.ultimo_precio)}/{p.unidad_medida}</div>}
                    </span>
                    {FICHAS_TECNICAS && fichas > 0 && <FileText size={18} aria-label={`${fichas} ficha(s) técnica(s)`} className="suave" />}
                    {!p.activo && <span className="distintivo">De baja</span>}
                    <ChevronRight size={20} aria-hidden className="suave" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      {puede("registrar") && (
        <div className="accion-fija">
          <button className="boton principal grande" onClick={() => setAlta(true)}><Plus size={22} aria-hidden /> Añadir producto</button>
        </div>
      )}
      {alta && (
        <AltaProducto
          onCerrar={() => setAlta(false)}
          onCreado={(p) => { setAlta(false); window.location.hash = `/productos/${p.id}`; }}
        />
      )}
    </>
  );
}

function AltaProducto({ onCerrar, onCreado }) {
  const [f, setF] = useState({ nombre: "", unidad_medida: "kg", conservacion: "ambiente", categoria: "" });
  const [error, setError] = useState("");
  async function crear() {
    setError("");
    try {
      const { producto } = await api.post("/catalogo/productos", { ...f, nombre: f.nombre.trim(), categoria: f.categoria.trim() || null });
      onCreado(producto);
    } catch (e) { setError(e.message); }
  }
  return (
    <Hoja titulo="Añadir producto" onCerrar={onCerrar}>
      <div className="campo">
        <label htmlFor="np-nombre">Nombre general</label>
        <input id="np-nombre" className="entrada" autoFocus value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="p. ej. Harina de trigo, Pechuga de pollo" />
        <span className="ayuda">Las marcas concretas se añaden después dentro del producto.</span>
      </div>
      <Opciones etiqueta="Unidad de medida" valor={f.unidad_medida} onCambio={(v) => setF({ ...f, unidad_medida: v })} opciones={["kg", "g", "l", "ml", "ud"].map((u) => ({ valor: u, texto: u }))} />
      <Opciones etiqueta="Conservación" valor={f.conservacion} onCambio={(v) => setF({ ...f, conservacion: v })}
        opciones={[{ valor: "ambiente", texto: "Ambiente" }, { valor: "refrigerado", texto: "Refrigerado" }, { valor: "congelado", texto: "Congelado" }]} />
      <div className="campo">
        <label htmlFor="np-cat">Categoría (opcional)</label>
        <input id="np-cat" className="entrada" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} placeholder="p. ej. Harinas, Lácteos, Carnes" />
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <button className="boton principal grande bloque" onClick={crear} disabled={!f.nombre.trim()}>Añadir producto</button>
    </Hoja>
  );
}

/** Proveedores: corregir nombre, CIF y contacto, darlos de baja o eliminarlos. */
function Proveedores({ vista, setVista }) {
  const { puede } = useSesion();
  const toast = useToast();
  const escritorio = useEscritorio();
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState(null); // proveedor o {} para uno nuevo
  const [orden, setOrden] = useState(null);
  const cargar = () => api.get("/catalogo/proveedores").then(({ proveedores }) => setLista(proveedores)).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(() => {
    if (!lista) return [];
    const n = normal(q.trim());
    if (!n) return lista;
    return [...lista.filter((p) => normal(p.nombre).startsWith(n)), ...lista.filter((p) => !normal(p.nombre).startsWith(n) && normal(p.nombre).includes(n))];
  }, [lista, q]);
  const columnas = [
    { titulo: "Proveedor", ajustar: true, celda: (p) => <strong>{p.nombre}</strong>, orden: (p) => p.nombre },
    { titulo: "CIF / NIF", celda: (p) => p.cif || "—", orden: (p) => p.cif || "" },
    { titulo: "Contacto", ajustar: true, celda: (p) => p.contacto || "—", orden: (p) => p.contacto || "" },
    { titulo: "Estado", celda: (p) => (p.activo ? <span className="distintivo verde">Activo</span> : <span className="distintivo">De baja</span>), orden: (p) => p.activo },
  ];
  const abrir = (p) => puede("catalogo") && setEditando(p);

  return (
    <>
      <Cabecera titulo="Proveedores" />
      <main className="contenido ancho">
        <Pestanas vista={vista} setVista={setVista} />
        <div className="buscador">
          <Search size={20} aria-hidden />
          <input className="entrada" type="search" placeholder="Proveedor (primeras letras)" aria-label="Buscar proveedor" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!lista && !error && <Cargando />}
        {lista && filtrados.length === 0 && <div className="vacio panel"><p>{q ? "Nada coincide." : "Aún no hay proveedores. Se añaden solos al registrar una entrada."}</p></div>}
        {filtrados.length > 0 && escritorio && <Tabla columnas={columnas} filas={ordenar(filtrados, columnas, orden)} orden={orden} onOrden={setOrden} onFila={abrir} etiqueta="Proveedores" />}
        {filtrados.length > 0 && !escritorio && (
          <ul className="lista">
            {ordenar(filtrados, columnas, orden).map((p) => (
              <li key={p.id}>
                <button className="item" onClick={() => abrir(p)}>
                  <span className="principal"><strong>{p.nombre}</strong><span className="suave pequeno">{[p.cif, p.contacto].filter(Boolean).join(" · ") || "Sin CIF ni contacto"}</span></span>
                  {!p.activo && <span className="distintivo">De baja</span>}
                  {puede("catalogo") && <Pencil size={18} aria-hidden className="suave" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
      {puede("registrar") && (
        <div className="accion-fija">
          <button className="boton principal grande" onClick={() => setEditando({})}><Plus size={22} aria-hidden /> Añadir proveedor</button>
        </div>
      )}
      {editando && <EditarProveedor p={editando} onCerrar={() => setEditando(null)} onHecho={(msg) => { setEditando(null); toast(msg); cargar(); }} />}
    </>
  );
}

function EditarProveedor({ p, onCerrar, onHecho }) {
  const { puede } = useSesion();
  const nuevo = !p.id;
  const [f, setF] = useState({ nombre: p.nombre || "", cif: p.cif || "", contacto: p.contacto || "", activo: p.activo ?? true });
  const [error, setError] = useState("");
  async function guardar() {
    setError("");
    try {
      if (nuevo) {
        const { proveedor } = await api.post("/catalogo/proveedores", { nombre: f.nombre.trim() });
        if (f.cif.trim() || f.contacto.trim()) await api.patch(`/catalogo/proveedores/${proveedor.id}`, { cif: f.cif.trim() || null, contacto: f.contacto.trim() || null });
      } else {
        await api.patch(`/catalogo/proveedores/${p.id}`, { nombre: f.nombre.trim(), cif: f.cif.trim() || null, contacto: f.contacto.trim() || null, activo: f.activo });
      }
      onHecho(nuevo ? "Proveedor añadido" : "Proveedor guardado");
    } catch (e) { setError(e.message); }
  }
  async function borrar() {
    try { await api.delete(`/catalogo/proveedores/${p.id}`); onHecho("Proveedor eliminado"); } catch (e) { setError(e.message); }
  }
  return (
    <Hoja titulo={nuevo ? "Añadir proveedor" : "Editar proveedor"} onCerrar={onCerrar}>
      <Campo etiqueta="Nombre" id="pr-nombre"><input id="pr-nombre" className="entrada" autoFocus value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
      {!nuevo && <p className="suave pequeno">Si cambias el nombre, cambia en todas las entradas de este proveedor.</p>}
      <Campo etiqueta="CIF / NIF" id="pr-cif"><input id="pr-cif" className="entrada" value={f.cif} onChange={(e) => setF({ ...f, cif: e.target.value })} /></Campo>
      <Campo etiqueta="Contacto" id="pr-con" ayuda="Teléfono, email o persona de contacto.">
        <input id="pr-con" className="entrada" value={f.contacto} onChange={(e) => setF({ ...f, contacto: e.target.value })} />
      </Campo>
      {!nuevo && <Opciones etiqueta="Estado" valor={f.activo} onCambio={(v) => setF({ ...f, activo: v })} opciones={[{ valor: true, texto: "Activo" }, { valor: false, texto: "De baja" }]} />}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <button className="boton principal grande bloque" onClick={guardar} disabled={!f.nombre.trim()}>Guardar</button>
      {!nuevo && puede("borrar") && <button className="boton peligro bloque" onClick={borrar}><Trash2 size={18} aria-hidden /> Eliminar proveedor</button>}
    </Hoja>
  );
}
