import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Aviso, Campo, Cargando, useSesion, useToast, fecha } from "../componentes/ui.jsx";
import Cabecera from "../componentes/Cabecera.jsx";

const CAMPOS = [
  ["nombre", "Nombre comercial"],
  ["razon_social", "Razón social"],
  ["cif", "CIF / NIF"],
  ["registro_sanitario", "Nº de registro sanitario"],
  ["direccion", "Dirección"],
  ["email_contacto", "Email de contacto"],
  ["telefono", "Teléfono"],
];

const MODULOS = { escandallos: "Escandallos, precios y lectura de fichas por IA", appcc_temperaturas: "APPCC: registros de temperatura" };

export default function MiObrador() {
  const { puede, recargar } = useSesion();
  const toast = useToast();
  const editable = puede("obrador");
  const [datos, setDatos] = useState(null);
  const [f, setF] = useState({});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.get("/obrador").then((d) => {
      setDatos(d);
      setF(Object.fromEntries(CAMPOS.map(([k]) => [k, d.obrador[k] || ""])));
    }).catch((e) => setError(e.message));
  }, []);

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    setError("");
    try {
      const cambios = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() === "" && k !== "nombre" ? null : v.trim()]));
      const { obrador } = await api.patch("/obrador", cambios);
      setDatos((d) => ({ ...d, obrador }));
      toast("Datos guardados");
      recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const s = datos?.suscripcion;
  return (
    <>
      <Cabecera titulo="Mi obrador" volver="/mas" />
      <main className="contenido">
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!datos && !error && <Cargando />}
        {datos && (
          <>
            {editable && (
              <section className="panel pila">
                <h2>Plan</h2>
                <dl className="ficha">
                  <dt>Plan</dt><dd>Básico</dd>
                  <dt>Estado</dt><dd>{s.estado === "prueba" ? `Prueba gratuita hasta el ${fecha(s.prueba_hasta)}` : s.estado}</dd>
                  <dt>Usuarios</dt><dd className="numero">{s.usuarios_activos} de {s.usuarios_incluidos + s.usuarios_extra}</dd>
                  <dt>Módulos</dt><dd>{s.modulos.length ? s.modulos.map((m) => MODULOS[m] || m).join(", ") : "Ninguno contratado"}</dd>
                </dl>
                <p className="suave pequeno">La contratación de módulos y usuarios extra estará disponible próximamente desde aquí.</p>
              </section>
            )}
            <form className="pila" onSubmit={guardar}>
              <h2>Datos del obrador</h2>
              <p className="suave pequeno">Aparecerán en las exportaciones y, más adelante, en las etiquetas.</p>
              {CAMPOS.map(([k, etq]) => (
                <Campo key={k} etiqueta={etq} id={`o-${k}`}>
                  <input id={`o-${k}`} className="entrada" value={f[k]} disabled={!editable}
                    type={k === "email_contacto" ? "email" : k === "telefono" ? "tel" : "text"}
                    onChange={(e) => setF({ ...f, [k]: e.target.value })} />
                </Campo>
              ))}
              {editable && (
                <button className="boton principal grande bloque" disabled={guardando || !f.nombre?.trim()}>
                  {guardando ? "Guardando…" : "Guardar datos"}
                </button>
              )}
            </form>
          </>
        )}
      </main>
    </>
  );
}
