import React, { useState } from "react";
import { api, sesion } from "../api.js";
import { Aviso, Campo } from "../componentes/ui.jsx";

export default function Login({ onEntrar }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const { token } = await api.post("/auth/login", { email: email.trim(), password });
      sesion.set(token);
      await onEntrar();
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <main className="acceso">
      <div className="marca">
        <img src="/icono.svg" alt="" />
        <div>
          <h1>Registro de obrador</h1>
          <p className="suave">Trazabilidad del obrador, desde el móvil</p>
        </div>
      </div>
      <form className="pila" onSubmit={entrar} noValidate>
        <Campo etiqueta="Email" id="email">
          <input
            id="email" className="entrada" type="email" inputMode="email" autoComplete="username"
            autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} required
          />
        </Campo>
        <Campo etiqueta="Contraseña" id="password">
          <input
            id="password" className="entrada" type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} required
          />
        </Campo>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <button className="boton principal grande bloque" disabled={enviando || !email || !password}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <p className="suave pequeno">¿Has olvidado la contraseña? Pide al gestor de tu obrador que te la restablezca.</p>
    </main>
  );
}
