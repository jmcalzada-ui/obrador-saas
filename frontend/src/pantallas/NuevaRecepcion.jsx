import React, { useEffect, useMemo, useState } from "react";
import { Search, Plus, Check, ChevronRight } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Campo, Cargando, Opciones, useToast, hoyISO, aNumero, num, fecha, euros, UNIDADES } from "../componentes/ui.jsx";
import Cabecera from "../componentes/Cabecera.jsx";

const normal = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const PASOS = ["Producto", "Lote y cantidad", "Control de entrada", "Revisar"];

export default function NuevaRecepcion() {
  const toast = useToast();
  const [paso, setPaso] = useState(0);
  const [productos, setProductos] = useState(null);
  const [proveedores, setProveedores] = useState([]);
  const [recientes, setRecientes] = useState([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [f, setF] = useState({
    producto: null, marca_id: null, proveedor_id: null,
    num_lote: "", cantidad: "", unidad: "kg", caducidad: "", factura: "",
    fecha: hoyISO(), estado_entrada: "conforme", temp_entrada: "", precio_total: "", observaciones: "",
  });
  const cambiar = (patch) => setF((x) => ({ ...x, ...patch }));

  useEffect(() => {
    Promise.all([api.get("/catalogo/productos"), api.get("/catalogo/proveedores"), api.get("/recepciones?limite=200")])
      .then(([p, pr, r]) => {
        setProductos(p.productos.filter((x) => x.tipo === "materia_prima" && x.activo));
        setProveedores(pr.proveedores.filter((x) => x.activo));
        setRecientes(r.recepciones);
      })
      .catch((e) => setError(e.message));
  }, []);

  // Al elegir producto, se rellenan marca, proveedor y unidad de la última vez.
  function elegirProducto(p) {
    const ultima = recientes.find((r) => r.producto_id === p.id);
    cambiar({
      producto: p,
      marca_id: ultima?.marca_id ?? (p.marcas.length === 1 ? p.marcas[0].id : null),
      proveedor_id: ultima?.proveedor_id ?? f.proveedor_id,
      unidad: ultima?.unidad || p.unidad_medida,
    });
    setPaso(1);
  }

  function validarPaso() {
    if (paso === 1) {
      const c = aNumero(f.cantidad);
      if (!(c > 0)) return "Indica la cantidad recibida.";
      if (f.caducidad && f.caducidad < f.fecha) return "La fecha de caducidad es anterior a la de recepción. Revísala.";
    }
    if (paso === 2) {
      const t = aNumero(f.temp_entrada);
      if (Number.isNaN(t)) return "La temperatura no es un número.";
      const pr = aNumero(f.precio_total);
      if (Number.isNaN(pr) || pr < 0) return "El importe no es válido.";
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
      const { recepcion } = await api.post("/recepciones", {
        fecha: f.fecha,
        producto_id: f.producto.id,
        marca_id: f.marca_id,
        proveedor_id: f.proveedor_id,
        num_lote: f.num_lote.trim(),
        caducidad: f.caducidad || null,
        factura: f.factura.trim(),
        temp_entrada: aNumero(f.temp_entrada),
        estado_entrada: f.estado_entrada,
        cantidad: aNumero(f.cantidad),
        unidad: f.unidad,
        precio_total: aNumero(f.precio_total),
        observaciones: f.observaciones.trim(),
      });
      toast("Recepción registrada");
      window.location.hash = `/recepcion/${recepcion.id}`;
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  }

  if (!productos) {
    return (
      <>
        <Cabecera titulo="Nueva recepción" volver="/recepcion" />
        <main className="contenido">{error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />}</main>
      </>
    );
  }

  return (
    <>
      <Cabecera titulo="Nueva recepción" volver={paso === 0 ? "/recepcion" : undefined} accion={null} />
      <main className="contenido">
        <div className="pasos" aria-hidden>
          {PASOS.map((p, i) => <span key={p} className={i <= paso ? "hecho" : ""} />)}
        </div>
        <div className="paso-titulo">
          <span className="suave pequeno">Paso {paso + 1} de {PASOS.length}</span>
          <h2>{PASOS[paso]}</h2>
        </div>

        {paso === 0 && (
          <PasoProducto productos={productos} setProductos={setProductos} onElegir={elegirProducto} />
        )}
        {paso === 1 && (
          <PasoLote f={f} cambiar={cambiar} proveedores={proveedores} setProveedores={setProveedores} setProductos={setProductos} />
        )}
        {paso === 2 && <PasoControl f={f} cambiar={cambiar} />}
        {paso === 3 && <PasoRevisar f={f} proveedores={proveedores} irA={setPaso} />}

        {error && <Aviso tipo="error">{error}</Aviso>}
      </main>

      {paso > 0 && (
        <div className="accion-fija">
          <div className="fila">
            <button className="boton grande" onClick={() => { setError(""); setPaso((p) => p - 1); }}>Atrás</button>
            {paso < 3 ? (
              <button className="boton principal grande" style={{ flex: 1 }} onClick={siguiente}>
                Siguiente <ChevronRight size={22} aria-hidden />
              </button>
            ) : (
              <button className="boton principal grande" style={{ flex: 1 }} onClick={guardar} disabled={guardando}>
                <Check size={22} aria-hidden /> {guardando ? "Guardando…" : "Guardar recepción"}
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
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const filtrados = useMemo(() => {
    const n = normal(q);
    return n ? productos.filter((p) => normal(p.nombre).includes(n)) : productos;
  }, [q, productos]);
  const existeExacto = productos.some((p) => normal(p.nombre) === normal(q));

  async function crear() {
    setCreando(true);
    setError("");
    try {
      const { producto } = await api.post("/catalogo/productos", { nombre: q.trim() });
      setProductos((l) => [...l, producto].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
      onElegir(producto);
    } catch (e) {
      setError(e.message);
      setCreando(false);
    }
  }

  return (
    <div className="pila">
      <div className="buscador">
        <Search size={20} aria-hidden />
        <input
          className="entrada" type="search" autoFocus placeholder="¿Qué ha llegado?"
          aria-label="Buscar producto" value={q} onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {q.trim() && !existeExacto && (
        <button className="boton bloque" onClick={crear} disabled={creando}>
          <Plus size={20} aria-hidden /> Añadir «{q.trim()}» al catálogo
        </button>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
      {filtrados.length > 0 ? (
        <ul className="lista">
          {filtrados.map((p) => (
            <li key={p.id}>
              <button className="item" onClick={() => onElegir(p)}>
                <span className="principal">
                  <strong>{p.nombre}</strong>
                  {p.marcas.length > 0 && <span className="suave pequeno">{p.marcas.map((m) => m.nombre).join(", ")}</span>}
                </span>
                <ChevronRight size={20} aria-hidden className="suave" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !q.trim() && <p className="suave">El catálogo está vacío. Escribe el nombre del producto para añadirlo.</p>
      )}
    </div>
  );
}

function PasoLote({ f, cambiar, proveedores, setProveedores, setProductos }) {
  const [nuevaMarca, setNuevaMarca] = useState("");
  const [nuevoProv, setNuevoProv] = useState("");
  const [error, setError] = useState("");

  async function crearMarca() {
    try {
      const { marca } = await api.post(`/catalogo/productos/${f.producto.id}/marcas`, { nombre: nuevaMarca.trim() });
      const producto = { ...f.producto, marcas: [...f.producto.marcas, marca] };
      setProductos((l) => l.map((p) => (p.id === producto.id ? producto : p)));
      cambiar({ producto, marca_id: marca.id });
      setNuevaMarca("");
    } catch (e) { setError(e.message); }
  }
  async function crearProveedor() {
    try {
      const { proveedor } = await api.post("/catalogo/proveedores", { nombre: nuevoProv.trim() });
      setProveedores((l) => [...l, proveedor].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
      cambiar({ proveedor_id: proveedor.id });
      setNuevoProv("");
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="pila">
      <div className="panel"><strong>{f.producto.nombre}</strong></div>

      {f.producto.marcas.length > 0 && (
        <Opciones
          etiqueta="Marca"
          valor={f.marca_id}
          onCambio={(v) => cambiar({ marca_id: v === f.marca_id ? null : v })}
          opciones={f.producto.marcas.map((m) => ({ valor: m.id, texto: m.nombre }))}
        />
      )}
      <div className="fila">
        <input className="entrada" placeholder={f.producto.marcas.length ? "Otra marca" : "Marca (opcional)"} aria-label="Nueva marca"
          value={nuevaMarca} onChange={(e) => setNuevaMarca(e.target.value)} />
        <button className="boton" onClick={crearMarca} disabled={!nuevaMarca.trim()}>Añadir</button>
      </div>

      <Campo etiqueta="Nº de lote" id="lote" ayuda="Tal como aparece en el envase o el albarán.">
        <input id="lote" className="entrada grande" autoCapitalize="characters" autoComplete="off"
          value={f.num_lote} onChange={(e) => cambiar({ num_lote: e.target.value })} />
      </Campo>

      <Campo etiqueta="Cantidad recibida" id="cant">
        <input id="cant" className="entrada grande" inputMode="decimal" autoComplete="off" placeholder="0"
          value={f.cantidad} onChange={(e) => cambiar({ cantidad: e.target.value })} />
      </Campo>
      <Opciones etiqueta="Unidad" valor={f.unidad} onCambio={(v) => cambiar({ unidad: v })}
        opciones={UNIDADES.map((u) => ({ valor: u, texto: u }))} />

      <div className="dos-columnas">
        <Campo etiqueta="Caducidad" id="cad">
          <input id="cad" className="entrada" type="date" value={f.caducidad} onChange={(e) => cambiar({ caducidad: e.target.value })} />
        </Campo>
        <Campo etiqueta="Fecha de entrada" id="fe">
          <input id="fe" className="entrada" type="date" value={f.fecha} max={hoyISO()} onChange={(e) => cambiar({ fecha: e.target.value })} />
        </Campo>
      </div>

      <Campo etiqueta="Proveedor" id="prov">
        <select id="prov" className="entrada" value={f.proveedor_id || ""} onChange={(e) => cambiar({ proveedor_id: e.target.value || null })}>
          <option value="">Sin indicar</option>
          {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </Campo>
      <div className="fila">
        <input className="entrada" placeholder="Nuevo proveedor" aria-label="Nuevo proveedor"
          value={nuevoProv} onChange={(e) => setNuevoProv(e.target.value)} />
        <button className="boton" onClick={crearProveedor} disabled={!nuevoProv.trim()}>Añadir</button>
      </div>

      <Campo etiqueta="Factura o albarán" id="fac">
        <input id="fac" className="entrada" autoComplete="off" value={f.factura} onChange={(e) => cambiar({ factura: e.target.value })} />
      </Campo>
      {error && <Aviso tipo="error">{error}</Aviso>}
    </div>
  );
}

function PasoControl({ f, cambiar }) {
  return (
    <div className="pila">
      <Opciones
        etiqueta="Estado de la mercancía"
        anchas
        valor={f.estado_entrada}
        onCambio={(v) => cambiar({ estado_entrada: v })}
        opciones={[
          { valor: "conforme", texto: "Conforme", desc: "Envase, etiquetado y temperatura correctos", tono: "verde" },
          { valor: "conforme_con_incidencia", texto: "Conforme con incidencia", desc: "Se acepta, pero hay algo que anotar" },
          { valor: "no_conforme", texto: "No conforme", desc: "Se rechaza o se aparta", tono: "rojo" },
        ]}
      />
      <Campo etiqueta="Temperatura de entrada (°C)" id="temp" ayuda="Para refrigerados y congelados.">
        <input id="temp" className="entrada grande" inputMode="decimal" autoComplete="off" placeholder="—"
          value={f.temp_entrada} onChange={(e) => cambiar({ temp_entrada: e.target.value })} />
      </Campo>
      <Campo etiqueta="Importe total sin impuestos (€)" id="precio" ayuda="Opcional. Sirve para conocer el precio por unidad.">
        <input id="precio" className="entrada" inputMode="decimal" autoComplete="off"
          value={f.precio_total} onChange={(e) => cambiar({ precio_total: e.target.value })} />
      </Campo>
      <Campo etiqueta="Observaciones" id="obs">
        <textarea id="obs" className="entrada" value={f.observaciones} onChange={(e) => cambiar({ observaciones: e.target.value })} />
      </Campo>
    </div>
  );
}

const ESTADOS = { conforme: "Conforme", conforme_con_incidencia: "Conforme con incidencia", no_conforme: "No conforme" };

function PasoRevisar({ f, proveedores, irA }) {
  const marca = f.producto.marcas.find((m) => m.id === f.marca_id);
  const prov = proveedores.find((p) => p.id === f.proveedor_id);
  const fila = (etq, valor, paso) => (
    <>
      <dt>{etq}</dt>
      <dd className="fila entre">
        <span>{valor || "—"}</span>
        <button className="boton-icono" aria-label={`Cambiar ${etq.toLowerCase()}`} onClick={() => irA(paso)} style={{ width: 36, height: 36 }}>
          <ChevronRight size={18} />
        </button>
      </dd>
    </>
  );
  return (
    <dl className="ficha panel">
      {fila("Producto", f.producto.nombre, 0)}
      {fila("Marca", marca?.nombre, 1)}
      {fila("Nº de lote", f.num_lote, 1)}
      {fila("Cantidad", `${num(aNumero(f.cantidad))} ${f.unidad}`, 1)}
      {fila("Caducidad", f.caducidad && fecha(f.caducidad), 1)}
      {fila("Entrada", fecha(f.fecha), 1)}
      {fila("Proveedor", prov?.nombre, 1)}
      {fila("Factura", f.factura, 1)}
      {fila("Estado", ESTADOS[f.estado_entrada], 2)}
      {fila("Temperatura", f.temp_entrada && `${f.temp_entrada} °C`, 2)}
      {fila("Importe", f.precio_total && euros(aNumero(f.precio_total)), 2)}
    </dl>
  );
}
