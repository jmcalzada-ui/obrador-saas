// Aplica, en orden y una sola vez, los archivos de src/db/migrations.
// Se ejecuta en cada despliegue antes de arrancar el servidor.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export async function migrar({ silencioso = false } = {}) {
  const client = await pool.connect();
  try {
    // Evita que dos instancias migren a la vez.
    await client.query("SELECT pg_advisory_lock(727001)");
    await client.query(`CREATE TABLE IF NOT EXISTS migraciones (
      nombre text PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await client.query("SELECT nombre FROM migraciones");
    const hechas = new Set(rows.map((r) => r.nombre));
    const archivos = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const archivo of archivos) {
      if (hechas.has(archivo)) continue;
      const sql = fs.readFileSync(path.join(dir, archivo), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO migraciones (nombre) VALUES ($1)", [archivo]);
        await client.query("COMMIT");
        if (!silencioso) console.log(`[migrar] aplicada ${archivo}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Fallo en la migración ${archivo}: ${err.message}`);
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(727001)").catch(() => {});
    client.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrar()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
