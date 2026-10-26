import React from "react";
import { Users, Store, UserRound, LogOut, ChevronRight } from "lucide-react";
import { useSesion, NOMBRE_ROL } from "../componentes/ui.jsx";
import Cabecera from "../componentes/Cabecera.jsx";

export default function Mas() {
  const { usuario, puede, salir } = useSesion();
  const entradas = [
    puede("usuarios") && { ruta: "/mas/equipo", icono: Users, texto: "Equipo", desc: "Usuarios y plazas del plan" },
    { ruta: "/mas/obrador", icono: Store, texto: "Mi obrador", desc: puede("obrador") ? "Datos del obrador y plan" : "Datos del obrador" },
    { ruta: "/mas/cuenta", icono: UserRound, texto: "Mi cuenta", desc: "Contraseña" },
  ].filter(Boolean);

  return (
    <>
      <Cabecera titulo="Más" />
      <main className="contenido">
        <div className="panel">
          <strong>{usuario.nombre}</strong>
          <div className="suave">{NOMBRE_ROL[usuario.rol]} · {usuario.email}</div>
        </div>
        <ul className="lista">
          {entradas.map(({ ruta, icono: Icono, texto, desc }) => (
            <li key={ruta}>
              <button className="item" onClick={() => (window.location.hash = ruta)}>
                <Icono size={22} aria-hidden className="suave" />
                <span className="principal">
                  <strong>{texto}</strong>
                  <span className="suave pequeno">{desc}</span>
                </span>
                <ChevronRight size={20} aria-hidden className="suave" />
              </button>
            </li>
          ))}
        </ul>
        <button className="boton bloque" onClick={salir}><LogOut size={20} aria-hidden /> Cerrar sesión</button>
      </main>
    </>
  );
}
