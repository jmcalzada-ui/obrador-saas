import pg from "pg";
import { config } from "../config.js";

// Los campos numeric llegan como texto; para cantidades de obrador
// (3 decimales) un number de JavaScript basta.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// Las fechas sin hora (date) se devuelven tal cual, "2026-10-26", sin
// convertirlas a Date (evita que salgan con un día menos por la zona horaria).
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.DB_POOL_MAX) || 10,
  ssl: config.produccion && !/localhost|\.railway\.internal/.test(config.databaseUrl) ? { rejectUnauthorized: false } : false,
});

/**
 * Ejecuta `fn` dentro de una transacción aislada a un obrador.
 * - Cambia al rol app_runtime (sujeto a Row Level Security).
 * - Fija app.obrador_id solo para esta transacción.
 * Todo lo que haga `fn` con `db` queda limitado a ese obrador, aunque
 * una consulta olvide filtrar por obrador_id.
 */
export async function enObrador(obradorId, fn) {
  if (!obradorId) throw new Error("enObrador: falta el obrador.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE app_runtime");
    await client.query("SELECT set_config('app.obrador_id', $1, true)", [obradorId]);
    const resultado = await fn(client);
    await client.query("COMMIT");
    return resultado;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Transacción de sistema (sin restricción de obrador). Solo para tareas
 * que por naturaleza cruzan obradores: login, alta de un obrador nuevo,
 * avisos de Stripe, copias de seguridad. Nunca para peticiones de datos
 * de un usuario.
 */
export async function comoSistema(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const resultado = await fn(client);
    await client.query("COMMIT");
    return resultado;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
