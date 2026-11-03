import React, { useState } from "react";
import { api } from "../api.js";
import { Aviso, useSesion, useToast } from "./ui.jsx";

/** Configuración del obrador (solo el gestor): qué apartados se usan. */
export default function Configuracion() {
  const { puede, obrador, recargar } = useSesion();
  const toast = useToast();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  if (!puede("obrador")) return null;

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
      <h2>Configuración</h2>
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
      {error && <Aviso tipo="error">{error}</Aviso>}
    </section>
  );
}
