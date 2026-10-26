import React, { useEffect, useRef, useState } from "react";
import { Plus, FileText, Upload, Pencil, Trash2 } from "lucide-react";
import { api, leerBase64 } from "../api.js";
import { Aviso, Campo, Cargando, Hoja, Opciones, useSesion, useToast, euros, fecha, aNumero } from "../componentes/ui.jsx";
import Cabecera from "../componentes/Cabecera.jsx";

export const ALERGENOS = [
  ["gluten", "Gluten"], ["crustaceos", "Crustáceos"], ["huevo", "Huevo"], ["pescado", "Pescado"], ["cacahuetes", "Cacahuetes"],
  ["soja", "Soja"], ["leche", "Leche"], ["frutos_cascara", "Frutos de cáscara"], ["apio", "Apio"], ["mostaza", "Mostaza"],
  ["sesamo", "Sésamo"], ["sulfitos", "Sulfitos"], ["altramuces", "Altramuces"], ["moluscos", "Moluscos"],
];
const nombreAlergeno = Object.fromEntries(ALERGENOS);
const CONSERVACION = { ambiente: "Ambiente", refrigerado: "Refrigerado", congelado: "Congelado" };

export default function ProductoDetalle({ id }) {
  const { puede } = useSesion();
  const toast = useToast();
  const [producto, setProducto] = useState(null);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState(false);
  const [marca, setMarca] = useState(null); // marca en edición o {} para nueva

  const cargar = () =>
    api.get("/catalogo/productos").then(({ productos }) => {
      const p = productos.find((x) => x.id === id);
      if (!p) setError("Producto no encontrado.");
      setProducto(p || null);
    }).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, [id]);

  const esPreparado = producto?.tipo === "preparado";
  const volver = esPreparado ? "/preparados" : "/productos";

  return (
    <>
      <Cabecera
        titulo={producto?.nombre || "Producto"}
        volver={volver}
        accion={producto && puede("catalogo") && (
          <button className="boton-icono" aria-label="Editar producto" onClick={() => setEditando(true)}><Pencil size={22} /></button>
        )}
      />
      <main className="contenido">
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!producto && !error && <Cargando />}
        {producto && (
          <>
            <dl className="ficha panel">
              <dt>Unidad</dt><dd>{producto.unidad_medida} <span className="suave pequeno">(fija)</span></dd>
              {!esPreparado && <><dt>Conservación</dt><dd>{CONSERVACION[producto.conservacion] || "—"}</dd></>}
              {producto.categoria && <><dt>Categoría</dt><dd>{producto.categoria}</dd></>}
              {producto.ultimo_precio != null && <><dt>Último precio</dt><dd>{euros(producto.ultimo_precio)} / {producto.unidad_medida}</dd></>}
              {esPreparado && (
                <>
                  <dt>Proceso térmico</dt><dd>{producto.proceso_termico ? "Sí" : "No"}</dd>
                  {producto.proceso_termico && (
                    <>
                      <dt>Cocción</dt><dd>≥ {producto.coccion_temp_min} °C en el centro</dd>
                      <dt>Abatimiento</dt><dd>hasta ≤ {producto.abatimiento_temp_max} °C en {producto.abatimiento_minutos_max} min como máximo</dd>
                    </>
                  )}
                  <dt>Vida útil</dt><dd>{producto.vida_util_dias ? `${producto.vida_util_dias} días` : "—"}</dd>
                </>
              )}
              {!producto.activo && <><dt>Estado</dt><dd>De baja</dd></>}
            </dl>

            {!esPreparado && (
              <section className="seccion">
                <div className="fila entre">
                  <h2>Marcas</h2>
                  {puede("registrar") && <button className="boton" onClick={() => setMarca({})}><Plus size={18} aria-hidden /> Añadir marca</button>}
                </div>
                {producto.marcas.length === 0 && <p className="suave">Añade las marcas que compras de este producto, con su ficha técnica y precio de referencia.</p>}
                {producto.marcas.map((m) => (
                  <TarjetaMarca key={m.id} m={m} unidad={producto.unidad_medida} puedeEditar={puede("catalogo")} puedeSubir={puede("registrar")}
                    onEditar={() => setMarca(m)} onCambio={cargar} />
                ))}
              </section>
            )}
          </>
        )}
      </main>
      {editando && (
        <EditarProducto p={producto} onCerrar={() => setEditando(false)}
          onGuardado={() => { setEditando(false); toast("Producto actualizado"); cargar(); }}
          onBorrado={() => { toast("Producto eliminado"); window.location.hash = volver; }} />
      )}
      {marca && (
        <EditarMarca productoId={id} unidad={producto.unidad_medida} m={marca} onCerrar={() => setMarca(null)}
          onGuardado={() => { setMarca(null); toast("Marca guardada"); cargar(); }} />
      )}
    </>
  );
}

function TarjetaMarca({ m, unidad, puedeEditar, puedeSubir, onEditar, onCambio }) {
  const toast = useToast();
  const entrada = useRef(null);
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState(false);

  async function subir(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setError("");
    if (archivo.type !== "application/pdf") return setError("La ficha técnica debe ser un PDF.");
    if (archivo.size > 6 * 1024 * 1024) return setError("El PDF supera los 6 MB.");
    setSubiendo(true);
    try {
      await api.put(`/catalogo/marcas/${m.id}/ficha`, { nombre: archivo.name, mime_type: archivo.type, base64: await leerBase64(archivo) });
      toast("Ficha técnica guardada");
      onCambio();
    } catch (err) { setError(err.message); } finally { setSubiendo(false); }
  }

  return (
    <div className="panel pila">
      <div className="fila entre">
        <div style={{ minWidth: 0 }}>
          <strong>{m.nombre}</strong>
          <div className="suave pequeno">{[m.formato, m.proveedor].filter(Boolean).join(" · ") || "Sin formato ni proveedor"}</div>
        </div>
        {puedeEditar && <button className="boton-icono" aria-label={`Editar ${m.nombre}`} onClick={onEditar}><Pencil size={20} /></button>}
      </div>
      <dl className="ficha">
        <dt>Precio ref.</dt>
        <dd>{m.precio_referencia != null ? `${euros(m.precio_referencia)} / ${unidad}` : "—"}{m.precio_ref_fecha && <span className="suave pequeno"> · {fecha(m.precio_ref_fecha)}</span>}</dd>
        <dt>Último pagado</dt><dd>{m.ultimo_precio != null ? `${euros(m.ultimo_precio)} / ${unidad}` : "—"}</dd>
        <dt>Alérgenos</dt><dd>{m.alergenos?.length ? m.alergenos.map((a) => nombreAlergeno[a] || a).join(", ") : "Ninguno indicado"}</dd>
      </dl>
      <div className="fila" style={{ flexWrap: "wrap" }}>
        {m.tiene_ficha && (
          <button className="boton" onClick={() => api.abrirArchivo(`/catalogo/marcas/${m.id}/ficha`).catch((e) => setError(e.message))}>
            <FileText size={18} aria-hidden /> Ver ficha técnica
          </button>
        )}
        {puedeSubir && (
          <>
            <button className="boton" disabled={subiendo} onClick={() => entrada.current?.click()}>
              <Upload size={18} aria-hidden /> {subiendo ? "Subiendo…" : m.tiene_ficha ? "Cambiar ficha" : "Subir ficha (PDF)"}
            </button>
            <input ref={entrada} type="file" accept="application/pdf" hidden onChange={subir} />
          </>
        )}
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
    </div>
  );
}

function EditarMarca({ productoId, unidad, m, onCerrar, onGuardado }) {
  const nueva = !m.id;
  const [proveedores, setProveedores] = useState([]);
  const [f, setF] = useState({
    nombre: m.nombre || "", formato: m.formato || "", proveedor_id: m.proveedor_id || "",
    precio_referencia: m.precio_referencia != null ? String(m.precio_referencia).replace(".", ",") : "",
    alergenos: m.alergenos || [], composicion: m.composicion || "",
  });
  const [error, setError] = useState("");
  useEffect(() => { api.get("/catalogo/proveedores").then((d) => setProveedores(d.proveedores)).catch(() => {}); }, []);

  async function guardar() {
    const precio = aNumero(f.precio_referencia);
    if (Number.isNaN(precio)) return setError("El precio no es un número.");
    const cuerpo = { nombre: f.nombre.trim(), formato: f.formato.trim() || null, proveedor_id: f.proveedor_id || null, precio_referencia: precio, alergenos: f.alergenos, composicion: f.composicion };
    try {
      if (nueva) await api.post(`/catalogo/productos/${productoId}/marcas`, cuerpo);
      else await api.patch(`/catalogo/marcas/${m.id}`, cuerpo);
      onGuardado();
    } catch (e) { setError(e.message); }
  }
  async function borrar() {
    try { await api.delete(`/catalogo/marcas/${m.id}`); onGuardado(); } catch (e) { setError(e.message); }
  }
  const alternar = (a) => setF((x) => ({ ...x, alergenos: x.alergenos.includes(a) ? x.alergenos.filter((y) => y !== a) : [...x.alergenos, a] }));

  return (
    <Hoja titulo={nueva ? "Añadir marca" : `Editar ${m.nombre}`} onCerrar={onCerrar}>
      <Campo etiqueta="Marca" id="m-nombre"><input id="m-nombre" className="entrada" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
      <Campo etiqueta="Formato" id="m-formato" ayuda="p. ej. saco 25 kg, caja 6 × 1 l">
        <input id="m-formato" className="entrada" value={f.formato} onChange={(e) => setF({ ...f, formato: e.target.value })} />
      </Campo>
      <Campo etiqueta="Proveedor habitual" id="m-prov">
        <select id="m-prov" className="entrada" value={f.proveedor_id} onChange={(e) => setF({ ...f, proveedor_id: e.target.value })}>
          <option value="">Sin indicar</option>
          {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </Campo>
      <Campo etiqueta={`Precio de referencia (€ / ${unidad}, sin impuestos)`} id="m-precio">
        <input id="m-precio" className="entrada" inputMode="decimal" value={f.precio_referencia} onChange={(e) => setF({ ...f, precio_referencia: e.target.value })} />
      </Campo>
      <div className="campo">
        <span style={{ fontWeight: 700 }}>Alérgenos</span>
        <div className="opciones" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
          {ALERGENOS.map(([k, t]) => (
            <button key={k} type="button" className="opcion" aria-pressed={f.alergenos.includes(k)} onClick={() => alternar(k)} style={{ fontWeight: 400 }}>{t}</button>
          ))}
        </div>
      </div>
      <Campo etiqueta="Ingredientes (según la ficha técnica)" id="m-comp">
        <textarea id="m-comp" className="entrada" value={f.composicion} onChange={(e) => setF({ ...f, composicion: e.target.value })} />
      </Campo>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <button className="boton principal grande bloque" onClick={guardar} disabled={!f.nombre.trim()}>Guardar marca</button>
      {!nueva && <button className="boton peligro bloque" onClick={borrar}><Trash2 size={18} aria-hidden /> Eliminar marca</button>}
    </Hoja>
  );
}

function EditarProducto({ p, onCerrar, onGuardado, onBorrado }) {
  const preparado = p.tipo === "preparado";
  const t = (v) => (v == null ? "" : String(v).replace(".", ","));
  const [f, setF] = useState({
    nombre: p.nombre, unidad_medida: p.unidad_medida, conservacion: p.conservacion || "ambiente", categoria: p.categoria || "",
    proceso_termico: Boolean(p.proceso_termico), coccion_temp_min: t(p.coccion_temp_min ?? 75),
    abatimiento_temp_max: t(p.abatimiento_temp_max ?? 10), abatimiento_minutos_max: t(p.abatimiento_minutos_max ?? 120),
    vida_util_dias: t(p.vida_util_dias), activo: p.activo,
  });
  const [error, setError] = useState("");

  async function guardar() {
    const cuerpo = { nombre: f.nombre.trim(), unidad_medida: f.unidad_medida, categoria: f.categoria.trim() || null, activo: f.activo };
    if (!preparado) cuerpo.conservacion = f.conservacion;
    if (preparado) {
      cuerpo.proceso_termico = f.proceso_termico;
      cuerpo.vida_util_dias = aNumero(f.vida_util_dias);
      if (f.proceso_termico) {
        cuerpo.coccion_temp_min = aNumero(f.coccion_temp_min);
        cuerpo.abatimiento_temp_max = aNumero(f.abatimiento_temp_max);
        cuerpo.abatimiento_minutos_max = aNumero(f.abatimiento_minutos_max);
      }
      if (Object.values(cuerpo).some((v) => Number.isNaN(v))) return setError("Revisa los valores numéricos.");
    }
    try { await api.patch(`/catalogo/productos/${p.id}`, cuerpo); onGuardado(); } catch (e) { setError(e.message); }
  }
  async function borrar() {
    try { await api.delete(`/catalogo/productos/${p.id}`); onBorrado(); }
    catch (e) { setError(e.status === 409 ? "No se puede eliminar: ya tiene registros. Puedes darlo de baja." : e.message); }
  }

  return (
    <Hoja titulo="Editar producto" onCerrar={onCerrar}>
      <Campo etiqueta="Nombre" id="p-nombre"><input id="p-nombre" className="entrada" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
      <Opciones etiqueta="Unidad de medida" valor={f.unidad_medida} onCambio={(v) => setF({ ...f, unidad_medida: v })} opciones={["kg", "g", "l", "ml", "ud"].map((u) => ({ valor: u, texto: u }))} />
      <p className="suave pequeno">Solo se puede cambiar mientras el producto no tenga registros.</p>
      {!preparado && (
        <Opciones etiqueta="Conservación" valor={f.conservacion} onCambio={(v) => setF({ ...f, conservacion: v })}
          opciones={Object.entries(CONSERVACION).map(([valor, texto]) => ({ valor, texto }))} />
      )}
      {preparado && (
        <>
          <Opciones etiqueta="¿Lleva proceso térmico?" valor={f.proceso_termico} onCambio={(v) => setF({ ...f, proceso_termico: v })}
            opciones={[{ valor: true, texto: "Sí" }, { valor: false, texto: "No" }]} />
          {f.proceso_termico && (
            <div className="panel pila">
              <Campo etiqueta="Cocción: temperatura mínima en el centro (°C)" id="p-coc">
                <input id="p-coc" className="entrada" inputMode="decimal" value={f.coccion_temp_min} onChange={(e) => setF({ ...f, coccion_temp_min: e.target.value })} />
              </Campo>
              <div className="dos-columnas">
                <Campo etiqueta="Abatir hasta (°C)" id="p-abt">
                  <input id="p-abt" className="entrada" inputMode="decimal" value={f.abatimiento_temp_max} onChange={(e) => setF({ ...f, abatimiento_temp_max: e.target.value })} />
                </Campo>
                <Campo etiqueta="En como máximo (min)" id="p-abm">
                  <input id="p-abm" className="entrada" inputMode="numeric" value={f.abatimiento_minutos_max} onChange={(e) => setF({ ...f, abatimiento_minutos_max: e.target.value })} />
                </Campo>
              </div>
            </div>
          )}
          <Campo etiqueta="Vida útil (días)" id="p-vida" ayuda="Sirve para proponer la caducidad de cada lote.">
            <input id="p-vida" className="entrada" inputMode="numeric" value={f.vida_util_dias} onChange={(e) => setF({ ...f, vida_util_dias: e.target.value })} />
          </Campo>
        </>
      )}
      <Campo etiqueta="Categoría" id="p-cat"><input id="p-cat" className="entrada" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} /></Campo>
      <Opciones etiqueta="Estado" valor={f.activo} onCambio={(v) => setF({ ...f, activo: v })} opciones={[{ valor: true, texto: "Activo" }, { valor: false, texto: "De baja" }]} />
      {error && <Aviso tipo="error">{error}</Aviso>}
      <button className="boton principal grande bloque" onClick={guardar} disabled={!f.nombre.trim()}>Guardar cambios</button>
      <button className="boton peligro bloque" onClick={borrar}><Trash2 size={18} aria-hidden /> Eliminar producto</button>
    </Hoja>
  );
}
