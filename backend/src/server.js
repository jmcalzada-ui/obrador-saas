import crypto from "node:crypto";
import { crearApp } from "./app.js";
import { migrar } from "./db/migrate.js";
import { config } from "./config.js";
import { programarRevisionImpagos } from "./lib/cobros.js";
import { pool } from "./db/pool.js";
import { hashPassword } from "./lib/utiles.js";

// Clave para firmar las sesiones: la de JWT_SECRET o, si no existe, una
// aleatoria generada la primera vez y guardada en la base de datos.
async function asegurarClaveSesiones() {
  if (config.jwtSecret) return;
  const nueva = crypto.randomBytes(48).toString("base64url");
  await pool.query("INSERT INTO ajustes_sistema (clave, valor) VALUES ('jwt_secret', $1) ON CONFLICT (clave) DO NOTHING", [nueva]);
  const { rows } = await pool.query("SELECT valor FROM ajustes_sistema WHERE clave = 'jwt_secret'");
  config.jwtSecret = rows[0].valor;
}

// Primer arranque: si no hay ningún administrador y se han definido
// ADMIN_INICIAL_EMAIL y ADMIN_INICIAL_PASSWORD, se crea el administrador principal.
async function crearAdminInicial() {
  const email = process.env.ADMIN_INICIAL_EMAIL;
  const password = process.env.ADMIN_INICIAL_PASSWORD;
  if (!email || !password) return;
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM admins");
  if (rows[0].n > 0) return;
  if (password.length < 12) return console.warn("[admin] ADMIN_INICIAL_PASSWORD debe tener al menos 12 caracteres.");
  await pool.query("INSERT INTO admins (email, nombre, password_hash, rol) VALUES (lower($1), $2, $3, 'superadmin')", [
    email, process.env.ADMIN_INICIAL_NOMBRE || "Administrador", await hashPassword(password),
  ]);
  console.log(`[admin] administrador principal creado: ${email}`);
}

await migrar();
await asegurarClaveSesiones();
await crearAdminInicial();
programarRevisionImpagos();
crearApp().listen(config.port, () => {
  console.log(`[servidor] escuchando en el puerto ${config.port}`);
});
