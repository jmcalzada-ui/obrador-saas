import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { Cargando } from "./componentes/ui.jsx";
// Tipografías incluidas en la app (sin depender de Google Fonts).
import "@fontsource-variable/instrument-sans/index.css";
import "@fontsource-variable/source-serif-4/index.css";
import "./estilos.css";
import { aplicarTema, temaGuardado } from "./componentes/Tema.jsx";

// Los colores del obrador de este dispositivo, ya desde la pantalla de acceso.
if (temaGuardado() && !/^\/(admin|alta|legal)/.test(window.location.pathname)) aplicarTema(temaGuardado());

// Tres puertas de entrada en la misma web:
//   /admin  → back office privado de la plataforma
//   /alta   → alta de un obrador nuevo con pago
//   /legal  → aviso legal, condiciones, privacidad, encargo del tratamiento y cookies
//   /       → la app de cada obrador
const AdminApp = lazy(() => import("./admin/AdminApp.jsx"));
const Alta = lazy(() => import("./pantallas/Alta.jsx"));
const Legal = lazy(() => import("./pantallas/Legal.jsx"));

const ruta = window.location.pathname;
const Raiz = ruta.startsWith("/admin") ? AdminApp : ruta.startsWith("/alta") ? Alta : ruta.startsWith("/legal") ? Legal : App;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Suspense fallback={<Cargando />}>
      <Raiz />
    </Suspense>
  </React.StrictMode>
);
