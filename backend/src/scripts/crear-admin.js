// Crea el administrador principal del back office (o uno adicional).
// Uso:
//   npm run crear-admin -- --email tu@email.com --nombre "Tu nombre" [--principal]
import { parseArgs } from "node:util";
import { migrar } from "../db/migrate.js";
import { pool } from "../db/pool.js";
import { hashPassword, passwordTemporal } from "../lib/utiles.js";

const { values } = parseArgs({
  options: { email: { type: "string" }, nombre: { type: "string" }, principal: { type: "boolean", default: false } },
});
if (!values.email || !values.nombre) {
  console.error('Uso: npm run crear-admin -- --email tu@email.com --nombre "Tu nombre" [--principal]');
  process.exit(1);
}
try {
  await migrar({ silencioso: true });
  const pass = passwordTemporal(16);
  await pool.query("INSERT INTO admins (email, nombre, password_hash, rol) VALUES (lower($1), $2, $3, $4)", [
    values.email, values.nombre, await hashPassword(pass), values.principal ? "superadmin" : "admin",
  ]);
  console.log(`\nAdministrador creado: ${values.email} (${values.principal ? "principal" : "admin"})`);
  console.log(`Contraseña: ${pass}\nCámbiala al entrar en /admin.\n`);
} catch (e) {
  console.error(e.code === "23505" ? "Ya existe un administrador con ese email." : e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
