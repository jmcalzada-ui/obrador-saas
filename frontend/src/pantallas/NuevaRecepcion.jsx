import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, AlertTriangle } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Campo, Cargando, Opciones, useToast, hoyISO, aNumero, num, fecha, euros } from "../componentes/ui.jsx";
import Autocompletar from "../componentes/Autocompletar.jsx";
import Cabecera from "../componentes/Cabecera.jsx";

const PASOS = ["Producto", "Lote y cantidad", "Control de entrada", "Revisar"];

// Temperaturas de referencia en recepción según la conservación del producto.
const LIMITE_TEMP = { refrigerado: { max: 7, texto: "Refrigerado: como máximo 7 °C (lo habitual, de 0 a 4 °C)." }, congelado: { max: -15, texto: "Congelado: −18 °C o menos (tolerancia hasta −15 °C)." } };

/** Registrar una entrada nueva o, con `id`, editar todas las casillas de una existente. */
export default function NuevaRecepcion({ id }) {
  const editar = Boolean(id);
  const toast = useToast();
  const [paso, setPaso] = useState(editar ? 1 : 0);
  const [productos, setProductos] = useState(null);
  const [proveedores, setProveedores] = useState([]);
  const [recientes, setRecientes] = useState([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [f, setF] = useState({
    producto: null, marca_id: null, proveedor_id: null,
    num_lote: "", cantidad: "", bultos: "", caducidad: "", factura: "", fecha: hoyISO(),
    estado_entrada: "conforme", temp_entrada: "", precio: "", modoPrecio: "unidad", observaciones: "",
    control_envase: true, control_etiquetado: true, control_transporte: true,
  });
  const cambiar = (patch) => setF((x) => ({ ...x, ...patch }));

  useEffect(() => {
    Promise.all([api.get("/catalogo/productos?tipo=materia_prima"), api.get("/catalogo/proveedores"), api.get("/recepciones?limite=300"),
      editar ? api.get(`/recepciones/${id}`) : null])
      .then(([p, pr, r, actual]) => {
        const e = actual?.recepcion;
        setProductos(p.productos.filter((x) => x.activo || x.id === e?.producto_id));
        setProveedores(pr.proveedores.filter((x) => x.activo || x.id === e?.proveedor_id));
        setRecientes(r.recepciones);
        if (e) {
          const t = (v) => (v == null ? "" : String(v).replace(".", ","));
          setF({
            producto: p.productos.find((x) => x.id === e.producto_id) || null, marca_id: e.marca_id, proveedor_id: e.proveedor_id,
            num_lote: e.num_lote || "", cantidad: t(e.cantidad), bultos: t(e.bultos), caducidad: e.caducidad || "", factura: e.factura || "",
            fecha: e.fecha, estado_entrada: e.estado_entrada, temp_entrada: t(e.temp_entrada),
            precio: e.precio_total != null ? t(e.precio_total) : "", modoPrecio: "total", observaciones: e.observaciones || "",
            control_envase: e.control_envase, control_etiquetado: e.control_etiquetado, control_transporte: e.control_transporte,
          });
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  // Al elegir producto se rellenan marca, proveedor y precio de la última entrada.
  function elegirProducto(p) {
    const ultima = recientes.find((r) => r.producto_id === p.id);
    const marca = p.marcas.find((m) => m.id === ultima?.marca_id) || (p.marcas.length === 1 ? p.marcas[0] : null);
    cambiar({
      producto: p,
      marca_id: marca?.id ?? null,
      proveedor_id: ultima?.proveedor_id ?? marca?.proveedor_id ?? null,
      precio: ultima?.precio_unidad != null ? String(ultima.precio_unidad).replace(".", ",") : marca?.precio_referencia != null ? String(marca.precio_referencia).replace(".", ",") : "",
      modoPrecio: "unidad",
    });
    setPaso(1);
    window.scrollTo(0, 0);
  }

  const cantidad = aNumero(f.cantidad);
  const precio = aNumero(f.precio);
  const precioUnidad = f.modoPrecio === "unidad" ? precio : cantidad > 0 && precio != null ? precio / cantidad : null;
  const precioTotal = f.modoPrecio === "total" ? precio : cantidad > 0 && precio != null ? precio * cantidad : null;

  function validarPaso() {
    if (paso === 1) {
      if (!(cantidad > 0)) return "Indica la cantidad recibida.";
      const b = aNumero(f.bultos);
      if (Number.isNaN(b) || (b !== null && (b < 1 || !Number.isInteger(b)))) return "El nº de bultos debe ser un número entero.";
      if (f.caducidad && f.caducidad < f.fecha) return "La fecha de caducidad es anterior a la de entrada. Revísala.";
    }
    if (paso === 2) {
      if (Number.isNaN(aNumero(f.temp_entrada))) return "La temperatura no es un número.";
      if (Number.isNaN(precio) || precio < 0) return "El precio no es válido.";
    }
    return "";
  }
  function siguiente() {
    const e = validarPaso();
    setError(e);
    if (!e) { setPaso((p) => p + 1); window.scrollTo(0, 0); }
  }

  async function guardar() {
    setGuardando(true);
    setError("");
    try {
      const enviar = editar ? (cuerpo) => api.patch(`/recepciones/${id}`, cuerpo) : (cuerpo) => api.post("/recepciones", cuerpo);
      const { recepcion } = await enviar({
        fecha: f.fecha, producto_id: f.producto.id, marca_id: f.marca_id, proveedor_id: f.proveedor_id,
        num_lote: f.num_lote.trim(), caducidad: f.caducidad || null, factura: f.factura.trim(),
        temp_entrada: aNumero(f.temp_entrada), estado_entrada: f.estado_entrada,
        cantidad, bultos: aNumero(f.bultos),
        precio_total: precioTotal != null ? Math.round(precioTotal * 100) / 100 : null,
        control_envase: f.control_envase, control_etiquetado: f.control_etiquetado, control_transporte: f.control_transporte,
        observaciones: f.observaciones.trim(),
      });
      toast(editar ? "Cambios guardados" : "Entrada registrada");
      window.location.hash = `/entradas/${recepcion.id}`;
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  }

  if (!productos) {
    return (
      <>
        <Cabecera titulo={editar ? "Editar entrada" : "Nueva entrada"} volver={editar ? `/entradas/${id}` : "/entradas"} />
        <main className="contenido">{error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />}</main>
      </>
    );
  }

  return (
    <>
      <Cabecera titulo={editar ? "Editar entrada" : "Nueva entrada"} volver={editar ? `/entradas/${id}` : paso === 0 ? "/entradas" : undefined} />
      <main className="contenido">
        <div className="pasos" aria-hidden>{PASOS.map((p, i) => <span key={p} className={i <= paso ? "hecho" : ""} />)}</div>
        <div className="paso-titulo">
          <span className="suave pequeno">Paso {paso + 1} de {PASOS.length}</span>
          <h2>{PASOS[paso]}</h2>
        </div>

        {paso === 0 && <PasoProducto productos={productos} setProductos={setProductos} onElegir={elegirProducto} />}
        {paso === 1 && <PasoLote f={f} cambiar={cambiar} proveedores={proveedores} setProveedores={setProveedores} setProductos={setProductos} onCambiarProducto={() => { setError(""); setPaso(0); }} />}
        {paso === 2 && <PasoControl f={f} cambiar={cambiar} precioUnidad={precioUnidad} precioTotal={precioTotal} />}
        {paso === 3 && <PasoRevisar f={f} proveedores={proveedores} irA={setPaso} precioUnidad={precioUnidad} precioTotal={precioTotal} />}

        {error && <Aviso tipo="error">{error}</Aviso>}
      </main>

      {paso > 0 && (
        <div className="accion-fija">
          <div className="fila">
            <button className="boton grande" onClick={() => { setError(""); setPaso((p) => p - 1); }}>Atrás</button>
            {paso < 3 ? (
              <button className="boton principal grande" style={{ flex: 1 }} onClick={siguiente}>Siguiente <ChevronRight size={22} aria-hidden /></button>
            ) : (
              <button className="boton principal grande" style={{ flex: 1 }} onClick={guardar} disabled={guardando}>
                <Check size={22} aria-hidden /> {guardando ? "Guardando…" : editar ? "Guardar cambios" : "Guardar entrada"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function PasoProducto({ productos, setProductos, onElegir }) {
  const [q, setQ] = useState("");
  const [nuevo, setNuevo] = useState(null); // nombre del producto a crear
  const [unidad, setUnidad] = useState("kg");
  const [conservacion, setConservacion] = useState("ambiente");
  const [error, setError] = useState("");
  const opciones = useMemo(
    () => productos.map((p) => ({ id: p.id, texto: p.nombre, detalle: [p.unidad_medida, p.marcas.map((m) => m.nombre).join(", ")].filter(Boolean).join(" · "), p })),
    [productos]
  );

  async function crear() {
    setError("");
    try {
      const { producto } = await api.post("/catalogo/productos", { nombre: nuevo, unidad_medida: unidad, conservacion });
      setProductos((l) => [...l, producto].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
      onElegir(producto);
    } catch (e) { setError(e.message); }
  }

  if (nuevo) {
    return (
      <div className="pila">
        <div className="panel"><strong>Producto nuevo: {nuevo}</strong><p className="suave pequeno">Se añadirá al catálogo de productos.</p></div>
        <Opciones etiqueta="Unidad de medida" valor={unidad} onCambio={setUnidad}
          opciones={["kg", "g", "l", "ml", "ud"].map((u) => ({ valor: u, texto: u }))} />
        <p className="suave pequeno">La unidad queda fijada para este producto en todas sus entradas.</p>
        <Opciones etiqueta="Conservación" valor={conservacion} onCambio={setConservacion}
          opciones={[{ valor: "ambiente", texto: "Ambiente" }, { valor: "refrigerado", texto: "Refrigerado" }, { valor: "congelado", texto: "Congelado" }]} />
        {error && <Aviso tipo="error">{error}</Aviso>}
        <button className="boton principal grande bloque" onClick={crear}>Añadir y continuar</button>
        <button className="boton bloque" onClick={() => setNuevo(null)}>Cancelar</button>
      </div>
    );
  }

  return (
    <div className="pila">
      <Autocompletar
        etiqueta="¿Qué ha llegado?"
        valor={q}
        onTexto={setQ}
        opciones={opciones}
        onElegir={(o) => onElegir(o.p)}
        onCrear={(t) => setNuevo(t)}
        textoCrear={(t) => `Añadir «${t}» como producto nuevo`}
        placeholder="Escribe las primeras letras"
        autoFocus
        mostrarTodasVacio
        maxSugerencias={12}
      />
      {productos.length === 0 && <p className="suave">El catálogo está vacío. Escribe el nombre del producto para añadirlo.</p>}
    </div>
  );
}

function PasoLote({ f, cambiar, proveedores, setProveedores, setProductos, onCambiarProducto }) {
  const marcaActual = f.producto.marcas.find((m) => m.id === f.marca_id);
  const provActual = proveedores.find((p) => p.id === f.proveedor_id);
  const [textoMarca, setTextoMarca] = useState(marcaActual?.nombre || "");
  const [textoProv, setTextoProv] = useState(provActual?.nombre || "");
  const [error, setError] = useState("");

  async function crearMarca(nombre) {
    try {
      const { marca } = await api.post(`/catalogo/productos/${f.producto.id}/marcas`, { nombre, proveedor_id: f.proveedor_id });
      const producto = { ...f.producto, marcas: [...f.producto.marcas, marca] };
      setProductos((l) => l.map((p) => (p.id === producto.id ? producto : p)));
      cambiar({ producto, marca_id: marca.id });
      setTextoMarca(marca.nombre);
    } catch (e) { setError(e.message); }
  }
  async function crearProveedor(nombre) {
    try {
      const { proveedor } = await api.post("/catalogo/proveedores", { nombre });
      setProveedores((l) => [...l, proveedor].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
      cambiar({ proveedor_id: proveedor.id });
      setTextoProv(proveedor.nombre);
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="pila">
      <div className="panel fila entre">
        <strong style={{ flex: 1 }}>{f.producto.nombre}</strong>
        <span className="distintivo">{f.producto.unidad_medida}</span>
        {onCambiarProducto && <button type="button" className="boton" onClick={onCambiarProducto}>Cambiar</button>}
      </div>

      <Autocompletar
        etiqueta="Marca (fabricante)"
        valor={textoMarca}
        onTexto={(t) => { setTextoMarca(t); if (marcaActual && t !== marcaActual.nombre) cambiar({ marca_id: null }); }}
        opciones={f.producto.marcas.map((m) => ({ id: m.id, texto: m.nombre, detalle: m.formato || undefined, m }))}
        onElegir={(o) => { cambiar({ marca_id: o.id, proveedor_id: f.proveedor_id || o.m.proveedor_id || null }); setTextoMarca(o.texto); }}
        onCrear={crearMarca}
        textoCrear={(t) => `Añadir la marca «${t}»`}
        placeholder="Marca del envase"
        mostrarTodasVacio
      />

      <Autocompletar
        etiqueta="Proveedor"
        valor={textoProv}
        onTexto={(t) => { setTextoProv(t); if (provActual && t !== provActual.nombre) cambiar({ proveedor_id: null }); }}
        opciones={proveedores.map((p) => ({ id: p.id, texto: p.nombre }))}
        onElegir={(o) => { cambiar({ proveedor_id: o.id }); setTextoProv(o.texto); }}
        onCrear={crearProveedor}
        textoCrear={(t) => `Añadir el proveedor «${t}»`}
        placeholder="Quién lo entrega"
      />

      <Campo etiqueta="Nº de lote" id="lote" ayuda="Tal como aparece en el envase o el albarán.">
        <input id="lote" className="entrada grande" autoCapitalize="characters" autoComplete="off" value={f.num_lote} onChange={(e) => cambiar({ num_lote: e.target.value })} />
      </Campo>

      <div className="dos-columnas">
        <Campo etiqueta={`Cantidad (${f.producto.unidad_medida})`} id="cant">
          <input id="cant" className="entrada grande" inputMode="decimal" autoComplete="off" placeholder="0" value={f.cantidad} onChange={(e) => cambiar({ cantidad: e.target.value })} />
        </Campo>
        <Campo etiqueta="Bultos" id="bultos" ayuda="Cajas o paquetes">
          <input id="bultos" className="entrada grande" inputMode="numeric" autoComplete="off" placeholder="—" value={f.bultos} onChange={(e) => cambiar({ bultos: e.target.value })} />
        </Campo>
      </div>

      <div className="dos-columnas">
        <Campo etiqueta="Caducidad" id="cad">
          <input id="cad" className="entrada" type="date" value={f.caducidad} onChange={(e) => cambiar({ caducidad: e.target.value })} />
        </Campo>
        <Campo etiqueta="Fecha de entrada" id="fe">
          <input id="fe" className="entrada" type="date" value={f.fecha} max={hoyISO()} onChange={(e) => cambiar({ fecha: e.target.value })} />
        </Campo>
      </div>

      <Campo etiqueta="Factura o albarán" id="fac">
        <input id="fac" className="entrada" autoComplete="off" value={f.factura} onChange={(e) => cambiar({ factura: e.target.value })} />
      </Campo>
      {error && <Aviso tipo="error">{error}</Aviso>}
    </div>
  );
}

function SiNo({ etiqueta, valor, onCambio }) {
  return (
    <div className="control-fila">
      <span style={{ fontWeight: 700 }}>{etiqueta}</span>
      <div className="si-no" role="radiogroup" aria-label={etiqueta}>
        <button type="button" role="radio" aria-checked={valor === true} className="opcion verde" onClick={() => onCambio(true)}>Correcto</button>
        <button type="button" role="radio" aria-checked={valor === false} className="opcion rojo" onClick={() => onCambio(false)}>Incorrecto</button>
      </div>
    </div>
  );
}

function PasoControl({ f, cambiar, precioUnidad, precioTotal }) {
  const limite = LIMITE_TEMP[f.producto.conservacion];
  const temp = aNumero(f.temp_entrada);
  const fueraTemp = limite && temp != null && !Number.isNaN(temp) && temp > limite.max;
  const algunMal = [f.control_envase, f.control_etiquetado, f.control_transporte].includes(false) || fueraTemp;
  const u = f.producto.unidad_medida;

  return (
    <div className="pila">
      <div className="panel pila">
        <SiNo etiqueta="Envase íntegro y limpio" valor={f.control_envase} onCambio={(v) => cambiar({ control_envase: v })} />
        <SiNo etiqueta="Etiquetado correcto y legible" valor={f.control_etiquetado} onCambio={(v) => cambiar({ control_etiquetado: v })} />
        <SiNo etiqueta="Transporte adecuado (vehículo limpio, temperatura)" valor={f.control_transporte} onCambio={(v) => cambiar({ control_transporte: v })} />
      </div>

      <Campo etiqueta="Temperatura de entrada (°C)" id="temp" ayuda={limite ? limite.texto : "Para productos refrigerados o congelados."}>
        <input id="temp" className="entrada grande" inputMode="decimal" autoComplete="off" placeholder="—" value={f.temp_entrada} onChange={(e) => cambiar({ temp_entrada: e.target.value })} />
      </Campo>
      {fueraTemp && <Aviso tipo="error">La temperatura supera el máximo para un producto {f.producto.conservacion}. Valora rechazar la mercancía o anota la incidencia.</Aviso>}

      <Opciones
        etiqueta="Estado de la mercancía"
        anchas
        valor={f.estado_entrada}
        onCambio={(v) => cambiar({ estado_entrada: v })}
        opciones={[
          { valor: "conforme", texto: "Conforme", desc: "Se acepta sin incidencias", tono: "verde" },
          { valor: "conforme_con_incidencia", texto: "Conforme con incidencia", desc: "Se acepta, pero hay algo que anotar" },
          { valor: "no_conforme", texto: "No conforme", desc: "Se rechaza o se aparta", tono: "rojo" },
        ]}
      />
      {algunMal && f.estado_entrada === "conforme" && (
        <Aviso><AlertTriangle size={18} aria-hidden style={{ verticalAlign: "-3px" }} /> Hay controles incorrectos: revisa si la entrada es realmente conforme.</Aviso>
      )}

      <div className="campo">
        <span style={{ fontWeight: 700 }}>Precio sin impuestos</span>
        <div className="opciones" role="radiogroup" aria-label="Cómo indicas el precio">
          <button type="button" role="radio" className="opcion" aria-checked={f.modoPrecio === "unidad"} onClick={() => cambiar({ modoPrecio: "unidad" })}>€ / {u}</button>
          <button type="button" role="radio" className="opcion" aria-checked={f.modoPrecio === "total"} onClick={() => cambiar({ modoPrecio: "total" })}>Total €</button>
        </div>
        <input className="entrada" inputMode="decimal" autoComplete="off" aria-label="Precio" value={f.precio} onChange={(e) => cambiar({ precio: e.target.value })} />
        {precioUnidad != null && !Number.isNaN(precioUnidad) && (
          <span className="ayuda">{euros(precioUnidad)} / {u} · total {euros(precioTotal)}</span>
        )}
      </div>

      <Campo etiqueta="Observaciones" id="obs">
        <textarea id="obs" className="entrada" value={f.observaciones} onChange={(e) => cambiar({ observaciones: e.target.value })} />
      </Campo>
    </div>
  );
}

const ESTADOS = { conforme: "Conforme", conforme_con_incidencia: "Conforme con incidencia", no_conforme: "No conforme" };
const bien = (v) => (v === true ? "Correcto" : v === false ? "Incorrecto" : "—");

function PasoRevisar({ f, proveedores, irA, precioUnidad, precioTotal }) {
  const marca = f.producto.marcas.find((m) => m.id === f.marca_id);
  const prov = proveedores.find((p) => p.id === f.proveedor_id);
  const u = f.producto.unidad_medida;
  const fila = (etq, valor, paso) => (
    <>
      <dt>{etq}</dt>
      <dd className="fila entre">
        <span>{valor || "—"}</span>
        <button className="boton-icono" aria-label={`Cambiar ${etq.toLowerCase()}`} onClick={() => irA(paso)} style={{ width: 36, height: 36 }}><ChevronRight size={18} /></button>
      </dd>
    </>
  );
  return (
    <dl className="ficha panel">
      {fila("Producto", f.producto.nombre, 0)}
      {fila("Marca", marca?.nombre, 1)}
      {fila("Proveedor", prov?.nombre, 1)}
      {fila("Nº de lote", f.num_lote, 1)}
      {fila("Cantidad", `${num(aNumero(f.cantidad))} ${u}${f.bultos ? ` · ${f.bultos} bultos` : ""}`, 1)}
      {fila("Caducidad", f.caducidad && fecha(f.caducidad), 1)}
      {fila("Entrada", fecha(f.fecha), 1)}
      {fila("Factura", f.factura, 1)}
      {fila("Envase", bien(f.control_envase), 2)}
      {fila("Etiquetado", bien(f.control_etiquetado), 2)}
      {fila("Transporte", bien(f.control_transporte), 2)}
      {fila("Temperatura", f.temp_entrada && `${f.temp_entrada} °C`, 2)}
      {fila("Estado", ESTADOS[f.estado_entrada], 2)}
      {fila("Precio", precioUnidad != null && !Number.isNaN(precioUnidad) ? `${euros(precioUnidad)} / ${u} · total ${euros(precioTotal)}` : null, 2)}
    </dl>
  );
}
