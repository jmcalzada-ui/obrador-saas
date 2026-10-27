import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { api, sesion } from "../api.js";
import { Aviso, useSesion, useToast } from "./ui.jsx";

// La imagen está protegida por la sesión: se descarga con el token y se
// guarda en memoria como URL local, una vez por versión del logotipo.
const cache = { id: null, url: null, promesa: null };

/** URL local del logotipo del obrador, o null si no tiene. */
export function useLogo() {
  const { obrador } = useSesion();
  const id = obrador?.logo_id || null;
  const [url, setUrl] = useState(cache.id === id ? cache.url : null);
  useEffect(() => {
    let vivo = true;
    if (!id) { setUrl(null); return; }
    if (cache.id !== id) {
      if (cache.url) URL.revokeObjectURL(cache.url);
      cache.id = id;
      cache.url = null;
      cache.promesa = fetch("/api/obrador/logo", { headers: { Authorization: `Bearer ${sesion.get()}` } })
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => (cache.url = b ? URL.createObjectURL(b) : null))
        .catch(() => null);
    }
    cache.promesa.then((u) => vivo && setUrl(u));
    return () => { vivo = false; };
  }, [id]);
  return url;
}

/** Logotipo del obrador (nada si no tiene). */
export function LogoObrador({ className = "logo-obrador", alto }) {
  const url = useLogo();
  const { obrador } = useSesion();
  if (!url) return null;
  return <img className={className} src={url} alt={`Logotipo de ${obrador.nombre}`} style={alto ? { maxHeight: alto } : undefined} />;
}

/**
 * Convierte cualquier imagen que el navegador sepa abrir (JPEG, PNG, BMP,
 * WebP, GIF…) a PNG de como mucho 800 px de lado. Si el PNG sale muy
 * pesado (p. ej. una foto), se usa JPEG sobre fondo blanco.
 */
async function prepararImagen(archivo) {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("No se ha podido leer la imagen. Prueba con un JPEG o PNG."));
      i.src = url;
    });
    const escala = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.max(1, Math.round(img.naturalWidth * escala));
    lienzo.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = lienzo.getContext("2d");
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    let mime = "image/png";
    let datos = lienzo.toDataURL(mime);
    if (datos.length > 1.3 * 1024 * 1024) {
      const blanco = document.createElement("canvas");
      blanco.width = lienzo.width;
      blanco.height = lienzo.height;
      const c2 = blanco.getContext("2d");
      c2.fillStyle = "#fff";
      c2.fillRect(0, 0, blanco.width, blanco.height);
      c2.drawImage(lienzo, 0, 0);
      mime = "image/jpeg";
      datos = blanco.toDataURL(mime, 0.88);
    }
    return { mime, base64: datos.split(",")[1] };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Casilla para subir, cambiar o quitar el logotipo (gestor). */
export function SubirLogo() {
  const { puede, recargar, obrador } = useSesion();
  const toast = useToast();
  const url = useLogo();
  const entrada = useRef(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const gestor = puede("obrador");

  async function elegir(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setError("");
    if (archivo.size > 15 * 1024 * 1024) return setError("La imagen pesa demasiado (máximo 15 MB).");
    setOcupado(true);
    try {
      const { mime, base64 } = await prepararImagen(archivo);
      await api.put("/obrador/logo", { nombre: archivo.name.replace(/\.[^.]+$/, "") + (mime === "image/png" ? ".png" : ".jpg"), mime_type: mime, base64 });
      await recargar();
      toast("Logotipo guardado");
    } catch (err) { setError(err.message); } finally { setOcupado(false); }
  }

  async function quitar() {
    setOcupado(true);
    try { await api.delete("/obrador/logo"); await recargar(); toast("Logotipo quitado"); }
    catch (err) { setError(err.message); } finally { setOcupado(false); }
  }

  if (!gestor && !url) return null;
  return (
    <section className="panel pila">
      <div className="fila entre">
        <h2>Logotipo de la empresa</h2>
      </div>
      <div className="logo-casilla">
        {url ? <img src={url} alt={`Logotipo de ${obrador.nombre}`} /> : <span className="suave pequeno">Sin logotipo</span>}
      </div>
      {gestor && (
        <>
          <p className="suave pequeno">JPEG, PNG, BMP, WebP o GIF. Sale en la app y en los informes Excel y PDF.</p>
          <input ref={entrada} type="file" accept="image/jpeg,image/png,image/bmp,image/webp,image/gif,.jpg,.jpeg,.png,.bmp,.webp,.gif" hidden onChange={elegir} />
          <div className="fila" style={{ flexWrap: "wrap" }}>
            <button className="boton principal" disabled={ocupado} onClick={() => entrada.current.click()}>
              <ImagePlus size={20} aria-hidden /> {ocupado ? "Guardando…" : url ? "Cambiar logotipo" : "Subir logotipo"}
            </button>
            {url && <button className="boton peligro" disabled={ocupado} onClick={quitar}><Trash2 size={20} aria-hidden /> Quitar</button>}
          </div>
        </>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
    </section>
  );
}
