-- 015 · Constancia de la aceptación de las condiciones del servicio, la
-- política de privacidad y el contrato de encargo del tratamiento en el alta.
ALTER TABLE obradores
  ADD COLUMN IF NOT EXISTS condiciones_version text,
  ADD COLUMN IF NOT EXISTS condiciones_aceptadas_en timestamptz,
  ADD COLUMN IF NOT EXISTS condiciones_ip text;
