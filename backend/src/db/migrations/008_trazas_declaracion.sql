-- =====================================================================
-- 008 · Trazas de alérgenos y lista de ingredientes de cada lote
-- =====================================================================
-- Trazas ("puede contener"), aparte de los alérgenos que contiene.
ALTER TABLE marcas    ADD COLUMN trazas text[] NOT NULL DEFAULT '{}';
ALTER TABLE productos ADD COLUMN trazas text[] NOT NULL DEFAULT '{}';

-- Lista de ingredientes de un lote elaborado. NULL = se genera sola a
-- partir de los ingredientes usados; con texto = la ha ajustado alguien.
ALTER TABLE preparados   ADD COLUMN declaracion_ingredientes text;
ALTER TABLE producciones ADD COLUMN declaracion_ingredientes text;
