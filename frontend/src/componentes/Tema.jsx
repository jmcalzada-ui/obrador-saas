import React, { useState } from "react";
import { Check } from "lucide-react";
import { api } from "../api.js";
import { Aviso, useSesion, useToast } from "./ui.jsx";

// Patrones de color: principal, claro y un tono intermedio para la muestra.
export const TEMAS = [
  { id: "azul", nombre: "Azul", colores: ["#1e4e8c", "#e3ecf7", "#bcd0ea"] },
  { id: "verde", nombre: "Verde", colores: ["#1f6b45", "#e1f0e7", "#b5d8c3"] },
  { id: "granate", nombre: "Granate", colores: ["#9b2335", "#f7e3e6", "#e6b8bf"] },
  { id: "morado", nombre: "Morado", colores: ["#5b3a8c", "#ece5f6", "#cfc0e6"] },
  { id: "mostaza", nombre: "Mostaza", colores: ["#8a6100", "#f8eed3", "#e6d09a"] },
  { id: "grafito", nombre: "Grafito", colores: ["#374151", "#e8eaee", "#c7ccd4"] },
];
const CLAVE = "obrador-tema";

/** Aplica el tema en toda la página (y lo recuerda en el dispositivo para la pantalla de acceso). */
export function aplicarTema(id) {
  const tema = TEMAS.find((t) => t.id === id) || TEMAS[0];
  document.documentElement.dataset.tema = tema.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tema.colores[0]);
  try { localStorage.setItem(CLAVE, tema.id); } catch { /* modo privado */ }
}
export function temaGuardado() {
  try { return localStorage.getItem(CLAVE); } catch { return null; }
}

/** Selector de colores de la app (solo el gestor; afecta a todo el equipo). */
export default function SelectorTema() {
  const { puede, obrador, recargar } = useSesion();
  const toast = useToast();
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(null);
  if (!puede("obrador")) return null;
  const actual = obrador.tema || "azul";

  async function elegir(id) {
    if (id === actual) return;
    setError("");
    setGuardando(id);
    aplicarTema(id); // se ve al momento
    try { await api.patch("/obrador", { tema: id }); await recargar(); toast("Colores cambiados para todo el equipo"); }
    catch (e) { aplicarTema(actual); setError(e.message); }
    finally { setGuardando(null); }
  }

  return (
    <section className="panel pila">
      <h2>Colores de la app</h2>
      <p className="suave pequeno">Elige el patrón que mejor vaya con tu empresa. Cambia la app para todo el equipo.</p>
      <div className="temas" role="radiogroup" aria-label="Colores de la app">
        {TEMAS.map((t) => (
          <button key={t.id} type="button" role="radio" className="tema" aria-checked={actual === t.id} disabled={Boolean(guardando)} onClick={() => elegir(t.id)}>
            <span className="muestras" aria-hidden>{t.colores.map((c) => <i key={c} style={{ background: c }} />)}</span>
            <span>{t.nombre} {actual === t.id && <Check size={14} aria-hidden style={{ verticalAlign: "-2px" }} />}</span>
          </button>
        ))}
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
    </section>
  );
}
