// Prepara una base de datos de pruebas limpia y dos obradores ficticios.
// Usa TEST_DATABASE_URL (por defecto, la base local obrador_test).
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgres://dev:dev@localhost:5432/obrador_test";
process.env.LOGIN_LIMIT = "1000";

const { pool } = await import("../src/db/pool.js");
const { migrar } = await import("../src/db/migrate.js");
const { crearApp } = await import("../src/app.js");
const { crearObrador } = await import("../src/lib/obradores.js");
const request = (await import("supertest")).default;

export { pool, request };

export async function baseLimpia() {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrar({ silencioso: true });
}

export const app = crearApp();

let n = 0;
/** Crea un obrador con su gestor y devuelve un agente con sesión iniciada. */
export async function nuevoObrador(nombre) {
  n += 1;
  const email = `gestor${n}-${Date.now()}@prueba.test`;
  const password = "contraseña-de-prueba";
  const r = await crearObrador({ nombre, gestorEmail: email, gestorNombre: `Gestor ${nombre}`, password });
  const token = await login(email, password);
  return { ...r, email, token, api: cliente(token) };
}

export async function login(email, password) {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`login falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

/** Pequeño cliente con el token ya puesto: api.get(url), api.post(url, body)… */
export function cliente(token) {
  const auth = (r) => r.set("Authorization", `Bearer ${token}`);
  return {
    get: (u) => auth(request(app).get(u)),
    post: (u, b) => auth(request(app).post(u)).send(b ?? {}),
    patch: (u, b) => auth(request(app).patch(u)).send(b ?? {}),
    delete: (u) => auth(request(app).delete(u)),
  };
}
