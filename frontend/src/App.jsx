import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Home, Truck, CookingPot, Menu } from "lucide-react";
import { api, sesion } from "./api.js";
import { SesionContext, ProveedorToast, Cargando } from "./componentes/ui.jsx";
import Login from "./pantallas/Login.jsx";
import CambiarPassword from "./pantallas/CambiarPassword.jsx";
import Inicio from "./pantallas/Inicio.jsx";
import Recepciones from "./pantallas/Recepciones.jsx";
import NuevaRecepcion from "./pantallas/NuevaRecepcion.jsx";
import RecepcionDetalle from "./pantallas/RecepcionDetalle.jsx";
import Elaboracion from "./pantallas/Elaboracion.jsx";
import Mas from "./pantallas/Mas.jsx";
import Equipo from "./pantallas/Equipo.jsx";
import MiObrador from "./pantallas/MiObrador.jsx";

// Navegación por #ruta: funciona con el botón atrás del móvil y al recargar.
function useRuta() {
  const leer = () => (window.location.hash.replace(/^#/, "") || "/inicio").split("?")[0];
  const [ruta, setRuta] = useState(leer);
  useEffect(() => {
    const f = () => {
      setRuta(leer());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return ruta;
}
export const ir = (ruta) => {
  window.location.hash = ruta;
};

const SECCIONES = [
  { id: "inicio", texto: "Inicio", icono: Home },
  { id: "recepcion", texto: "Recepción", icono: Truck },
  { id: "elaboracion", texto: "Elaboración", icono: CookingPot },
  { id: "mas", texto: "Más", icono: Menu },
];

export default function App() {
  const [estado, setEstado] = useState({ cargando: true, datos: null });

  const cargarSesion = useCallback(async () => {
    if (!sesion.get()) return setEstado({ cargando: false, datos: null });
    try {
      const datos = await api.get("/auth/me");
      setEstado({ cargando: false, datos });
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

  return (
    <SesionContext.Provider value={valor}>
      <ProveedorToast>
        {valor.usuario.debe_cambiar_password ? <CambiarPassword obligatorio onHecho={cargarSesion} /> : <Shell />}
      </ProveedorToast>
    </SesionContext.Provider>
  );
}

function Shell() {
  const ruta = useRuta();
  const partes = ruta.split("/").filter(Boolean);
  const seccion = partes[0] || "inicio";

  let pantalla;
  if (seccion === "recepcion" && partes[1] === "nueva") pantalla = <NuevaRecepcion />;
  else if (seccion === "recepcion" && partes[1]) pantalla = <RecepcionDetalle id={partes[1]} />;
  else if (seccion === "recepcion") pantalla = <Recepciones />;
  else if (seccion === "elaboracion") pantalla = <Elaboracion />;
  else if (seccion === "mas" && partes[1] === "equipo") pantalla = <Equipo />;
  else if (seccion === "mas" && partes[1] === "obrador") pantalla = <MiObrador />;
  else if (seccion === "mas" && partes[1] === "cuenta") pantalla = <CambiarPassword />;
  else if (seccion === "mas") pantalla = <Mas />;
  else pantalla = <Inicio />;

  return (
    <div className="app">
      {pantalla}
      <nav className="nav" aria-label="Secciones">
        {SECCIONES.map(({ id, texto, icono: Icono }) => (
          <button key={id} aria-current={seccion === id ? "page" : undefined} onClick={() => ir(`/${id}`)}>
            <Icono size={24} aria-hidden />
            {texto}
          </button>
        ))}
      </nav>
    </div>
  );
}
