import React, { useEffect, useState } from "react";
import { marked } from "marked";
import { ArrowLeft, Printer } from "lucide-react";
import MarcaOC from "../componentes/MarcaOC.jsx";
import avisoLegal from "../legal/aviso-legal.md?raw";
import privacidad from "../legal/privacidad.md?raw";
import condiciones from "../legal/condiciones.md?raw";
import encargo from "../legal/encargo.md?raw";
import cookies from "../legal/cookies.md?raw";

// Páginas legales públicas: /legal/aviso-legal, /legal/privacidad,
// /legal/condiciones, /legal/encargo, /legal/cookies. Los datos del titular
// llegan del servidor (variables de Railway), no están en el código.
export const TEXTOS_LEGALES = [
  { slug: "aviso-legal", titulo: "Aviso legal", md: avisoLegal },
  { slug: "condiciones", titulo: "Condiciones de contratación", md: condiciones },
  { slug: "privacidad", titulo: "Política de privacidad", md: privacidad },
  { slug: "encargo", titulo: "Encargo del tratamiento", md: encargo },
  { slug: "cookies", titulo: "Política de cookies", md: cookies },
];

export function EnlacesLegales({ className = "" }) {
  return (
    <nav className={`enlaces-legales ${className}`} aria-label="Información legal">
      {TEXTOS_LEGALES.map((t) => <a key={t.slug} href={`/legal/${t.slug}`}>{t.titulo}</a>)}
    </nav>
  );
}

export default function Legal() {
  const slug = window.location.pathname.replace(/^\/legal\/?/, "").replace(/\/$/, "") || "aviso-legal";
  const texto = TEXTOS_LEGALES.find((t) => t.slug === slug) || TEXTOS_LEGALES[0];
  const [titular, setTitular] = useState(null);
  useEffect(() => {
    document.title = `${texto.titulo} · Obrador Control`;
    fetch("/api/legal/titular").then((r) => r.json()).then(setTitular).catch(() => setTitular({}));
  }, [texto.titulo]);

  const t = titular || {};
  const md = texto.md
    .replaceAll("{{NOMBRE}}", t.nombre || "…").replaceAll("{{NIF}}", t.nif || "…")
    .replaceAll("{{DOMICILIO}}", t.domicilio || "…").replaceAll("{{EMAIL}}", t.email || "…")
    .replaceAll("{{WEB}}", t.web || "…").replaceAll("{{VERSION}}", t.version || "1.0");

  return (
    <main className="legal">
      <div className="legal-barra no-imprimir">
        <a className="boton" href="/"><ArrowLeft size={18} aria-hidden /> Obrador Control</a>
        <button className="boton" onClick={() => window.print()}><Printer size={18} aria-hidden /> Imprimir o guardar en PDF</button>
      </div>
      {titular ? <article className="legal-texto" dangerouslySetInnerHTML={{ __html: marked.parse(md) }} /> : <p className="suave">Cargando…</p>}
      <EnlacesLegales className="no-imprimir" />
      <MarcaOC className="pie" />
    </main>
  );
}
