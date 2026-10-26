import { crearApp } from "./app.js";
import { migrar } from "./db/migrate.js";
import { config } from "./config.js";

await migrar();
crearApp().listen(config.port, () => {
  console.log(`[servidor] escuchando en el puerto ${config.port}`);
});
