// Producción intermedia y producto final comparten pantallas: esto es lo que cambia.
export const ELABORACION = {
  intermedia: {
    clave: "intermedia",
    api: "/preparados",
    ruta: "/intermedia",
    lista: "preparados",
    uno: "preparado",
    tipoProducto: "preparado",
    titulo: "Producción intermedia",
    corto: "Intermedia",
    singular: "producción intermedia",
    nuevoTitulo: "Nueva producción intermedia",
    detalleTitulo: "Producción intermedia",
    pregunta: "¿Qué vas a elaborar?",
    placeholder: "Nombre, p. ej. Sofrito, Crema pastelera",
    crear: (t) => `Crear «${t}» como producción intermedia`,
    primera: "Es tu primera producción intermedia. Escribe su nombre: quedará guardado para las próximas veces.",
    botonNuevo: "Registrar producción intermedia",
    guardado: "Producción intermedia registrada",
    conStock: true,
    conUnidades: false,
  },
  final: {
    clave: "final",
    api: "/producciones",
    ruta: "/final",
    lista: "producciones",
    uno: "produccion",
    tipoProducto: "elaborado",
    titulo: "Producto final",
    corto: "Final",
    singular: "producto final",
    nuevoTitulo: "Nuevo producto final",
    detalleTitulo: "Producto final",
    pregunta: "¿Qué producto final vas a elaborar?",
    placeholder: "Nombre, p. ej. Croquetas de jamón, Tarta de queso",
    crear: (t) => `Crear el producto final «${t}»`,
    primera: "Es tu primer producto final. Escribe su nombre: quedará guardado para las próximas veces.",
    botonNuevo: "Registrar producto final",
    guardado: "Producto final registrado",
    conStock: false,
    conUnidades: true,
  },
};

/** Ruta de la ficha de un lote según de dónde venga. */
export function rutaLote(origen, id) {
  if (origen === "recepcion") return `/entradas/${id}`;
  if (origen === "preparado") return `/intermedia/${id}`;
  if (origen === "produccion") return `/final/${id}`;
  return null;
}
