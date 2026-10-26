// Alta manual de un obrador ya activo, sin pasar por el pago (p. ej. el
// obrador de pruebas o un cliente con condiciones especiales).
// Uso:
//   npm run crear-obrador -- --nombre "Obrador de pruebas" --email gestor@ejemplo.com --gestor "Nombre Apellido"
import { parseArgs } from "node:util";
import { migrar } from "../db/migrate.js";
import { pool } from "../db/pool.js";
import { crearObrador } from "../lib/obradores.js";

const { values } = parseArgs({
  options: {
    nombre: { type: "string" },
    email: { type: "string" },
    gestor: { type: "string" },
  },
});

if (!values.nombre || !values.email || !values.gestor) {
  console.error('Uso: npm run crear-obrador -- --nombre "Obrador" --email gestor@ejemplo.com --gestor "Nombre"');
  process.exit(1);
}

try {
  await migrar({ silencioso: true });
  const r = await crearObrador({
    nombre: values.nombre,
    gestorEmail: values.email,
    gestorNombre: values.gestor,
  });
  console.log(`\nObrador creado: ${r.obrador.nombre} (${r.obrador.id})`);
  console.log(`Gestor: ${r.gestor.email}`);
  console.log(`Contraseña temporal (se pedirá cambiarla al entrar): ${r.passwordTemporal}\n`);
} catch (err) {
  console.error(err.code === "23505" ? "Ya existe un usuario con ese email." : err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
