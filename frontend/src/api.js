// Cliente de la API. El token de sesión se guarda en el dispositivo.
const CLAVE = "obrador-sesion";

export const sesion = {
  get: () => { try { return localStorage.getItem(CLAVE); } catch { return null; } },
  set: (t) => { try { t ? localStorage.setItem(CLAVE, t) : localStorage.removeItem(CLAVE); } catch { /* modo privado */ } },
};

export class ErrorApi extends Error {
  constructor(mensaje, status, datos) {
    super(mensaje);
    this.status = status;
    this.datos = datos;
  }
}

async function peticion(metodo, ruta, cuerpo) {
  const token = sesion.get();
  let res;
  try {
    res = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: {
        ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi("Sin conexión. Comprueba la cobertura o el wifi y vuelve a intentarlo.", 0);
  }
  if (res.status === 401 && token) {
    sesion.set(null);
    window.dispatchEvent(new Event("sesion-caducada"));
  }
  const datos = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ErrorApi(datos?.error || `Error ${res.status}`, res.status, datos);
  return datos;
}

/** Descarga un archivo protegido (p. ej. una ficha técnica) y lo abre en otra pestaña. */
async function abrirArchivo(ruta) {
  const ventana = window.open("", "_blank");
  const res = await fetch(`/api${ruta}`, { headers: { Authorization: `Bearer ${sesion.get()}` } });
  if (!res.ok) {
    ventana?.close();
    const d = await res.json().catch(() => null);
    throw new ErrorApi(d?.error || "No se pudo abrir el archivo.", res.status);
  }
  const url = URL.createObjectURL(await res.blob());
  if (ventana) ventana.location.href = url;
  else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Lee un archivo elegido por el usuario como base64 (sin el prefijo data:). */
export function leerBase64(archivo) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("No se pudo leer el archivo."));
    r.readAsDataURL(archivo);
  });
}

export const api = {
  abrirArchivo,
  put: (r, c) => peticion("PUT", r, c),
  get: (r) => peticion("GET", r),
  post: (r, c = {}) => peticion("POST", r, c),
  patch: (r, c) => peticion("PATCH", r, c),
  delete: (r) => peticion("DELETE", r),
};
