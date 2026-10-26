import React, { useEffect, useState } from "react";
import { UserPlus, Copy, ChevronRight } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Campo, Cargando, Hoja, Opciones, useSesion, useToast, NOMBRE_ROL, fecha } from "../componentes/ui.jsx";
import Cabecera from "../componentes/Cabecera.jsx";

const ROLES = [
  { valor: "jefe_produccion", texto: "Jefe de producción", desc: "Registra y puede corregir lo ya guardado" },
  { valor: "operario", texto: "Operario", desc: "Registra, pero no puede editar lo ya guardado" },
  { valor: "observador", texto: "Observador", desc: "Solo consulta, no registra nada" },
];

export default function Equipo() {
  const { usuario: yo } = useSesion();
  const toast = useToast();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [alta, setAlta] = useState(false);
  const [elegido, setElegido] = useState(null);
  const [clave, setClave] = useState(null); // { nombre, email, password }

  const cargar = () => api.get("/usuarios").then(setDatos).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);

  const libres = datos ? datos.plazas.total - datos.plazas.ocupadas : 0;

  return (
    <>
      <Cabecera titulo="Equipo" volver="/mas" />
      <main className="contenido">
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!datos && !error && <Cargando />}
        {datos && (
          <>
            <div className="panel fila entre">
              <div>
                <strong className="numero">{datos.plazas.ocupadas} de {datos.plazas.total} plazas en uso</strong>
                <div className="suave pequeno">El plan básico incluye al gestor y una cuenta más. Cada usuario extra: +3 €/mes.</div>
              </div>
            </div>
            <ul className="lista">
              {datos.usuarios.map((u) => (
                <li key={u.id}>
                  <button className="item" onClick={() => u.id !== yo.id && setElegido(u)} disabled={u.id === yo.id} style={u.id === yo.id ? { cursor: "default" } : undefined}>
                    <span className="principal">
                      <strong>{u.nombre}{u.id === yo.id ? " (tú)" : ""}</strong>
                      <span className="suave pequeno">{u.email}</span>
                    </span>
                    {!u.activo ? <span className="distintivo">Desactivado</span> : <span className={`distintivo ${u.rol === "gestor" ? "azul" : ""}`}>{NOMBRE_ROL[u.rol]}</span>}
                    {u.id !== yo.id && <ChevronRight size={20} aria-hidden className="suave" />}
                  </button>
                </li>
              ))}
            </ul>
            {libres <= 0 && (
              <Aviso tipo="info">Todas las plazas están ocupadas. Para añadir a alguien, contrata un usuario extra o desactiva a otra persona.</Aviso>
            )}
          </>
        )}
      </main>
      {datos && (
        <div className="accion-fija">
          <button className="boton principal grande" disabled={libres <= 0} onClick={() => setAlta(true)}>
            <UserPlus size={22} aria-hidden /> Añadir usuario
          </button>
        </div>
      )}

      {alta && (
        <AltaUsuario
          onCerrar={() => setAlta(false)}
          onCreado={(u, password) => { setAlta(false); setClave({ ...u, password }); cargar(); }}
        />
      )}
      {elegido && (
        <GestionUsuario
          u={elegido}
          libres={libres}
          onCerrar={() => setElegido(null)}
          onCambio={(msg) => { setElegido(null); toast(msg); cargar(); }}
          onClave={(password) => { setClave({ ...elegido, password }); setElegido(null); }}
        />
      )}
      {clave && <ClaveTemporal {...clave} onCerrar={() => setClave(null)} />}
    </>
  );
}

function AltaUsuario({ onCerrar, onCreado }) {
  const [f, setF] = useState({ nombre: "", email: "", rol: "operario" });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function crear() {
    setEnviando(true);
    setError("");
    try {
      const { usuario, passwordTemporal } = await api.post("/usuarios", { ...f, email: f.email.trim(), nombre: f.nombre.trim() });
      onCreado(usuario, passwordTemporal);
    } catch (e) {
      setError(e.message);
      setEnviando(false);
    }
  }

  return (
    <Hoja titulo="Añadir usuario" onCerrar={onCerrar}>
      <Campo etiqueta="Nombre" id="u-nombre">
        <input id="u-nombre" className="entrada" autoComplete="off" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
      </Campo>
      <Campo etiqueta="Email" id="u-email" ayuda="Lo usará para entrar.">
        <input id="u-email" className="entrada" type="email" inputMode="email" autoCapitalize="none" autoComplete="off"
          value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </Campo>
      <Opciones etiqueta="Rol" anchas valor={f.rol} onCambio={(rol) => setF({ ...f, rol })} opciones={ROLES} />
      {error && <Aviso tipo="error">{error}</Aviso>}
      <button className="boton principal grande bloque" onClick={crear} disabled={enviando || !f.nombre.trim() || !f.email.trim()}>
        {enviando ? "Creando…" : "Crear usuario"}
      </button>
    </Hoja>
  );
}

function GestionUsuario({ u, libres, onCerrar, onCambio, onClave }) {
  const [rol, setRol] = useState(u.rol);
  const [error, setError] = useState("");

  async function patch(cambios, mensaje) {
    try {
      await api.patch(`/usuarios/${u.id}`, cambios);
      onCambio(mensaje);
    } catch (e) { setError(e.message); }
  }
  async function restablecer() {
    try {
      const { passwordTemporal } = await api.post(`/usuarios/${u.id}/restablecer-password`);
      onClave(passwordTemporal);
    } catch (e) { setError(e.message); }
  }

  return (
    <Hoja titulo={u.nombre} onCerrar={onCerrar}>
      <p className="suave">{u.email} · último acceso: {u.ultimo_acceso ? fecha(u.ultimo_acceso) : "nunca"}</p>
      <Opciones etiqueta="Rol" anchas valor={rol} onCambio={setRol} opciones={ROLES} />
      {rol !== u.rol && (
        <button className="boton principal bloque" onClick={() => patch({ rol }, "Rol actualizado")}>Guardar rol</button>
      )}
      <button className="boton bloque" onClick={restablecer}>Restablecer contraseña</button>
      {u.activo ? (
        <button className="boton peligro bloque" onClick={() => patch({ activo: false }, "Usuario desactivado")}>
          Desactivar (libera su plaza)
        </button>
      ) : (
        <button className="boton bloque" disabled={libres <= 0} onClick={() => patch({ activo: true }, "Usuario reactivado")}>
          Reactivar{libres <= 0 ? " (no quedan plazas)" : ""}
        </button>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
    </Hoja>
  );
}

function ClaveTemporal({ nombre, email, password, onCerrar }) {
  const toast = useToast();
  const texto = `Acceso al registro del obrador\nEmail: ${email}\nContraseña temporal: ${password}\n${window.location.origin}`;
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      toast("Datos de acceso copiados");
    } catch { /* el usuario puede seleccionarla a mano */ }
  }
  return (
    <Hoja titulo="Contraseña temporal" onCerrar={onCerrar}>
      <p>Pásale estos datos a <strong>{nombre}</strong>. Solo se muestran ahora; al entrar se le pedirá cambiar la contraseña.</p>
      <div className="pequeno suave">{email}</div>
      <div className="clave" aria-label="Contraseña temporal">{password}</div>
      <button className="boton principal grande bloque" onClick={copiar}><Copy size={20} aria-hidden /> Copiar datos de acceso</button>
      <button className="boton bloque" onClick={onCerrar}>Hecho</button>
    </Hoja>
  );
}
