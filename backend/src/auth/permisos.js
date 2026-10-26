// Qué puede hacer cada rol. Un único sitio para cambiarlo.
//
//  ver          consultar registros
//  registrar    dar de alta recepciones, preparados, producciones
//  editar       modificar un registro ya guardado
//  borrar       eliminar registros
//  catalogo     productos, marcas, proveedores
//  stock        ajustes manuales de stock
//  usuarios     gestionar el equipo
//  obrador      datos del obrador y suscripción
//  exportar     descargas de datos
export const ROLES = ["gestor", "jefe_produccion", "operario", "observador"];
export const ROLES_ASIGNABLES = ["jefe_produccion", "operario", "observador"]; // el gestor es único

const PERMISOS = {
  gestor: ["ver", "registrar", "editar", "borrar", "catalogo", "stock", "usuarios", "obrador", "exportar"],
  jefe_produccion: ["ver", "registrar", "editar", "exportar"],
  operario: ["ver", "registrar"],
  observador: ["ver"],
};

export function puede(rol, permiso) {
  return (PERMISOS[rol] || []).includes(permiso);
}

export function permisosDe(rol) {
  return [...(PERMISOS[rol] || [])];
}

export const NOMBRE_ROL = {
  gestor: "Gestor",
  jefe_produccion: "Jefe de producción",
  operario: "Operario",
  observador: "Observador",
};
