-- =====================================================================
-- 011 · Conservación de cada lote y objetivos de congelación propios
--   Un mismo producto puede guardarse refrigerado o congelado: cada lote
--   indica cómo se conserva (si no lo indica, la del producto). Si se
--   congela, se pide el control de congelación con su propio objetivo.
-- =====================================================================
ALTER TABLE preparados   ADD COLUMN conservacion text CHECK (conservacion IN ('ambiente', 'refrigerado', 'congelado'));
ALTER TABLE producciones ADD COLUMN conservacion text CHECK (conservacion IN ('ambiente', 'refrigerado', 'congelado'));

ALTER TABLE productos
  ADD COLUMN congelacion_temp_max    numeric(5,1) NOT NULL DEFAULT -18,
  ADD COLUMN congelacion_minutos_max int NOT NULL DEFAULT 240 CHECK (congelacion_minutos_max > 0);

-- La migración 009 guardó la congelación en los objetivos de abatimiento: se separan.
UPDATE productos
   SET congelacion_temp_max = abatimiento_temp_max,
       congelacion_minutos_max = COALESCE(abatimiento_minutos_max, 240),
       abatimiento_temp_max = CASE WHEN proceso_termico THEN 10 ELSE NULL END,
       abatimiento_minutos_max = CASE WHEN proceso_termico THEN 120 ELSE NULL END
 WHERE abatimiento_temp_max < 0;
