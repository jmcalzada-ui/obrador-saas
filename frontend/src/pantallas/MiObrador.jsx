import React, { useEffect, useState } from "react";
import { CreditCard, FileText } from "lucide-react";
import { api } from "../api.js";
import { Aviso, Campo, Cargando, useSesion, useToast, fecha, euros } from "../componentes/ui.jsx";
import Cabecera from "../componentes/Cabecera.jsx";

export const SECTORES = {
  carnica: "Industria cárnica", panaderia: "Panadería", pasteleria: "Pastelería", comidas_preparadas: "Comidas preparadas",
  catering: "Catering", heladeria: "Heladería", conservas: "Conservas", otro: "Otro",
};

const GRUPOS = [
  ["Obrador", [["nombre", "Nombre comercial"], ["registro_sanitario", "Nº de registro sanitario"], ["direccion", "Dirección del obrador"]]],
  ["Facturación", [["razon_social", "Razón social"], ["cif", "CIF / NIF"], ["direccion_fiscal", "Dirección fiscal"], ["codigo_postal", "Código postal"], ["municipio", "Municipio"], ["provincia", "Provincia"], ["email_facturacion", "Email para facturas"]]],
  ["Contacto", [["contacto_nombre", "Persona de contacto"], ["email_contacto", "Email de contacto"], ["telefono", "Teléfono"]]],
];
const CAMPOS = GRUPOS.flatMap(([, c]) => c.map(([k]) => k));
const ESTADO_SUSC = { activa: "Al día", impago: "Cobro pendiente", suspendida: "En suspenso", pendiente_pago: "Pendiente del primer pago", cancelada: "Cancelada" };

export default function MiObrador() {
  const { puede, recargar, obrador: sesionObrador } = useSesion();
  const toast = useToast();
  const gestor = puede("obrador");
  const [datos, setDatos] = useState(null);
  const [pagos, setPagos] = useState([]);
  const [f, setF] = useState({});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [abriendo, setAbriendo] = useState(false);

  useEffect(() => {
    api.get("/obrador").then((d) => {
      setDatos(d);
      setF(Object.fromEntries(CAMPOS.map((k) => [k, d.obrador[k] || ""])));
    }).catch((e) => setError(e.message));
    if (gestor) api.get("/obrador/pagos").then((d) => setPagos(d.pagos)).catch(() => {});
  }, [gestor]);

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
    } catch (err) { setError(err.message); } finally { setGuardando(false); }
  }

  async function portal() {
    setAbriendo(true);
    setError("");
    try { window.location.href = (await api.post("/obrador/portal-pago")).url; }
    catch (e) { setError(e.message); setAbriendo(false); }
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
            {gestor && (
              <section className="panel pila">
                <h2>Contratación y pago</h2>
                {sesionObrador.estado === "impago" && (
                  <Aviso tipo="error">El último cobro ha fallado. Actualiza la forma de pago antes del {fecha(sesionObrador.fecha_suspension)}.</Aviso>
                )}
                <dl className="ficha">
                  <dt>Plan</dt><dd>{s.plan === "completo" ? "Completo" : "Básico"}{s.usuarios_extra ? ` + ${s.usuarios_extra} usuario(s) extra` : ""}</dd>
                  <dt>Cuota</dt><dd>{s.importe_periodo != null ? `${euros(s.importe_periodo)} / ${s.periodicidad === "anual" ? `año (${s.plan === "completo" ? 3 : 2} meses gratis)` : "mes"} sin impuestos` : "—"}</dd>
                  <dt>Estado</dt><dd>{ESTADO_SUSC[s.estado] || s.estado}</dd>
                  <dt>Próximo cobro</dt><dd>{fecha(s.proximo_cobro)}</dd>
                  <dt>Forma de pago</dt><dd>{s.metodo_pago_resumen || (s.metodo_pago_tipo === "sepa_debit" ? "Domiciliación bancaria" : s.metodo_pago_tipo === "card" ? "Tarjeta" : "—")}</dd>
                  <dt>Usuarios</dt><dd className="numero">{s.usuarios_activos} de {s.usuarios_incluidos + s.usuarios_extra}</dd>
                  <dt>Cliente desde</dt><dd>{fecha(s.contratado_en)}</dd>
                </dl>
                <button className="boton bloque" onClick={portal} disabled={abriendo}><CreditCard size={20} aria-hidden /> {abriendo ? "Abriendo…" : "Cambiar tarjeta o cuenta bancaria"}</button>
                {pagos.length > 0 && (
                  <>
                    <h3>Facturas</h3>
                    <ul className="lista">
                      {pagos.map((p, i) => (
                        <li key={i}>
                          <div className="item" style={{ cursor: "default" }}>
                            <span className="principal">
                              <strong>{p.numero_factura || "Cobro"} · {euros(p.importe)}</strong>
                              <span className="suave pequeno">{fecha(p.pagado_en || p.fecha)} · {p.estado === "pagado" ? "Pagada" : p.estado === "fallido" ? "Cobro fallido" : p.estado}</span>
                            </span>
                            {p.url_pdf && <a className="boton" href={p.url_pdf} target="_blank" rel="noreferrer"><FileText size={18} aria-hidden /> PDF</a>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}
            <form className="pila" onSubmit={guardar}>
              {GRUPOS.map(([titulo, campos]) => (
                <section key={titulo} className="pila">
                  <h2>{titulo}</h2>
                  {campos.map(([k, etq]) => (
                    <Campo key={k} etiqueta={etq} id={`o-${k}`}>
                      <input id={`o-${k}`} className="entrada" value={f[k]} disabled={!gestor}
                        type={k.startsWith("email") ? "email" : k === "telefono" ? "tel" : "text"}
                        inputMode={k === "codigo_postal" ? "numeric" : undefined}
                        onChange={(e) => setF({ ...f, [k]: e.target.value })} />
                    </Campo>
                  ))}
                </section>
              ))}
              {gestor && (
                <button className="boton principal grande bloque" disabled={guardando || !f.nombre?.trim()}>{guardando ? "Guardando…" : "Guardar datos"}</button>
              )}
            </form>
          </>
        )}
      </main>
    </>
  );
}
