import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Home, Truck, CookingPot, Package, Menu, CreditCard } from "lucide-react";
import { api, sesion } from "./api.js";
import { SesionContext, ProveedorToast, Cargando, Aviso, fecha } from "./componentes/ui.jsx";
import Login from "./pantallas/Login.jsx";
import CambiarPassword from "./pantallas/CambiarPassword.jsx";
import Inicio from "./pantallas/Inicio.jsx";
import Recepciones from "./pantallas/Recepciones.jsx";
import NuevaRecepcion from "./pantallas/NuevaRecepcion.jsx";
import RecepcionDetalle from "./pantallas/RecepcionDetalle.jsx";
import Produccion from "./pantallas/Produccion.jsx";
import NuevaProduccion from "./pantallas/NuevaProduccion.jsx";
import ProduccionDetalle from "./pantallas/ProduccionDetalle.jsx";
import Productos from "./pantallas/Productos.jsx";
import ProductoDetalle from "./pantallas/ProductoDetalle.jsx";
import Mas from "./pantallas/Mas.jsx";
import Equipo from "./pantallas/Equipo.jsx";
import MiObrador from "./pantallas/MiObrador.jsx";
import { useLogo } from "./componentes/Logo.jsx";

// Navegación por #ruta: funciona con el botón atrás del móvil y al recargar.
function useRuta() {
  const leer = () => (window.location.hash.replace(/^#/, "") || "/inicio").split("?")[0];
  const [ruta, setRuta] = useState(leer);
  useEffect(() => {
    const f = () => { setRuta(leer()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return ruta;
}

// "texto" se ve en el móvil (barra inferior); "largo", en el ordenador (barra lateral).
const SECCIONES = [
  { id: "inicio", texto: "Inicio", icono: Home },
  { id: "productos", texto: "Productos", icono: Package },
  { id: "entradas", texto: "Entradas", largo: "Entradas de mercancía", icono: Truck },
  { id: "produccion", texto: "Producción", icono: CookingPot },
  { id: "mas", texto: "Más", largo: "Equipo y cuenta", icono: Menu },
];

export default function App() {
  const [estado, setEstado] = useState({ cargando: true, datos: null });

  const cargarSesion = useCallback(async () => {
    if (!sesion.get()) return setEstado({ cargando: false, datos: null });
    try {
      setEstado({ cargando: false, datos: await api.get("/auth/me") });
    } catch {
      setEstado({ cargando: false, datos: null });
    }
  }, []);

  useEffect(() => {
    cargarSesion();
    const caducada = () => setEstado({ cargando: false, datos: null });
    window.addEventListener("sesion-caducada", caducada);
    return () => window.removeEventListener("sesion-caducada", caducada);
  }, [cargarSesion]);

  const salir = useCallback(() => {
    sesion.set(null);
    setEstado({ cargando: false, datos: null });
    window.location.hash = "";
  }, []);

  const valor = useMemo(() => {
    if (!estado.datos) return null;
    const { usuario, obrador } = estado.datos;
    return { usuario, obrador, puede: (p) => usuario.permisos.includes(p), recargar: cargarSesion, salir };
  }, [estado.datos, cargarSesion, salir]);

  if (estado.cargando) return <Cargando />;
  if (!valor) return <Login onEntrar={cargarSesion} />;

  let contenido;
  if (["pendiente_pago", "suspendido", "baja"].includes(valor.obrador.estado)) contenido = <CuentaBloqueada />;
  else if (valor.usuario.debe_cambiar_password) contenido = <CambiarPassword obligatorio onHecho={cargarSesion} />;
  else contenido = <Shell />;

  return (
    <SesionContext.Provider value={valor}>
      <ProveedorToast>{contenido}</ProveedorToast>
    </SesionContext.Provider>
  );
}

function Shell() {
  const { obrador } = React.useContext(SesionContext);
  const logo = useLogo();
  const ruta = useRuta();
  const partes = ruta.split("/").filter(Boolean);
  // Enlaces antiguos (#/preparados, #/intermedia, #/final) → #/produccion
  const antiguo = { preparados: "i", intermedia: "i", final: "f" }[partes[0]];
  const seccion = antiguo ? "produccion" : partes[0] || "inicio";
  let [a, b] = [partes[1], partes[2]];
  if (antiguo && a && a !== "nuevo") [a, b] = [antiguo, a];

  let pantalla;
  if (seccion === "entradas") pantalla = a === "nueva" ? <NuevaRecepcion /> : a ? <RecepcionDetalle id={a} /> : <Recepciones />;
  else if (seccion === "produccion") {
    if (a === "nueva" || a === "nuevo") pantalla = <NuevaProduccion />;
    else if ((a === "i" || a === "f") && b) pantalla = <ProduccionDetalle key={`${a}-${b}`} id={b} tipo={a === "i" ? "intermedia" : "final"} />;
    else pantalla = <Produccion />;
  }
  else if (seccion === "productos") pantalla = a ? <ProductoDetalle id={a} /> : <Productos />;
  else if (seccion === "mas" && a === "equipo") pantalla = <Equipo />;
  else if (seccion === "mas" && a === "obrador") pantalla = <MiObrador />;
  else if (seccion === "mas" && a === "cuenta") pantalla = <CambiarPassword />;
  else if (seccion === "mas") pantalla = <Mas />;
  else pantalla = <Inicio />;

  return (
    <div className="app">
      <AvisoImpago />
      {pantalla}
      <nav className="nav" aria-label="Secciones" style={{ "--secciones": SECCIONES.length }}>
        <div className={`nav-marca ${logo ? "con-logo" : ""}`} aria-hidden>
          {logo ? <img className="logo" src={logo} alt="" /> : <img src="/icono.svg" alt="" width="36" height="36" />}
          <span><strong>{logo ? obrador.nombre : "Registro de obrador"}</strong><small>{logo ? "Registro de obrador" : obrador.nombre}</small></span>
        </div>
        {SECCIONES.map(({ id, texto, largo, icono: Icono }) => (
          <button key={id} aria-current={seccion === id ? "page" : undefined} onClick={() => (window.location.hash = `/${id}`)}>
            <Icono size={24} aria-hidden />
            <span className="corto">{texto}</span>
            <span className="largo">{largo || texto}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Cobro fallido: el gestor ve el aviso con la fecha de suspensión. */
function AvisoImpago() {
  const { obrador, usuario } = React.useContext(SesionContext);
  if (obrador.estado !== "impago" || usuario.rol !== "gestor") return null;
  return (
    <div style={{ padding: "12px 16px 0", maxWidth: 720, margin: "0 auto", width: "100%" }}>
      <Aviso tipo="error">
        No hemos podido cobrar la cuota. Actualiza la forma de pago antes del {fecha(obrador.fecha_suspension)} para evitar que la cuenta quede en suspenso.{" "}
        <a href="#/mas/obrador">Actualizar forma de pago</a>
      </Aviso>
    </div>
  );
}

/** Cuenta pendiente del primer pago o en suspenso: solo el gestor llega aquí. */
function CuentaBloqueada() {
  const { obrador, usuario, salir } = React.useContext(SesionContext);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const pendiente = obrador.estado === "pendiente_pago";

  async function abrir(ruta, cuerpo) {
    setCargando(true);
    setError("");
    try {
      const { url } = await api.post(ruta, cuerpo);
      window.location.href = url;
    } catch (e) {
      setError(e.message);
      setCargando(false);
    }
  }

  return (
    <main className="bloqueo">
      <CreditCard size={40} aria-hidden className="suave" />
      <h1>{pendiente ? "Falta completar el pago" : obrador.estado === "baja" ? "Cuenta dada de baja" : "Cuenta en suspenso"}</h1>
      <p>
        {pendiente
          ? `Hola ${usuario.nombre.split(" ")[0]}. El alta de ${obrador.nombre} está hecha, pero falta el primer pago. En cuanto se cobre, la cuenta se activa sola.`
          : obrador.estado === "baja"
            ? "La suscripción de este obrador se ha cancelado. Si quieres volver, escríbenos."
            : `No se ha podido cobrar la cuota de ${obrador.nombre}. Tus datos están guardados. Actualiza la forma de pago y el acceso se reactivará automáticamente al cobrarse.`}
      </p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {pendiente && (
        <>
          <button className="boton principal grande bloque" disabled={cargando} onClick={() => abrir("/obrador/completar-pago", { metodo: "card" })}>Pagar con tarjeta</button>
          <button className="boton grande bloque" disabled={cargando} onClick={() => abrir("/obrador/completar-pago", { metodo: "sepa_debit" })}>Domiciliación bancaria</button>
        </>
      )}
      {obrador.estado === "suspendido" && (
        <button className="boton principal grande bloque" disabled={cargando} onClick={() => abrir("/obrador/portal-pago")}>Actualizar forma de pago</button>
      )}
      <button className="boton bloque" onClick={salir}>Salir</button>
    </main>
  );
}
