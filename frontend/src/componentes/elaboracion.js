// Producción: un único apartado con dos tipos de lote.
//  · Interna (tabla preparados): se elabora para usarla como ingrediente
//    (un sofrito, una salsa, una crema pastelera…).
//  · Final (tabla producciones): lo que se vende.
export const ELABORACION = {
  intermedia: {
    clave: "intermedia",
    api: "/preparados",
    ruta: "/produccion",
    rutaFicha: "/produccion/i",
    lista: "preparados",
    uno: "preparado",
    tipoProducto: "preparado",
    interna: true,
    titulo: "Producción interna",
    corto: "Interna",
    conStock: true,
    conUnidades: true,
  },
  final: {
    clave: "final",
    api: "/producciones",
    ruta: "/produccion",
    rutaFicha: "/produccion/f",
    lista: "producciones",
    uno: "produccion",
    tipoProducto: "elaborado",
    interna: false,
    titulo: "Producción final",
    corto: "Final",
    conStock: false,
    conUnidades: true,
  },
};

/** Ruta de la ficha de un lote según de dónde venga. */
export function rutaLote(origen, id) {
  if (origen === "recepcion") return `/entradas/${id}`;
  if (origen === "preparado" || origen === "intermedia") return `/produccion/i/${id}`;
  if (origen === "produccion" || origen === "final") return `/produccion/f/${id}`;
  return null;
}
