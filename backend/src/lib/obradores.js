import { comoSistema } from "../db/pool.js";
import { hashPassword, passwordTemporal } from "./utiles.js";
import { calcularImporte, MODULOS_COMPLETO } from "./cobros.js";

/**
 * Da de alta un obrador con su suscripción (plan básico) y su gestor.
 *  - Alta pública: estado "pendiente_pago" (sin acceso hasta el primer cobro).
 *  - Alta manual (script / pruebas): estado "activo" directamente.
 * Si no se indica contraseña, se genera una temporal (solo se ve esta vez)
 * y se pedirá cambiarla al entrar.
 */
export async function crearObrador({
  nombre, gestorEmail, gestorNombre, password,
  estado = "activo", datos = {}, usuariosExtra = 0, periodicidad = "mensual", plan = "basico",
}) {
  const importe = calcularImporte({ plan, usuarios_extra: usuariosExtra, periodicidad });
  const pass = password || passwordTemporal();
  const hash = await hashPassword(pass);
  return comoSistema(async (db) => {
    const { rows: [obrador] } = await db.query(
      `INSERT INTO obradores (nombre, estado, email_contacto, razon_social, cif, registro_sanitario, sector, num_empleados,
                              direccion_fiscal, codigo_postal, municipio, provincia, pais, contacto_nombre, telefono, email_facturacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13,'ES'),$14,$15,$16)
       RETURNING id, nombre, estado`,
      [nombre, estado, datos.email_contacto || gestorEmail, datos.razon_social, datos.cif, datos.registro_sanitario,
       datos.sector, datos.num_empleados, datos.direccion_fiscal, datos.codigo_postal, datos.municipio, datos.provincia,
       datos.pais, datos.contacto_nombre, datos.telefono, datos.email_facturacion]
    );
    const activo = estado === "activo";
    await db.query(
      `INSERT INTO suscripciones (obrador_id, plan, modulos, estado, usuarios_extra, periodicidad, importe_periodo, importe_mensual, contratado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [obrador.id, importe.plan, importe.plan === "completo" ? MODULOS_COMPLETO : [], activo ? "activa" : "pendiente_pago",
       usuariosExtra, importe.periodicidad, importe.periodo, importe.mensual, activo ? new Date() : null]
    );
    const { rows: [gestor] } = await db.query(
      `INSERT INTO usuarios (obrador_id, email, nombre, password_hash, rol, debe_cambiar_password)
       VALUES ($1, lower($2), $3, $4, 'gestor', $5)
       RETURNING id, email, nombre, rol`,
      [obrador.id, gestorEmail, gestorNombre, hash, !password]
    );
    return { obrador, gestor, passwordTemporal: pass };
  });
}
