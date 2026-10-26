-- Ajustes internos del servidor (p. ej. la clave con la que se firman las sesiones
-- si no se ha definido JWT_SECRET). app_runtime no tiene acceso a esta tabla.
CREATE TABLE ajustes_sistema (
  clave          text PRIMARY KEY,
  valor          text NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
