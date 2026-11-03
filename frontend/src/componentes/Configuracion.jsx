import React, { useState } from "react";
import { api } from "../api.js";
import { Aviso, useSesion, useToast } from "./ui.jsx";
import Cabecera from "./Cabecera.jsx";
import { SubirLogo } from "./Logo.jsx";
import SelectorTema from "./Tema.jsx";

/** Configuración del obrador (solo el gestor): qué apartados se usan. */
export function ApartadosOpcionales() {
  const { puede, obrador, recargar } = useSesion();
  const toast = useToast();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [impuesto, setImpuesto] = useState({ tipo: obrador.impuesto_tipo || "IGIC", pct: obrador.impuesto_pct != null ? String(obrador.impuesto_pct).replace(".", ",") : "" });
  if (!puede("obrador")) return null;

  async function guardarImpuesto() {
    const pct = impuesto.pct.trim() === "" ? null : Number(impuesto.pct.replace(",", "."));
    if (Number.isNaN(pct)) return setError("El porcentaje no es un número.");
    setGuardando(true);
    setError("");
    try { await api.patch("/obrador", { impuesto_tipo: impuesto.tipo, impuesto_pct: pct }); await recargar(); toast("Impuesto guardado"); }
    catch (e) { setError(e.message); } finally { setGuardando(false); }
  }

  async function cambiar(activo) {
    setGuardando(true);
    setError("");
    try {
      await api.patch("/obrador", { modulo_salidas: activo });
      await recargar();
      toast(activo ? "Salidas a clientes activadas" : "Salidas a clientes desactivadas");
    } catch (e) { setError(e.message); } finally { setGuardando(false); }
  }

  return (
    <section className="panel pila">
      <h2>Apartados de la app</h2>
      <label className="casilla">
        <input type="checkbox" checked={Boolean(obrador.modulo_salidas)} disabled={guardando} onChange={(e) => cambiar(e.target.checked)} />
        <span>
          <strong>Registrar las salidas de lotes a clientes</strong>
          <span className="suave pequeno">
            Añade el apartado «Salidas»: cada pedido con su cliente y los lotes que se le entregan, para saber a quién ha ido cada lote.
            Déjalo desactivado si ya anotas los lotes en tu programa de facturación.
          </span>
        </span>
      </label>
      {obrador.modulo_salidas && (
        <div className="campo">
          <span className="etq">Impuesto para el Excel de pedidos de Holded</span>
          <div className="fila" style={{ flexWrap: "wrap" }}>
            <select className="entrada" style={{ width: "auto" }} aria-label="Tipo de impuesto" value={impuesto.tipo} onChange={(e) => setImpuesto({ ...impuesto, tipo: e.target.value })}>
              <option value="IGIC">IGIC (Canarias)</option>
              <option value="IVA">IVA</option>
            </select>
            <input className="entrada" style={{ width: "6em" }} inputMode="decimal" aria-label="Porcentaje" placeholder="%" value={impuesto.pct} onChange={(e) => setImpuesto({ ...impuesto, pct: e.target.value })} />
            <span className="suave">%</span>
            <button className="boton" onClick={guardarImpuesto} disabled={guardando}>Guardar</button>
          </div>
          <span className="ayuda">Se pone en la columna de impuesto de cada línea. Déjalo vacío para completarlo en Holded.</span>
        </div>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
    </section>
  );
}

/**
 * Más → Configuración (solo el gestor):
 *  · Apariencia: logotipo y colores.
 *  · Apartados: qué partes opcionales de la app se usan (salidas a clientes…).
 */
export default function PantallaConfiguracion() {
  const { puede } = useSesion();
  return (
    <>
      <Cabecera titulo="Configuración" volver="/mas" />
      <main className="contenido">
        {!puede("obrador") ? <Aviso>Solo el gestor puede cambiar la configuración.</Aviso> : (
          <>
            <section className="seccion">
              <h2 className="titulo-grupo">Apariencia</h2>
              <p className="suave pequeno">Cómo se ve la app para todo el equipo.</p>
            </section>
            <SubirLogo />
            <SelectorTema />
            <section className="seccion" style={{ marginTop: 8 }}>
              <h2 className="titulo-grupo">Funcionamiento</h2>
              <p className="suave pequeno">Qué apartados opcionales usa tu obrador.</p>
            </section>
            <ApartadosOpcionales />
          </>
        )}
      </main>
    </>
  );
}
