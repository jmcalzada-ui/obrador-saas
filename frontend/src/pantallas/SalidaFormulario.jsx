import React, { useEffect, useMemo, useState } from "react";
import { Check, Plus, Trash2, CornerDownRight } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Campo, Cargando, useToast, hoyISO, aNumero, fecha, num } from "../componentes/ui.jsx";
import Autocompletar, { normal } from "../componentes/Autocompletar.jsx";
import Cabecera from "../componentes/Cabecera.jsx";
import { TIPOS_UNIDAD } from "./NuevaProduccion.jsx";
import { EditarCliente } from "./Salidas.jsx";

let siguienteK = 1;
const lineaVacia = () => ({ k: siguienteK++, producto: null, texto: "", lote: null, num_lote: "", cantidad: "", unidad: "", precio: "" });
const txt = (v) => (v == null ? "" : String(v).replace(".", ","));

/**
 * Registrar una salida (pedido a un cliente) o, con `id`, editarla.
 * Una sola pantalla: nº de pedido, fecha, cliente y las líneas con su lote.
 */
export default function SalidaFormulario({ id }) {
  const editar = Boolean(id);
  const toast = useToast();
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [pedidos, setPedidos] = useState([]);

  const [f, setF] = useState({ num_pedido: "", fecha: hoyISO(), cliente: null, textoCliente: "", observaciones: "" });
  const [lineas, setLineas] = useState([lineaVacia()]);
  const cambiar = (p) => setF((x) => ({ ...x, ...p }));

  useEffect(() => {
    Promise.all([
      api.get("/catalogo/productos"), api.get("/clientes"), api.get("/salidas/ultimos-lotes"), api.get("/salidas?limite=1000"),
      editar ? api.get(`/salidas/${id}`) : api.get(`/salidas/siguiente-pedido?fecha=${hoyISO()}`),
    ]).then(([p, c, l, s, x]) => {
      // Primero lo que se vende (producción final), luego producción interna y materias primas.
      const peso = { elaborado: 0, preparado: 1, materia_prima: 2 };
      setProductos(p.productos.filter((y) => y.activo || x.salida?.lineas.some((li) => li.producto_id === y.id))
        .sort((a, b) => peso[a.tipo] - peso[b.tipo] || a.nombre.localeCompare(b.nombre, "es")));
      setClientes(c.clientes);
      setLotes(l.lotes);
      setPedidos(s.salidas);
      if (editar) {
        const sa = x.salida;
        setF({ num_pedido: sa.num_pedido, fecha: sa.fecha, cliente: c.clientes.find((y) => y.id === sa.cliente_id) || { id: sa.cliente_id, nombre: sa.cliente },
          textoCliente: sa.cliente, observaciones: sa.observaciones || "" });
        setLineas(sa.lineas.map((li) => ({
          k: siguienteK++,
          producto: p.productos.find((y) => y.id === li.producto_id) || { id: li.producto_id, nombre: li.producto },
          texto: li.producto,
          lote: li.origen === "manual" ? null : { origen: li.origen, id: li.lote_id, num_lote: li.num_lote },
          num_lote: li.num_lote || "",
          cantidad: txt(li.cantidad),
          unidad: li.unidad || "",
          precio: txt(li.precio),
        })));
      } else {
        cambiar({ num_pedido: x.num_pedido });
      }
      setCargado(true);
    }).catch((e) => setError(e.message));
  }, [id]);

  // Al cambiar la fecha de un pedido nuevo se propone el nº del día (si no se ha tocado).
  async function cambiarFecha(nueva) {
    const propuesto = /^P-\d{6}-\d+$/.test(f.num_pedido);
    cambiar({ fecha: nueva });
    if (!editar && propuesto && nueva) {
      try { const { num_pedido } = await api.get(`/salidas/siguiente-pedido?fecha=${nueva}`); cambiar({ num_pedido }); } catch { /* se queda el anterior */ }
    }
  }

  // Clientes nuevos (o sin NIF): se abre su ficha, porque la razón social y el NIF son obligatorios.
  const [fichaCliente, setFichaCliente] = useState(null);
  function clienteGuardado(cliente) {
    setFichaCliente(null);
    if (!cliente) return;
    setClientes((l) => [...l.filter((x) => x.id !== cliente.id), { salidas: 0, ...cliente }]);
    cambiar({ cliente, textoCliente: cliente.nombre });
  }


  function validar() {
    if (!f.num_pedido.trim()) return "Indica el nº de pedido.";
    if (!f.cliente) return f.textoCliente.trim() ? `«${f.textoCliente.trim()}» no está en tus clientes: elígelo de la lista o pulsa «Añadir…».` : "Elige el cliente.";
    if (!f.cliente.cif) return `Falta el NIF de «${f.cliente.nombre}»: complétalo para poder guardar la salida.`;
    const sinElegir = lineas.find((l) => !l.producto && l.texto.trim());
    if (sinElegir) return `«${sinElegir.texto.trim()}» no está en tus productos: elígelo de la lista.`;
    const validas = lineas.filter((l) => l.producto);
    if (!validas.length) return "Añade al menos un producto.";
    for (const l of validas) {
      if (Number.isNaN(aNumero(l.precio)) || aNumero(l.precio) < 0) return `El precio de ${l.producto.nombre} no es válido.`;
      if (!l.lote && !l.num_lote.trim()) return `Elige o escribe el lote de ${l.producto.nombre}.`;
      if (!(aNumero(l.cantidad) > 0)) return `Indica la cantidad de ${l.producto.nombre}.`;
    }
    return "";
  }

  async function guardar() {
    const e = validar();
    if (e) return setError(e);
    setGuardando(true);
    setError("");
    const cuerpo = {
      num_pedido: f.num_pedido.trim(), fecha: f.fecha, cliente_id: f.cliente.id, observaciones: f.observaciones.trim(),
      lineas: lineas.filter((l) => l.producto).map((l) => (l.lote
        ? { producto_id: l.producto.id, origen: l.lote.origen, lote_id: l.lote.id, cantidad: aNumero(l.cantidad), unidad: l.unidad.trim(), precio: aNumero(l.precio) }
        : { producto_id: l.producto.id, origen: "manual", num_lote: l.num_lote.trim(), cantidad: aNumero(l.cantidad), unidad: l.unidad.trim(), precio: aNumero(l.precio) })),
    };
    try {
      const { salida } = editar ? await api.patch(`/salidas/${id}`, cuerpo) : await api.post("/salidas", cuerpo);
      toast(editar ? "Cambios guardados" : "Salida registrada");
      window.location.hash = `/salidas/${salida.id}`;
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  }

  const volver = editar ? `/salidas/${id}` : "/salidas";
  if (!cargado) {
    return (
      <>
        <Cabecera titulo={editar ? "Editar salida" : "Nueva salida"} volver={volver} />
        <main className="contenido">{error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />}</main>
      </>
    );
  }

  return (
    <>
      <Cabecera titulo={editar ? "Editar salida" : "Nueva salida"} volver={volver} />
      <main className="contenido">
        <div className="dos-columnas">
          <Autocompletar
            etiqueta="Nº de pedido"
            valor={f.num_pedido}
            onTexto={(t) => cambiar({ num_pedido: t })}
            opciones={pedidos.filter((p) => p.id !== id).map((p) => ({ id: p.id, texto: p.num_pedido, detalle: `${p.cliente} · ${fecha(p.fecha)}`, p }))}
            onElegir={(o) => (window.location.hash = `/salidas/${o.p.id}/editar`)}
            titulo="Abrir un pedido ya registrado"
            placeholder="Nº de pedido"
          />
          <Campo etiqueta="Fecha de salida" id="sa-fecha">
            <input id="sa-fecha" className="entrada" type="date" value={f.fecha} onChange={(e) => cambiarFecha(e.target.value)} />
          </Campo>
        </div>
        <p className="suave pequeno" style={{ marginTop: -6 }}>Propuesto automáticamente; puedes poner el de tu albarán o factura. Si escribes uno ya registrado, puedes abrirlo para añadirle productos.</p>

        <Autocompletar
          etiqueta="Cliente"
          valor={f.textoCliente}
          onTexto={(t) => {
            const exacto = clientes.find((c) => normal(c.nombre) === normal(t));
            cambiar({ textoCliente: t, cliente: exacto || null });
          }}
          opciones={clientes.filter((c) => c.activo || c.id === f.cliente?.id).map((c) => ({ id: c.id, texto: c.nombre, detalle: [c.cif, c.direccion].filter(Boolean).join(" · ") || undefined, c }))}
          onElegir={(o) => cambiar({ cliente: o.c, textoCliente: o.texto })}
          onCrear={(nombre) => setFichaCliente({ nombre })}
          textoCrear={(t) => `Añadir el cliente «${t}»`}
          placeholder="Escribe el cliente"
          mostrarTodasVacio
        />

        {f.cliente && !f.cliente.cif && (
          <Aviso>
            <span>Falta el NIF de este cliente (es obligatorio para enlazarlo con Holded).{" "}
              <button type="button" className="enlace" onClick={() => setFichaCliente(f.cliente)}>Completar sus datos</button></span>
          </Aviso>
        )}
        {f.cliente?.cif && <p className="suave pequeno" style={{ marginTop: -8 }}>NIF {f.cliente.cif}{f.cliente.poblacion ? ` · ${f.cliente.poblacion}` : ""}</p>}

        <section className="seccion">
          <h2>Productos y lotes</h2>
          {lineas.map((l, i) => (
            <LineaSalida key={l.k} n={i + 1} l={l} productos={productos} lotes={lotes} puedeQuitar={lineas.length > 1}
              cambiar={(p) => setLineas((x) => x.map((y) => (y.k === l.k ? { ...y, ...p } : y)))}
              quitar={() => setLineas((x) => x.filter((y) => y.k !== l.k))} />
          ))}
          <button className="boton bloque" onClick={() => setLineas((x) => [...x, lineaVacia()])}><Plus size={20} aria-hidden /> Añadir producto</button>
        </section>

        <Campo etiqueta="Observaciones" id="sa-obs">
          <textarea id="sa-obs" className="entrada" value={f.observaciones} onChange={(e) => cambiar({ observaciones: e.target.value })} placeholder="Nº de albarán, transportista, temperatura de carga…" />
        </Campo>
        {error && <Aviso tipo="error">{error}</Aviso>}
      </main>
      {fichaCliente && <EditarCliente c={fichaCliente} onCerrar={() => setFichaCliente(null)} onHecho={(_, cliente) => clienteGuardado(cliente)} />}
      <div className="accion-fija">
        <button className="boton principal grande" onClick={guardar} disabled={guardando}>
          <Check size={22} aria-hidden /> {guardando ? "Guardando…" : editar ? "Guardar cambios" : "Guardar salida"}
        </button>
      </div>
    </>
  );
}

/** Una línea: producto, lote (los 3 últimos del producto en un desplegable) y cantidad con su unidad. */
function LineaSalida({ n, l, productos, lotes, cambiar, quitar, puedeQuitar }) {
  const opcionesProducto = useMemo(() => productos.map((p) => ({
    id: p.id, texto: p.nombre, p,
    detalle: p.tipo === "elaborado" ? "Producción final" : p.tipo === "preparado" ? "Producción interna" : `Materia prima · ${p.unidad_medida}`,
  })), [productos]);
  const delProducto = l.producto ? lotes.filter((x) => x.producto_id === l.producto.id) : [];
  const opcionesLote = delProducto.map((x) => ({
    id: `${x.origen}-${x.id}`, texto: x.num_lote, x,
    detalle: [fecha(x.fecha, { day: "numeric", month: "short", year: "numeric" }), `${num(x.cantidad)} ${x.unidad}`,
      x.unidades != null && `${num(x.unidades)} ${x.unidades_tipo || "uds."}`, x.caducidad && `cad. ${fecha(x.caducidad, { day: "numeric", month: "short" })}`].filter(Boolean).join(" · "),
  }));
  const unidadPorDefecto = (p, lote) => lote?.unidades_tipo || (p?.unidad_medida === "ud" ? "unidades" : p?.unidad_medida) || "";

  function elegirProducto(p) {
    // El lote no se rellena solo: se elige del desplegable (últimos 3) o se escribe.
    cambiar({ producto: p, texto: p.nombre, lote: null, num_lote: "", unidad: l.unidad || unidadPorDefecto(p, null),
      precio: l.precio || (p.precio_venta != null ? txt(p.precio_venta) : "") });
  }

  return (
    <div className="ingrediente">
      <div className="cabeza">
        <strong>Producto {n}</strong>
        {puedeQuitar && <button className="boton-icono" aria-label={`Quitar producto ${n}`} onClick={quitar}><Trash2 size={20} /></button>}
      </div>
      <Autocompletar
        valor={l.texto}
        onTexto={(t) => {
          const exacto = productos.find((p) => normal(p.nombre) === normal(t));
          if (exacto && exacto.id !== l.producto?.id) elegirProducto(exacto);
          else cambiar({ texto: t, ...(l.producto && t !== l.producto.nombre ? { producto: null, lote: null, num_lote: "" } : {}) });
        }}
        opciones={opcionesProducto}
        onElegir={(o) => elegirProducto(o.p)}
        placeholder="Escribe el producto"
      />
      {l.producto && (
        <>
          <Autocompletar
            etiqueta="Lote"
            valor={l.lote ? l.lote.num_lote : l.num_lote}
            onTexto={(t) => cambiar({ lote: null, num_lote: t })}
            opciones={opcionesLote}
            onElegir={(o) => cambiar({ lote: o.x, num_lote: o.x.num_lote, unidad: o.x.unidades_tipo || l.unidad || unidadPorDefecto(l.producto, o.x) })}
            titulo={opcionesLote.length === 1 ? "Último lote" : opcionesLote.length ? `Últimos ${opcionesLote.length} lotes` : undefined}
            placeholder={opcionesLote.length ? "Pulsa para ver los últimos lotes" : "Nº de lote"}
            mostrarTodasVacio
            mostrarSiempre
            maxSugerencias={3}
          />
          {l.lote && l.lote.fecha && (
            <span className="suave pequeno fila" style={{ gap: 6 }}><CornerDownRight size={16} aria-hidden /> Lote del {fecha(l.lote.fecha)}</span>
          )}
          <div className="linea-cantidades">
            <label><span>Cantidad</span>
              <input className="entrada" inputMode="decimal" aria-label={`Cantidad de ${l.producto.nombre}`} value={l.cantidad} onChange={(e) => cambiar({ cantidad: e.target.value })} /></label>
            <label><span>Unidad</span>
              <input className="entrada" list="tipos-unidad-salida" aria-label="Unidad" placeholder="kg, cajas…" value={l.unidad} onChange={(e) => cambiar({ unidad: e.target.value })} /></label>
            <label><span>Precio €/ud (opcional)</span>
              <input className="entrada" inputMode="decimal" aria-label={`Precio de ${l.producto.nombre}`} placeholder="sin impuestos" value={l.precio} onChange={(e) => cambiar({ precio: e.target.value })} /></label>
          </div>
          <datalist id="tipos-unidad-salida">{["kg", "g", "l", ...TIPOS_UNIDAD].map((t) => <option key={t} value={t} />)}</datalist>
        </>
      )}
    </div>
  );
}
