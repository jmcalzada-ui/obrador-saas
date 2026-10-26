import React, { useState } from "react";
import { api } from "../api.js";
import { Aviso, Campo, useSesion, useToast } from "../componentes/ui.jsx";
import Cabecera from "../componentes/Cabecera.jsx";

export default function CambiarPassword({ obligatorio = false, onHecho }) {
  const { usuario, salir } = useSesion();
  const toast = useToast();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function guardar(e) {
    e.preventDefault();
    setError("");
    if (nueva.length < 10) return setError("La nueva contraseña debe tener al menos 10 caracteres.");
    if (nueva !== repetir) return setError("Las dos contraseñas nuevas no coinciden.");
    setEnviando(true);
    try {
      await api.post("/auth/cambiar-password", { passwordActual: actual, passwordNueva: nueva });
      toast("Contraseña cambiada");
      setActual(""); setNueva(""); setRepetir("");
      onHecho?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const formulario = (
    <form className="pila" onSubmit={guardar} noValidate>
      <Campo etiqueta={obligatorio ? "Contraseña temporal" : "Contraseña actual"} id="pa">
        <input id="pa" className="entrada" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
      </Campo>
      <Campo etiqueta="Nueva contraseña" id="pn" ayuda="Al menos 10 caracteres.">
        <input id="pn" className="entrada" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
      </Campo>
      <Campo etiqueta="Repite la nueva contraseña" id="pr">
        <input id="pr" className="entrada" type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
      </Campo>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <button className="boton principal grande bloque" disabled={enviando || !actual || !nueva || !repetir}>
        {enviando ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </form>
  );

  if (obligatorio) {
    return (
      <main className="acceso">
        <div className="pila">
          <h1>Hola, {usuario.nombre.split(" ")[0]}</h1>
          <p>Antes de empezar, cambia la contraseña temporal por una tuya.</p>
        </div>
        {formulario}
        <button className="boton bloque" onClick={salir}>Salir</button>
      </main>
    );
  }
  return (
    <>
      <Cabecera titulo="Mi cuenta" volver="/mas" />
      <main className="contenido">
        <dl className="ficha panel">
          <dt>Nombre</dt><dd>{usuario.nombre}</dd>
          <dt>Email</dt><dd>{usuario.email}</dd>
        </dl>
        <h2>Cambiar contraseña</h2>
        {formulario}
      </main>
    </>
  );
}
