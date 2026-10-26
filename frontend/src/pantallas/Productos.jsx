import React, { useEffect, useMemo, useState } from "react";
import { Plus, ChevronRight, FileText } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Cargando, Hoja, Opciones, useSesion, euros, fecha } from "../componentes/ui.jsx";
import { normal } from "../componentes/Autocompletar.jsx";
import Cabecera from "../componentes/Cabecera.jsx";
import Filtros, { filtrosVacios } from "../componentes/Filtros.jsx";
import Tabla from "../componentes/Tabla.jsx";
import useEscritorio from "../hooks/useEscritorio.js";

const CONSERVACION = { ambiente: "Ambiente", refrigerado: "Refrigerado", congelado: "Congelado" };
const ir = (p) => (window.location.hash = `/productos/${p.id}`);

const COLUMNAS = [
  { titulo: "Producto", ajustar: true, celda: (p) => <strong>{p.nombre}</strong> },
  { titulo: "Marcas", ajustar: true, celda: (p) => (p.marcas.length ? p.marcas.map((m) => m.nombre).join(", ") : <span className="suave">Sin marcas</span>) },
  { titulo: "Categoría", ajustar: true, celda: (p) => p.categoria || "—" },
  { titulo: "Ud.", celda: (p) => p.unidad_medida, ancho: 60 },
  { titulo: "Conservación", celda: (p) => CONSERVACION[p.conservacion] || "—" },
  { titulo: "Último precio", num: true, celda: (p) => (p.ultimo_precio != null ? `${euros(p.ultimo_precio)}/${p.unidad_medida}` : "—") },
  { titulo: "Fichas", num: true, celda: (p) => { const n = p.marcas.filter((m) => m.tiene_ficha).length; return n ? <span className="fila" style={{ justifyContent: "flex-end", gap: 4 }}><FileText size={16} aria-hidden />{n}</span> : "—"; } },
  { titulo: "Alta", celda: (p) => fecha(p.creado_en) },
  { titulo: "Estado", celda: (p) => (p.activo ? <span className="distintivo verde">Activo</span> : <span className="distintivo">De baja</span>) },
];

/** Productos: todos los ingredientes y materias primas que entran en el obrador. */
export default function Productos() {
  const { puede } = useSesion();
  const escritorio = useEscritorio();
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const [f, setF] = useState(filtrosVacios);
  const [alta, setAlta] = useState(false);

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
        <Filtros f={f} setF={setF} placeholder="Producto (primeras letras) o marca" informe="productos" etiquetaFechas="Alta" />
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!lista && !error && <Cargando />}
        {lista && filtrados.length === 0 && (
          <div className="vacio panel"><p>{filtrando ? "Nada coincide con los filtros." : "Aún no hay productos. Añade los ingredientes que compras habitualmente."}</p></div>
        )}
        {filtrados.length > 0 && <p className="suave pequeno">{filtrados.length} {filtrados.length === 1 ? "producto" : "productos"}</p>}
        {filtrados.length > 0 && escritorio && <Tabla columnas={COLUMNAS} filas={filtrados} onFila={ir} etiqueta="Productos" />}
        {filtrados.length > 0 && !escritorio && (
          <ul className="lista">
            {filtrados.map((p) => {
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
                    {fichas > 0 && <FileText size={18} aria-label={`${fichas} ficha(s) técnica(s)`} className="suave" />}
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
