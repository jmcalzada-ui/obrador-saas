-- =====================================================================
-- 006 · Producto final: mismas casillas que la producción intermedia
--       (caducidad, proceso térmico, medida correctora) más las unidades
--       o envases obtenidos.
-- =====================================================================
ALTER TABLE producciones
  ADD COLUMN caducidad          date,
  ADD COLUMN coccion_temp       numeric(5,1),
  ADD COLUMN coccion_minutos    int CHECK (coccion_minutos >= 0),
  ADD COLUMN abat_temp_inicio   numeric(5,1),
  ADD COLUMN abat_hora_inicio   timestamptz,
  ADD COLUMN abat_temp_fin      numeric(5,1),
  ADD COLUMN abat_hora_fin      timestamptz,
  ADD COLUMN medida_correctora  text NOT NULL DEFAULT '',
  ADD COLUMN activo             boolean NOT NULL DEFAULT true,
  ADD CONSTRAINT prod_abat_orden CHECK (abat_hora_fin IS NULL OR abat_hora_inicio IS NULL OR abat_hora_fin >= abat_hora_inicio);

UPDATE producciones SET cantidad = 1, unidad = 'ud' WHERE cantidad IS NULL;
ALTER TABLE producciones ALTER COLUMN cantidad SET NOT NULL, ALTER COLUMN unidad SET NOT NULL;
CREATE UNIQUE INDEX producciones_lote_unico ON producciones (obrador_id, num_lote);
