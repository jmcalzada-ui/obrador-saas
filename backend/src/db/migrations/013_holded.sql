-- =====================================================================
-- 013 · Exportar salidas a Holded (pedidos de venta)
--   · Clientes: razón social y NIF obligatorios (el NIF es el que enlaza
--     con el contacto en Holded) y dirección completa.
--   · Productos: SKU (código del producto en Holded) y precio de venta.
--   · Líneas de salida: precio por unidad (opcional).
--   · Obrador: impuesto que se pone en el Excel (IGIC o IVA y su %).
-- =====================================================================
ALTER TABLE clientes
  ADD COLUMN poblacion     text,
  ADD COLUMN codigo_postal text,
  ADD COLUMN provincia     text,
  ADD COLUMN pais          text NOT NULL DEFAULT 'España';
CREATE UNIQUE INDEX clientes_nif_unico ON clientes (obrador_id, upper(cif)) WHERE cif IS NOT NULL AND cif <> '';

ALTER TABLE productos
  ADD COLUMN sku          text,
  ADD COLUMN precio_venta numeric(12,4) CHECK (precio_venta >= 0);

ALTER TABLE salida_lineas ADD COLUMN precio numeric(12,4) CHECK (precio >= 0);

ALTER TABLE obradores
  ADD COLUMN impuesto_tipo text NOT NULL DEFAULT 'IGIC' CHECK (impuesto_tipo IN ('IGIC', 'IVA')),
  ADD COLUMN impuesto_pct  numeric(5,2) CHECK (impuesto_pct >= 0 AND impuesto_pct <= 30);
