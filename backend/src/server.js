import { crearApp } from "./app.js";
import { migrar } from "./db/migrate.js";
import { config } from "./config.js";
import { programarRevisionImpagos } from "./lib/cobros.js";

await migrar();
programarRevisionImpagos();
crearApp().listen(config.port, () => {
  console.log(`[servidor] escuchando en el puerto ${config.port}`);
});
