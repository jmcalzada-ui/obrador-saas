-- =====================================================================
-- 009 · Congelación de las producciones que se conservan congeladas
--   El abatimiento de un producto congelado es la congelación: se usan las
--   mismas casillas (temperatura y hora al entrar y al llegar al objetivo)
--   con su propio objetivo, por defecto −18 °C en 4 horas como máximo.
-- =====================================================================
UPDATE productos
   SET abatimiento_temp_max = -18,
       abatimiento_minutos_max = CASE WHEN abatimiento_minutos_max IS NULL OR abatimiento_minutos_max = 120 THEN 240 ELSE abatimiento_minutos_max END
 WHERE tipo IN ('preparado', 'elaborado') AND conservacion = 'congelado'
   AND (abatimiento_temp_max IS NULL OR abatimiento_temp_max > -10);
