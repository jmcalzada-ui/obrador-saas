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

export const api = {
  get: (r) => peticion("GET", r),
  post: (r, c = {}) => peticion("POST", r, c),
  patch: (r, c) => peticion("PATCH", r, c),
  delete: (r) => peticion("DELETE", r),
};
