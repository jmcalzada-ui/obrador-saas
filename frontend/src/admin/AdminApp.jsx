import React, { useCallback, useEffect, useState } from "react";
import { Search, ArrowLeft, LogOut, Users, KeyRound } from "lucide-react";
import { Aviso, Campo, Cargando, Hoja, euros, fecha, NOMBRE_ROL, ProveedorToast, useToast } from "../componentes/ui.jsx";
import { SECTORES } from "../pantallas/MiObrador.jsx";

// ---------- Cliente de la API del back office (sesión propia, separada de la app) ----------
const CLAVE = "obrador-backoffice-sesion";
const token = { get: () => { try { return sessionStorage.getItem(CLAVE); } catch { return null; } },
  set: (t) => { try { t ? sessionStorage.setItem(CLAVE, t) : sessionStorage.removeItem(CLAVE); } catch { /* */ } } };
async function pet(metodo, ruta, cuerpo) {
  const res = await fetch(`/api/admin${ruta}`, {
    method: metodo,
    headers: { ...(cuerpo ? { "Content-Type": "application/json" } : {}), ...(token.get() ? { Authorization: `Bearer ${token.get()}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  }).catch(() => { throw new Error("Sin conexión."); });
  if (res.status === 401 && token.get()) { token.set(null); window.dispatchEvent(new Event("bo-caducada")); }
  const d = await res.json().catch(() => null);
  if (!res.ok) throw new Error(d?.error || `Error ${res.status}`);
  return d;
}
const bo = { get: (r) => pet("GET", r), post: (r, c = {}) => pet("POST", r, c), patch: (r, c) => pet("PATCH", r, c) };

const LED_TEXTO = { verde: "Cobrado y activo", rojo: "Cobro fallido", gris: "Sin contratar o baja" };
const Led = ({ led }) => <span className={`led ${led}`} role="img" aria-label={LED_TEXTO[led]} title={LED_TEXTO[led]} />;
const ESTADO_OBRADOR = { pendiente_pago: "Pendiente de pago", prueba: "Prueba", activo: "Activo", impago: "Impago", suspendido: "En suspenso", baja: "Baja" };
const hace = (iso) => {
  if (!iso) return "Nunca";
  const min = (Date.now() - new Date(iso)) / 60000;
  if (min < 60) return "Hace un momento";
  if (min < 1440) return `Hace ${Math.round(min / 60)} h`;
  const d = Math.round(min / 1440);
  return d === 1 ? "Ayer" : `Hace ${d} días`;
};

export default function AdminApp() {
  const [admin, setAdmin] = useState(undefined);
  const cargar = useCallback(() => {
    if (!token.get()) return setAdmin(null);
    bo.get("/me").then((d) => setAdmin(d.admin)).catch(() => setAdmin(null));
  }, []);
  useEffect(() => {
    cargar();
    const f = () => setAdmin(null);
    window.addEventListener("bo-caducada", f);
    return () => window.removeEventListener("bo-caducada", f);
  }, [cargar]);

  if (admin === undefined) return <Cargando />;
  if (!admin) return <LoginAdmin onEntrar={cargar} />;
  return <ProveedorToast><Panel admin={admin} salir={() => { token.set(null); setAdmin(null); }} /></ProveedorToast>;
}

function LoginAdmin({ onEntrar }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function entrar(e) {
    e.preventDefault();
    setError("");
    try { token.set((await bo.post("/login", { email, password })).token); onEntrar(); } catch (err) { setError(err.message); }
  }
  return (
    <main className="acceso">
      <div><h1>Back office</h1><p className="suave">Acceso privado de administración</p></div>
      <form className="pila" onSubmit={entrar}>
        <Campo etiqueta="Email" id="bo-email"><input id="bo-email" className="entrada" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
        <Campo etiqueta="Contraseña" id="bo-pass"><input id="bo-pass" className="entrada" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Campo>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <button className="boton principal grande bloque" disabled={!email || !password}>Entrar</button>
      </form>
    </main>
  );
}

function Panel({ admin, salir }) {
  const leer = () => window.location.hash.replace(/^#\/?/, "");
  const [ruta, setRuta] = useState(leer());
  useEffect(() => {
    const f = () => { setRuta(leer()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const [seccion, id] = ruta.split("/");

  return (
    <div className="bo">
      <header className="bo-cabecera">
        {seccion && <button className="boton-icono" aria-label="Volver" onClick={() => (window.location.hash = "")}><ArrowLeft size={22} /></button>}
        <h1>Back office</h1>
        {admin.rol === "superadmin" && <button className="boton" onClick={() => (window.location.hash = "admins")}><Users size={18} aria-hidden /> <span className="solo-ancho">Administradores</span></button>}
        <button className="boton" onClick={() => (window.location.hash = "cuenta")}><KeyRound size={18} aria-hidden /> <span className="solo-ancho">{admin.nombre}</span></button>
        <button className="boton" onClick={salir}><LogOut size={18} aria-hidden /> <span className="solo-ancho">Salir</span></button>
      </header>
      {seccion === "cliente" ? <Cliente id={id} /> : seccion === "admins" ? <Admins yo={admin} /> : seccion === "cuenta" ? <Cuenta /> : <Clientes />}
    </div>
  );
}

function Clientes() {
  const [q, setQ] = useState("");
  const [led, setLed] = useState("");
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim());
      if (led) p.set("led", led);
      bo.get(`/clientes?${p}`).then(setDatos).catch((e) => setError(e.message));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, led]);

  const t = datos?.totales;
  const ir = (c) => (window.location.hash = `cliente/${c.id}`);
  return (
    <main className="contenido">
      {error && <Aviso tipo="error">{error}</Aviso>}
      {t && (
        <div className="datos cuatro">
          <div className="dato"><strong className="fila" style={{ gap: 10 }}><Led led="verde" /> {t.verdes}</strong><span>al día</span></div>
          <div className="dato"><strong className="fila" style={{ gap: 10 }}><Led led="rojo" /> {t.rojos}</strong><span>con cobro fallido</span></div>
          <div className="dato"><strong>{euros(t.ingresos_mensuales)}</strong><span>cuotas mensuales (sin impuestos)</span></div>
          <div className="dato"><strong>{euros(t.cobrado_12m)}</strong><span>cobrado últimos 12 meses</span></div>
        </div>
      )}
      <div className="fila" style={{ flexWrap: "wrap" }}>
        <div className="buscador" style={{ flex: "1 1 260px" }}>
          <Search size={20} aria-hidden />
          <input className="entrada" type="search" placeholder="Nombre, razón social, CIF o municipio" aria-label="Buscar clientes" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="opciones" role="radiogroup" aria-label="Filtrar por estado de cobro" style={{ flex: "1 1 360px" }}>
          {[["", "Todos"], ["rojo", "Impago"], ["verde", "Al día"], ["gris", "Sin contratar"]].map(([v, txt]) => (
            <button key={v} type="button" role="radio" className="opcion" aria-checked={led === v} onClick={() => setLed(v)}>{txt}</button>
          ))}
        </div>
      </div>
      {!datos && !error && <Cargando />}
      {datos && datos.clientes.length === 0 && <div className="vacio panel"><p>No hay clientes con esos criterios.</p></div>}
      {datos && datos.clientes.length > 0 && (
        <>
          <div className="tabla-scroll solo-ancho">
            <table className="tabla">
              <thead>
                <tr>
                  <th aria-label="Estado de cobro" />
                  <th>Cliente</th><th>Alta</th><th>Contratación</th><th>Próximo cobro</th>
                  <th className="num">Últimos 12 meses</th><th className="num">Desde el alta</th><th>Último acceso</th>
                </tr>
              </thead>
              <tbody>
                {datos.clientes.map((c) => (
                  <tr key={c.id} onClick={() => ir(c)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && ir(c)}>
                    <td><Led led={c.led} /></td>
                    <td><strong>{c.nombre}</strong><div className="suave pequeno">{c.razon_social || "—"} · {c.municipio || "—"}</div></td>
                    <td>{fecha(c.fecha_alta)}</td>
                    <td>Básico{c.usuarios_extra ? ` +${c.usuarios_extra} us.` : ""}<div className="suave pequeno">{c.importe_mensual != null ? `${euros(c.importe_mensual)}/mes` : "—"}</div></td>
                    <td>{c.led === "rojo" ? <span style={{ color: "var(--rojo)", fontWeight: 700 }}>Impago desde {fecha(c.impago_desde)}</span> : fecha(c.proximo_cobro)}</td>
                    <td className="num">{euros(c.pagado_12m)}</td>
                    <td className="num">{euros(c.pagado_total)}</td>
                    <td>{hace(c.ultimo_acceso)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="lista solo-estrecho">
            {datos.clientes.map((c) => (
              <li key={c.id}>
                <button className="item" onClick={() => ir(c)}>
                  <Led led={c.led} />
                  <span className="principal">
                    <strong>{c.nombre}</strong>
                    <span className="suave pequeno">Alta {fecha(c.fecha_alta)} · {hace(c.ultimo_acceso).toLowerCase()}</span>
                    <span className="pequeno">{c.led === "rojo" ? `Impago desde ${fecha(c.impago_desde)}` : `Próximo cobro ${fecha(c.proximo_cobro)}`} · 12 m: {euros(c.pagado_12m)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

function Cliente({ id }) {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [cambio, setCambio] = useState(null); // "activo" | "suspendido"
  const cargar = () => bo.get(`/clientes/${id}`).then(setD).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, [id]);

  async function simular(fallido) {
    try { await bo.post(`/clientes/${id}/simular-cobro`, { fallido }); toast(fallido ? "Cobro fallido simulado" : "Cobro simulado"); cargar(); }
    catch (e) { setError(e.message); }
  }
  if (error) return <main className="contenido"><Aviso tipo="error">{error}</Aviso></main>;
  if (!d) return <Cargando />;
  const { resumen: r, obrador: o, suscripcion: s } = d;
  const dato = (etq, v) => <><dt>{etq}</dt><dd>{v || "—"}</dd></>;

  return (
    <main className="contenido">
      <div className="fila" style={{ gap: 14 }}>
        <Led led={r.led} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: "1.8rem" }}>{o.nombre}</h1>
          <p className="suave">{LED_TEXTO[r.led]} · {ESTADO_OBRADOR[o.estado]}</p>
        </div>
      </div>

      <div className="datos cuatro">
        <div className="dato"><strong>{euros(r.pagado_12m)}</strong><span>últimos 12 meses</span></div>
        <div className="dato"><strong>{euros(r.pagado_total)}</strong><span>desde la contratación</span></div>
        <div className="dato"><strong style={{ fontSize: "1.3rem" }}>{r.led === "rojo" ? `Impago ${fecha(r.impago_desde)}` : fecha(r.proximo_cobro)}</strong><span>{r.led === "rojo" ? "primer cobro fallido" : "próximo cobro previsto"}</span></div>
        <div className="dato"><strong style={{ fontSize: "1.3rem" }}>{hace(r.ultimo_acceso)}</strong><span>último uso de la app</span></div>
      </div>

      <div className="bloques">
        <section className="panel pila">
          <h2>Contratación</h2>
          <dl className="ficha">
            {dato("Alta", fecha(o.creado_en))}
            {dato("Contratado", fecha(s.contratado_en))}
            {dato("Plan", `Básico${s.usuarios_extra ? ` + ${s.usuarios_extra} usuario(s) extra` : ""}`)}
            {dato("Módulos", s.modulos.length ? s.modulos.join(", ") : "Ninguno")}
            {dato("Cuota", s.importe_mensual != null ? `${euros(s.importe_mensual)} / mes sin impuestos` : null)}
            {dato("Usuarios", `${r.usuarios_activos} de ${s.usuarios_incluidos + s.usuarios_extra}`)}
            {dato("Forma de pago", s.metodo_pago_resumen || (s.metodo_pago_tipo === "sepa_debit" ? "Domiciliación" : s.metodo_pago_tipo === "card" ? "Tarjeta" : null))}
            {dato("Último cobro", fecha(s.ultimo_cobro_ok))}
            {s.impago_desde && dato("Recordatorio", s.recordatorio_impago_en ? `Enviado ${fecha(s.recordatorio_impago_en)}` : "Pendiente")}
            {s.suspendido_en && dato("Suspendido", fecha(s.suspendido_en))}
          </dl>
        </section>
        <section className="panel pila">
          <h2>Facturación</h2>
          <dl className="ficha">
            {dato("Razón social", o.razon_social)}
            {dato("CIF / NIF", o.cif)}
            {dato("Dirección", o.direccion_fiscal)}
            {dato("C. postal", o.codigo_postal)}
            {dato("Municipio", o.municipio)}
            {dato("Provincia", o.provincia)}
            {dato("País", o.pais)}
            {dato("Email facturas", o.email_facturacion || o.email_contacto)}
          </dl>
        </section>
        <section className="panel pila">
          <h2>Contacto y obrador</h2>
          <dl className="ficha">
            {dato("Contacto", o.contacto_nombre)}
            {dato("Teléfono", o.telefono && <a href={`tel:${o.telefono}`}>{o.telefono}</a>)}
            {dato("Email", o.email_contacto && <a href={`mailto:${o.email_contacto}`}>{o.email_contacto}</a>)}
            {dato("Tipo", SECTORES[o.sector])}
            {dato("Empleados", o.num_empleados)}
            {dato("Reg. sanitario", o.registro_sanitario)}
          </dl>
        </section>
      </div>

      <section className="seccion">
        <h2>Pagos</h2>
        {d.pagos.length === 0 ? <p className="suave">Sin cobros todavía.</p> : (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Factura</th><th>Estado</th><th className="num">Importe</th><th>Periodo</th><th /></tr></thead>
              <tbody>
                {d.pagos.map((p, i) => (
                  <tr key={i} style={{ cursor: "default" }}>
                    <td>{fecha(p.pagado_en || p.fecha)}</td>
                    <td>{p.numero_factura || "—"}</td>
                    <td><span className={`distintivo ${p.estado === "pagado" ? "verde" : p.estado === "fallido" ? "rojo" : ""}`}>{p.estado === "pagado" ? "Cobrado" : p.estado === "fallido" ? `Fallido (${p.intentos} int.)` : p.estado}</span></td>
                    <td className="num">{euros(p.importe)}</td>
                    <td>{p.periodo_desde ? `${fecha(p.periodo_desde, { day: "numeric", month: "short" })} – ${fecha(p.periodo_hasta, { day: "numeric", month: "short" })}` : "—"}</td>
                    <td>{p.url_pdf && <a href={p.url_pdf} target="_blank" rel="noreferrer">PDF</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="bloques">
        <section className="seccion">
          <h2>Usuarios</h2>
          <ul className="lista">
            {d.usuarios.map((u, i) => (
              <li key={i}><div className="item" style={{ cursor: "default" }}>
                <span className="principal"><strong>{u.nombre}</strong><span className="suave pequeno">{u.email}</span></span>
                <span style={{ textAlign: "right" }}>
                  <span className="distintivo">{u.activo ? NOMBRE_ROL[u.rol] : "Desactivado"}</span>
                  <div className="suave pequeno">{hace(u.ultimo_acceso)}</div>
                </span>
              </div></li>
            ))}
          </ul>
        </section>
        <section className="seccion">
          <h2>Correos enviados</h2>
          {d.emails.length === 0 ? <p className="suave">Ninguno.</p> : (
            <ul className="lista">
              {d.emails.map((e, i) => (
                <li key={i}><div className="item" style={{ cursor: "default" }}>
                  <span className="principal"><strong>{e.asunto}</strong><span className="suave pequeno">{fecha(e.creado_en)} · {e.destinatario}</span></span>
                  <span className={`distintivo ${e.estado === "error" ? "rojo" : e.estado === "enviado" ? "verde" : ""}`}>{e.estado === "simulado" ? "Sin enviar (pruebas)" : e.estado === "error" ? "Error" : "Enviado"}</span>
                </div></li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {d.acciones.length > 0 && (
        <section className="seccion">
          <h2>Acciones del back office</h2>
          <ul className="lista">
            {d.acciones.map((a, i) => (
              <li key={i}><div className="item" style={{ cursor: "default" }}>
                <span className="principal"><strong>{a.accion === "reactivar" ? "Reactivado a mano" : a.accion === "suspender" ? "Suspendido a mano" : a.accion}</strong>
                  <span className="suave pequeno">{a.admin} · {fecha(a.creado_en)}{a.detalle?.motivo ? ` · ${a.detalle.motivo}` : ""}</span></span>
              </div></li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel pila">
        <h2>Acciones</h2>
        <div className="fila" style={{ flexWrap: "wrap" }}>
          {o.estado !== "activo" && o.estado !== "baja" && <button className="boton principal" onClick={() => setCambio("activo")}>Reactivar a mano</button>}
          {["activo", "impago"].includes(o.estado) && <button className="boton peligro" onClick={() => setCambio("suspendido")}>Suspender a mano</button>}
          {o.email_contacto && <a className="boton" href={`mailto:${o.email_contacto}`}>Escribir al cliente</a>}
        </div>
        {d.pagosSimulados && (
          <details>
            <summary className="suave pequeno" style={{ cursor: "pointer" }}>Entorno de pruebas sin Stripe: simular cobros</summary>
            <div className="fila" style={{ marginTop: 10, flexWrap: "wrap" }}>
              <button className="boton" onClick={() => simular(false)}>Simular cobro correcto</button>
              <button className="boton" onClick={() => simular(true)}>Simular cobro fallido</button>
            </div>
          </details>
        )}
      </section>

      {cambio && <CambiarEstado id={id} estado={cambio} onCerrar={() => setCambio(null)} onHecho={() => { setCambio(null); toast("Estado actualizado"); cargar(); }} />}
    </main>
  );
}

function CambiarEstado({ id, estado, onCerrar, onHecho }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  async function ok() {
    try { await bo.post(`/clientes/${id}/estado`, { estado, motivo: motivo.trim() }); onHecho(); } catch (e) { setError(e.message); }
  }
  return (
    <Hoja titulo={estado === "activo" ? "Reactivar cliente" : "Suspender cliente"} onCerrar={onCerrar}>
      <p>{estado === "activo" ? "El cliente recupera el acceso y se borra el impago pendiente (p. ej. si ha pagado por transferencia)." : "Todo el equipo del cliente pierde el acceso; el gestor solo podrá regularizar el pago."}</p>
      <Campo etiqueta="Motivo" id="ce-motivo"><textarea id="ce-motivo" className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <button className={`boton grande bloque ${estado === "activo" ? "principal" : "peligro"}`} onClick={ok} disabled={motivo.trim().length < 3}>Confirmar</button>
    </Hoja>
  );
}

function Admins({ yo }) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const [alta, setAlta] = useState({ email: "", nombre: "" });
  const [clave, setClave] = useState(null);
  const cargar = () => bo.get("/admins").then((d) => setLista(d.admins)).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);
  async function crear(e) {
    e.preventDefault();
    setError("");
    try { const r = await bo.post("/admins", alta); setClave({ ...r.admin, password: r.passwordTemporal }); setAlta({ email: "", nombre: "" }); cargar(); }
    catch (err) { setError(err.message); }
  }
  async function activar(a) {
    try { await bo.patch(`/admins/${a.id}`, { activo: !a.activo }); cargar(); } catch (e) { setError(e.message); }
  }
  return (
    <main className="contenido" style={{ maxWidth: 720 }}>
      <h1>Administradores</h1>
      <p className="suave">Personas con acceso a este back office. Solo tú (administrador principal) puedes añadir o desactivar administradores.</p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!lista ? <Cargando /> : (
        <ul className="lista">
          {lista.map((a) => (
            <li key={a.id}><div className="item" style={{ cursor: "default" }}>
              <span className="principal"><strong>{a.nombre}{a.id === yo.id ? " (tú)" : ""}</strong><span className="suave pequeno">{a.email} · {hace(a.ultimo_acceso).toLowerCase()}</span></span>
              <span className="distintivo">{a.rol === "superadmin" ? "Principal" : a.activo ? "Activo" : "Desactivado"}</span>
              {a.rol !== "superadmin" && <button className="boton" onClick={() => activar(a)}>{a.activo ? "Desactivar" : "Activar"}</button>}
            </div></li>
          ))}
        </ul>
      )}
      <form className="panel pila" onSubmit={crear}>
        <h2>Añadir administrador</h2>
        <Campo etiqueta="Nombre" id="ad-n"><input id="ad-n" className="entrada" value={alta.nombre} onChange={(e) => setAlta({ ...alta, nombre: e.target.value })} /></Campo>
        <Campo etiqueta="Email" id="ad-e"><input id="ad-e" className="entrada" type="email" value={alta.email} onChange={(e) => setAlta({ ...alta, email: e.target.value })} /></Campo>
        <button className="boton principal bloque" disabled={!alta.email || !alta.nombre}>Crear administrador</button>
      </form>
      {clave && (
        <Hoja titulo="Contraseña temporal" onCerrar={() => setClave(null)}>
          <p>Pásale a <strong>{clave.nombre}</strong> su acceso. Solo se muestra ahora.</p>
          <div className="pequeno suave">{clave.email} · {window.location.origin}/admin</div>
          <div className="clave">{clave.password}</div>
          <button className="boton bloque" onClick={() => setClave(null)}>Hecho</button>
        </Hoja>
      )}
    </main>
  );
}

function Cuenta() {
  const toast = useToast();
  const [f, setF] = useState({ passwordActual: "", passwordNueva: "" });
  const [error, setError] = useState("");
  async function guardar(e) {
    e.preventDefault();
    setError("");
    try { await bo.post("/cambiar-password", f); setF({ passwordActual: "", passwordNueva: "" }); toast("Contraseña cambiada"); } catch (err) { setError(err.message); }
  }
  return (
    <main className="contenido" style={{ maxWidth: 520 }}>
      <h1>Cambiar contraseña</h1>
      <form className="pila" onSubmit={guardar}>
        <Campo etiqueta="Contraseña actual" id="cu-a"><input id="cu-a" className="entrada" type="password" autoComplete="current-password" value={f.passwordActual} onChange={(e) => setF({ ...f, passwordActual: e.target.value })} /></Campo>
        <Campo etiqueta="Nueva contraseña" id="cu-n" ayuda="Al menos 12 caracteres."><input id="cu-n" className="entrada" type="password" autoComplete="new-password" value={f.passwordNueva} onChange={(e) => setF({ ...f, passwordNueva: e.target.value })} /></Campo>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <button className="boton principal grande bloque" disabled={!f.passwordActual || f.passwordNueva.length < 12}>Cambiar contraseña</button>
      </form>
    </main>
  );
}
