-- =====================================================================
-- 004 · Pago mensual o anual (20 % de descuento) y activación al aceptar
--       la domiciliación SEPA
-- =====================================================================
ALTER TABLE suscripciones
  ADD COLUMN periodicidad    text NOT NULL DEFAULT 'mensual' CHECK (periodicidad IN ('mensual', 'anual')),
  ADD COLUMN importe_periodo numeric(10,2),             -- lo que se cobra cada mes o cada año, sin impuestos
  ADD COLUMN activado_por_mandato boolean NOT NULL DEFAULT false;  -- acceso dado al aceptar el mandato SEPA, antes del primer cobro

COMMENT ON COLUMN suscripciones.importe_mensual IS 'Equivalente mensual sin impuestos (en anual, el importe anual / 12)';

UPDATE suscripciones SET importe_periodo = importe_mensual WHERE importe_periodo IS NULL;
