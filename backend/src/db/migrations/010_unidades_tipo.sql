-- =====================================================================
-- 010 · Unidades obtenidas con su tipo (cajas, bandejas, unidades…),
--       en la producción final y también en la interna.
-- =====================================================================
ALTER TABLE producciones ADD COLUMN unidades_tipo text NOT NULL DEFAULT '';
ALTER TABLE preparados
  ADD COLUMN unidades      int CHECK (unidades >= 0),
  ADD COLUMN unidades_tipo text NOT NULL DEFAULT '';
