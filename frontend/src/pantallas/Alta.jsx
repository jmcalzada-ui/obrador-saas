import React, { useEffect, useState } from "react";
import { ChevronRight, Minus, Plus, CreditCard, Landmark, CheckCircle2 } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Campo, Opciones, euros } from "../componentes/ui.jsx";
import { SECTORES } from "./MiObrador.jsx";

const PASOS = ["Tu obrador", "Facturación", "Contacto", "Tu acceso", "Plan y pago"];

// Qué campos se validan en cada paso (para volver al paso del error que devuelva el servidor).
const CAMPOS_PASO = [
  ["nombre", "sector", "num_empleados", "registro_sanitario"],
  ["razon_social", "cif", "direccion_fiscal", "codigo_postal", "municipio", "provincia", "email_facturacion"],
  ["contacto_nombre", "telefono", "email_contacto"],
  ["gestor_nombre", "gestor_email", "password"],
  ["usuarios_extra", "metodo", "acepta_condiciones"],
];

export default function Alta() {
  if (window.location.pathname.startsWith("/alta/completada")) return <AltaCompletada />;
  return <Formulario />;
}

function Formulario() {
  const [paso, setPaso] = useState(0);
  const [plan, setPlan] = useState({ basico: 29.9, usuarioExtra: 3, basicoAnual: 299, usuarioExtraAnual: 30, completoAnual: 539, completoMensualEquivalente: 59.9, completoDisponible: false });
  const [error, setError] = useState(new URLSearchParams(window.location.search).has("cancelado")
    ? "Has salido de la página de pago sin completarlo. Puedes intentarlo de nuevo." : "");
  const [enviando, setEnviando] = useState(false);
  const [f, setF] = useState({
    nombre: "", sector: "", num_empleados: "", registro_sanitario: "",
    razon_social: "", cif: "", direccion_fiscal: "", codigo_postal: "", municipio: "", provincia: "", email_facturacion: "",
    contacto_nombre: "", telefono: "", email_contacto: "",
    gestor_nombre: "", gestor_email: "", password: "", password2: "",
    usuarios_extra: 0, plan: "basico", periodicidad: "mensual", metodo: "sepa_debit", acepta_condiciones: false,
  });
  const c = (p) => setF((x) => ({ ...x, ...p }));
  useEffect(() => { api.get("/alta/plan").then(setPlan).catch(() => {}); }, []);

  const completo = f.plan === "completo";
  const anual = completo || f.periodicidad === "anual";
  const base = completo ? plan.completoAnual : anual ? plan.basicoAnual : plan.basico;
  const extra = anual ? plan.usuarioExtraAnual : plan.usuarioExtra;
  const total = base + f.usuarios_extra * extra;
  const sinDescuento = ((completo ? plan.completoMensualEquivalente : plan.basico) + f.usuarios_extra * plan.usuarioExtra) * 12;
  const sufijo = anual ? "año" : "mes";
  const opcionPlan = completo ? "completo" : anual ? "basico_anual" : "basico_mensual";

  function validar() {
    const req = (cond, msg) => (!cond ? msg : "");
    switch (paso) {
      case 0: return req(f.nombre.trim(), "Escribe el nombre comercial.") || req(f.sector, "Elige el tipo de obrador.") || req(Number(f.num_empleados) > 0, "Indica cuántas personas trabajan en el obrador.");
      case 1: return req(f.razon_social.trim(), "Escribe la razón social.") || req(/^[A-Za-z0-9]{8,10}$/.test(f.cif.replace(/[\s.-]/g, "")), "El CIF / NIF no es válido.")
        || req(f.direccion_fiscal.trim(), "Escribe la dirección fiscal.") || req(/^\d{5}$/.test(f.codigo_postal.trim()), "El código postal debe tener 5 cifras.")
        || req(f.municipio.trim(), "Escribe el municipio.") || req(f.provincia.trim(), "Escribe la provincia.");
      case 2: return req(f.contacto_nombre.trim(), "Escribe la persona de contacto.") || req(/^\+?[\d\s]{9,15}$/.test(f.telefono.trim()), "El teléfono no es válido.") || req(/\S+@\S+\.\S+/.test(f.email_contacto), "El email de contacto no es válido.");
      case 3: return req(f.gestor_nombre.trim(), "Escribe tu nombre.") || req(/\S+@\S+\.\S+/.test(f.gestor_email), "El email de acceso no es válido.")
        || req(f.password.length >= 10, "La contraseña debe tener al menos 10 caracteres.") || req(f.password === f.password2, "Las contraseñas no coinciden.");
      case 4: return req(f.acepta_condiciones, "Debes aceptar las condiciones del servicio.");
      default: return "";
    }
  }
  function siguiente() {
    const e = validar();
    setError(e);
    if (!e) { setPaso((p) => p + 1); window.scrollTo(0, 0); }
  }

  async function pagar() {
    const e = validar();
    if (e) return setError(e);
    setEnviando(true);
    setError("");
    try {
      const { password2, ...datos } = f;
      void password2;
      const { url } = await api.post("/alta", { ...datos, num_empleados: Number(f.num_empleados), email_facturacion: f.email_facturacion.trim() });
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      const campo = err.datos?.campo;
      const p = CAMPOS_PASO.findIndex((l) => l.includes(campo));
      if (p >= 0) setPaso(p);
      setEnviando(false);
    }
  }

  const input = (k, etq, props = {}) => (
    <Campo etiqueta={etq} id={`a-${k}`} ayuda={props.ayuda}>
      <input id={`a-${k}`} className="entrada" value={f[k]} onChange={(e) => c({ [k]: e.target.value })} {...props} ayuda={undefined} />
    </Campo>
  );

  return (
    <main className="acceso" style={{ justifyContent: "flex-start", paddingTop: 32, maxWidth: 520 }}>
      <div className="marca">
        <img src="/icono.svg" alt="" />
        <div><h1>Alta de tu obrador</h1><p className="suave">Registro y trazabilidad desde el móvil</p></div>
      </div>
      <div className="pila">
        <div className="pasos" aria-hidden>{PASOS.map((p, i) => <span key={p} className={i <= paso ? "hecho" : ""} />)}</div>
        <div className="paso-titulo"><span className="suave pequeno">Paso {paso + 1} de {PASOS.length}</span><h2>{PASOS[paso]}</h2></div>

        {paso === 0 && (
          <>
            {input("nombre", "Nombre comercial", { autoFocus: true })}
            <Opciones etiqueta="Tipo de obrador" valor={f.sector} onCambio={(v) => c({ sector: v })}
              opciones={Object.entries(SECTORES).map(([valor, texto]) => ({ valor, texto }))} />
            {input("num_empleados", "Personas que trabajan en el obrador", { inputMode: "numeric" })}
            {input("registro_sanitario", "Nº de registro sanitario (opcional)")}
          </>
        )}
        {paso === 1 && (
          <>
            <p className="suave">Datos que aparecerán en tus facturas.</p>
            {input("razon_social", "Razón social o nombre del titular", { autoComplete: "organization" })}
            {input("cif", "CIF / NIF", { autoCapitalize: "characters" })}
            {input("direccion_fiscal", "Dirección fiscal", { autoComplete: "street-address" })}
            <div className="dos-columnas">
              {input("codigo_postal", "Código postal", { inputMode: "numeric", autoComplete: "postal-code" })}
              {input("municipio", "Municipio", { autoComplete: "address-level2" })}
            </div>
            {input("provincia", "Provincia", { autoComplete: "address-level1" })}
            {input("email_facturacion", "Email para recibir las facturas (opcional)", { type: "email", inputMode: "email", ayuda: "Si lo dejas vacío, se enviarán al email de contacto." })}
          </>
        )}
        {paso === 2 && (
          <>
            {input("contacto_nombre", "Persona de contacto", { autoComplete: "name" })}
            {input("telefono", "Teléfono", { type: "tel", inputMode: "tel", autoComplete: "tel" })}
            {input("email_contacto", "Email de contacto", { type: "email", inputMode: "email", autoComplete: "email" })}
          </>
        )}
        {paso === 3 && (
          <>
            <p className="suave">Serás el gestor del obrador, con acceso completo. Después podrás dar de alta a tu equipo.</p>
            {input("gestor_nombre", "Tu nombre", { autoComplete: "name" })}
            {input("gestor_email", "Email para entrar", { type: "email", inputMode: "email", autoComplete: "username", autoCapitalize: "none" })}
            {input("password", "Contraseña", { type: "password", autoComplete: "new-password", ayuda: "Al menos 10 caracteres." })}
            {input("password2", "Repite la contraseña", { type: "password", autoComplete: "new-password" })}
          </>
        )}
        {paso === 4 && (
          <>
            <div className="opciones anchas" role="radiogroup" aria-label="Plan">
              <button type="button" role="radio" className="opcion" aria-checked={opcionPlan === "basico_mensual"} onClick={() => c({ plan: "basico", periodicidad: "mensual" })}>
                <span className="fila entre"><strong>Básico mensual</strong><span className="numero">{euros(plan.basico)} / mes</span></span>
                <span className="desc">Sin permanencia. Se cobra cada mes.</span>
              </button>
              <button type="button" role="radio" className="opcion" aria-checked={opcionPlan === "basico_anual"} onClick={() => c({ plan: "basico", periodicidad: "anual" })}>
                <span className="fila entre"><strong>Básico anual</strong><span className="numero">{euros(plan.basicoAnual)} / año</span></span>
                <span className="desc"><span className="distintivo verde">2 meses gratis</span> Pagas 10 meses y usas 12.</span>
              </button>
              <button type="button" role="radio" className="opcion" disabled={!plan.completoDisponible} aria-checked={opcionPlan === "completo"}
                onClick={() => plan.completoDisponible && c({ plan: "completo", periodicidad: "anual" })} style={!plan.completoDisponible ? { opacity: 0.6, cursor: "not-allowed" } : undefined}>
                <span className="fila entre"><strong>Completo anual</strong><span className="numero">{euros(plan.completoAnual)} / año</span></span>
                <span className="desc">
                  <span className="distintivo verde">3 meses gratis</span> Todo incluido: básico + escandallos, precios y lectura de fichas por IA + registros APPCC de temperatura.
                  {!plan.completoDisponible && <> <span className="distintivo">Próximamente</span></>}
                </span>
              </button>
            </div>
            <div className="panel pila">
              <div className="fila entre"><strong>{completo ? "Plan completo" : "Plan básico"}</strong><span className="numero">{euros(base)} / {sufijo}</span></div>
              <p className="suave pequeno">Gestor y 1 usuario más (jefe de producción, operario u observador), con productos, entradas de mercancía, producción intermedia, producto final y trazabilidad{completo ? ", más escandallos, precios, lectura de fichas por IA y registros de temperatura" : ""}.</p>
              <div className="fila entre">
                <div><strong>Usuarios extra</strong><div className="suave pequeno">{euros(extra)} / {sufijo} cada uno{anual ? " (2 meses gratis)" : ""}</div></div>
                <div className="fila">
                  <button type="button" className="boton-icono" aria-label="Quitar un usuario" onClick={() => c({ usuarios_extra: Math.max(0, f.usuarios_extra - 1) })}><Minus size={20} /></button>
                  <strong className="numero" aria-live="polite" style={{ minWidth: 24, textAlign: "center" }}>{f.usuarios_extra}</strong>
                  <button type="button" className="boton-icono" aria-label="Añadir un usuario" onClick={() => c({ usuarios_extra: Math.min(50, f.usuarios_extra + 1) })}><Plus size={20} /></button>
                </div>
              </div>
              <div className="fila entre" style={{ borderTop: "1px solid var(--linea)", paddingTop: 12 }}>
                <strong>Total</strong><strong className="numero">{euros(total)} / {sufijo} + impuestos</strong>
              </div>
              {anual && <p className="suave pequeno">Equivale a {euros(total / 12)} al mes. Ahorras {euros(sinDescuento - total)} al año frente a pagar mes a mes.</p>}
            </div>
            <div className="campo">
              <span style={{ fontWeight: 700 }}>Forma de pago</span>
              <div className="opciones anchas" role="radiogroup" aria-label="Forma de pago">
                <button type="button" role="radio" className="opcion" aria-checked={f.metodo === "sepa_debit"} onClick={() => c({ metodo: "sepa_debit" })}>
                  <span><Landmark size={18} aria-hidden style={{ verticalAlign: "-3px" }} /> Domiciliación bancaria</span>
                  <span className="desc">Con tu IBAN. Acceso inmediato; el cargo se confirma en unos días.</span>
                </button>
                <button type="button" role="radio" className="opcion" aria-checked={f.metodo === "card"} onClick={() => c({ metodo: "card" })}>
                  <span><CreditCard size={18} aria-hidden style={{ verticalAlign: "-3px" }} /> Tarjeta</span>
                  <span className="desc">Activación inmediata.</span>
                </button>
              </div>
              <span className="ayuda">{anual ? "Se cobra una vez al año" : "Se cobra cada mes"}, de forma automática. Los datos bancarios se introducen en la página segura de nuestro procesador de pagos (Stripe); no los guardamos nosotros.</span>
            </div>
            <label className="fila" style={{ alignItems: "flex-start", cursor: "pointer" }}>
              <input type="checkbox" checked={f.acepta_condiciones} onChange={(e) => c({ acepta_condiciones: e.target.checked })} style={{ width: 24, height: 24, marginTop: 2 }} />
              <span>Acepto las condiciones del servicio y la política de privacidad, y el contrato de encargo del tratamiento de datos.</span>
            </label>
          </>
        )}

        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="fila">
          {paso > 0 && <button className="boton grande" onClick={() => { setError(""); setPaso((p) => p - 1); }}>Atrás</button>}
          {paso < 4 ? (
            <button className="boton principal grande" style={{ flex: 1 }} onClick={siguiente}>Siguiente <ChevronRight size={22} aria-hidden /></button>
          ) : (
            <button className="boton principal grande" style={{ flex: 1 }} onClick={pagar} disabled={enviando}>{enviando ? "Abriendo el pago…" : "Ir al pago seguro"}</button>
          )}
        </div>
        <p className="suave pequeno">¿Ya tienes cuenta? <a href="/">Entrar</a></p>
      </div>
    </main>
  );
}

function AltaCompletada() {
  const simulado = new URLSearchParams(window.location.search).has("simulado");
  return (
    <main className="acceso">
      <CheckCircle2 size={48} aria-hidden style={{ color: "var(--verde)" }} />
      <h1>¡Gracias! Alta recibida</h1>
      <p>
        {simulado
          ? "Pago simulado (entorno de pruebas): la cuenta ya está activa."
          : "En unos segundos la cuenta queda activa y te enviamos un correo con los datos de tu contratación. Con tarjeta recibirás la factura al momento; con domiciliación, cuando el banco confirme el cargo (unos días), pero puedes empezar a usar la app ya."}
      </p>
      <a className="boton principal grande bloque" href="/">Entrar en la app</a>
    </main>
  );
}
