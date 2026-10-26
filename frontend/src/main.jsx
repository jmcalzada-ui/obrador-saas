import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { Cargando } from "./componentes/ui.jsx";
import "./estilos.css";

// Tres puertas de entrada en la misma web:
//   /admin  → back office privado de la plataforma
//   /alta   → alta de un obrador nuevo con pago
//   /       → la app de cada obrador
const AdminApp = lazy(() => import("./admin/AdminApp.jsx"));
const Alta = lazy(() => import("./pantallas/Alta.jsx"));

const ruta = window.location.pathname;
const Raiz = ruta.startsWith("/admin") ? AdminApp : ruta.startsWith("/alta") ? Alta : App;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Suspense fallback={<Cargando />}>
      <Raiz />
    </Suspense>
  </React.StrictMode>
);
