import React, { useEffect, useMemo, useState } from "react";
import { Plus, Search, ChevronRight, FileText } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Cargando, Hoja, Opciones, useSesion, euros } from "../componentes/ui.jsx";
import { normal } from "../componentes/Autocompletar.jsx";
import Cabecera from "../componentes/Cabecera.jsx";

/** Productos: todos los ingredientes y materias primas que entran en el obrador. */
export default function Productos() {
  const { puede } = useSesion();
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [alta, setAlta] = useState(false);

  useEffect(() => {
    api.get("/catalogo/productos?tipo=materia_prima").then(({ productos }) => setLista(productos)).catch((e) => setError(e.message));
  }, []);

  const filtrados = useMemo(() => {
    if (!lista) return [];
    const n = normal(q);
    return n ? lista.filter((p) => normal(p.nombre).includes(n) || p.marcas.some((m) => normal(m.nombre).includes(n))) : lista;
  }, [lista, q]);

  return (
    <>
      <Cabecera titulo="Productos" />
      <main className="contenido">
        <div className="buscador">
          <Search size={20} aria-hidden />
          <input className="entrada" type="search" placeholder="Producto o marca" aria-label="Buscar productos" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!lista && !error && <Cargando />}
        {lista && filtrados.length === 0 && (
          <div className="vacio panel"><p>{q ? `Nada coincide con «${q}».` : "Aún no hay productos. Añade los ingredientes que compras habitualmente."}</p></div>
        )}
        {filtrados.length > 0 && (
          <ul className="lista">
            {filtrados.map((p) => {
              const fichas = p.marcas.filter((m) => m.tiene_ficha).length;
              return (
                <li key={p.id}>
                  <button className="item" onClick={() => (window.location.hash = `/productos/${p.id}`)}>
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
