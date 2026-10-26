import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

// ---------- Sesión: usuario, obrador y permisos ----------
export const SesionContext = createContext(null);
export const useSesion = () => useContext(SesionContext);

// ---------- Avisos breves ----------
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);
export function ProveedorToast({ children }) {
  const [msg, setMsg] = useState(null);
  const mostrar = useCallback((texto) => setMsg({ texto, k: Date.now() }), []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2800);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastContext.Provider value={mostrar}>
      {children}
      {msg && (
        <div className="toast" role="status" key={msg.k}>
          <CheckCircle2 size={20} aria-hidden /> {msg.texto}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function Cargando({ texto = "Cargando…" }) {
  return (
    <div className="cargando" role="status">
      <div className="giro" aria-hidden />
      <span className="oculto-visual">{texto}</span>
    </div>
  );
}

export function Aviso({ tipo = "", children }) {
  return (
    <div className={`aviso ${tipo}`} role={tipo === "error" ? "alert" : undefined}>
      {tipo === "error" && <AlertTriangle size={20} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />}
      <div>{children}</div>
    </div>
  );
}

/** Hoja inferior en móvil, diálogo centrado en escritorio. */
export function Hoja({ titulo, onCerrar, children }) {
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onCerrar?.();
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
  }, [onCerrar]);
  return (
    <div className="velo" onClick={(e) => e.target === e.currentTarget && onCerrar?.()}>
      <div className="hoja" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="fila entre">
          <h2>{titulo}</h2>
          {onCerrar && (
            <button className="boton-icono" onClick={onCerrar} aria-label="Cerrar">
              <X size={22} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Campo({ etiqueta, ayuda, id, children }) {
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      {children}
      {ayuda && <span className="ayuda">{ayuda}</span>}
    </div>
  );
}

/** Grupo de opciones grandes de una sola elección (accesible como radio). */
export function Opciones({ etiqueta, valor, onCambio, opciones, anchas = false }) {
  const idEtq = "op-" + normalizarId(etiqueta);
  return (
    <div className="campo">
      <span className="etq" id={idEtq}>{etiqueta}</span>
      <div className={`opciones ${anchas ? "anchas" : ""}`} role="radiogroup" aria-labelledby={idEtq}>
        {opciones.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={valor === o.valor}
            className={`opcion ${o.tono || ""}`}
            onClick={() => onCambio(o.valor)}
          >
            <span>{o.texto}</span>
            {o.desc && <span className="desc">{o.desc}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

const normalizarId = (t) => t.normalize("NFD").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();

// ---------- Formatos ----------
const fmtNum = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3 });
export const num = (n) => (n === null || n === undefined || n === "" ? "—" : fmtNum.format(n));
export const euros = (n) =>
  n === null || n === undefined ? "—" : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
export function fecha(iso, opciones = { day: "numeric", month: "short", year: "numeric" }) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-ES", opciones);
}
export function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function diasHasta(iso) {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(a, m - 1, d) - hoy) / 86400000);
}
/** Convierte "2,5" o "2.5" en número (teclados del móvil en español usan coma). */
export function aNumero(texto) {
  if (texto === null || texto === undefined || String(texto).trim() === "") return null;
  const n = Number(String(texto).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export const NOMBRE_ROL = {
  gestor: "Gestor",
  jefe_produccion: "Jefe de producción",
  operario: "Operario",
  observador: "Observador",
};
export const UNIDADES = ["kg", "g", "l", "ml", "ud"];
