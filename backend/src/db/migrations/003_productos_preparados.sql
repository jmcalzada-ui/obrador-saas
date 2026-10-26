-- =====================================================================
-- 003 · Productos, entrada de mercancía y preparados internos para
--       cualquier tipo de obrador
-- =====================================================================

-- ---------- Productos (nombre general) ----------
-- tipo materia_prima = lo que entra en el obrador (sección Productos)
-- tipo preparado     = elaboración interna con nombre guardado
-- La unidad de medida queda fijada por el producto.
ALTER TABLE productos
  ADD COLUMN categoria                text,
  ADD COLUMN conservacion             text CHECK (conservacion IN ('ambiente', 'refrigerado', 'congelado')),
  -- Preparados internos: si llevan proceso térmico, sus objetivos de control
  ADD COLUMN proceso_termico          boolean,
  ADD COLUMN coccion_temp_min         numeric(5,1),   -- °C en el centro del producto
  ADD COLUMN abatimiento_temp_max     numeric(5,1),   -- °C al terminar el abatimiento
  ADD COLUMN abatimiento_minutos_max  int,            -- tiempo máximo de abatimiento
  ADD COLUMN vida_util_dias           int CHECK (vida_util_dias > 0),
  ADD COLUMN ingredientes_habituales  jsonb NOT NULL DEFAULT '[]';  -- [{producto_id}] de la última elaboración

-- ---------- Marcas (marca particular) ----------
ALTER TABLE marcas
  ADD COLUMN proveedor_id        uuid,
  ADD COLUMN precio_referencia   numeric(12,4) CHECK (precio_referencia >= 0),  -- € por unidad de medida del producto, sin impuestos
  ADD COLUMN precio_ref_fecha    date,
  ADD COLUMN formato             text,   -- p. ej. "saco 25 kg", "caja 6 x 1 l"
  ADD FOREIGN KEY (obrador_id, proveedor_id) REFERENCES proveedores (obrador_id, id) ON DELETE SET NULL (proveedor_id);

-- ---------- Archivos (fichas técnicas en PDF) ----------
-- De momento el contenido se guarda en la propia base (PDF de pocos MB).
-- Si el volumen crece, se moverá a un almacenamiento externo sin cambiar la API.
ALTER TABLE archivos
  ALTER COLUMN clave_almacen DROP NOT NULL,
  ADD COLUMN contenido bytea;

-- ---------- Entrada de mercancía ----------
ALTER TABLE recepciones
  ADD COLUMN bultos              int CHECK (bultos > 0),        -- nº de paquetes / cajas
  ADD COLUMN control_envase      boolean,                       -- envase íntegro y limpio
  ADD COLUMN control_etiquetado  boolean,                       -- etiquetado correcto y legible
  ADD COLUMN control_transporte  boolean;                       -- vehículo y temperatura de transporte adecuados

-- ---------- Preparados internos ----------
ALTER TABLE preparados
  ADD COLUMN caducidad            date,
  ADD COLUMN coccion_temp         numeric(5,1),
  ADD COLUMN coccion_minutos      int CHECK (coccion_minutos >= 0),
  ADD COLUMN abat_temp_inicio     numeric(5,1),
  ADD COLUMN abat_hora_inicio     timestamptz,
  ADD COLUMN abat_temp_fin        numeric(5,1),
  ADD COLUMN abat_hora_fin        timestamptz,
  ADD COLUMN medida_correctora    text NOT NULL DEFAULT '',
  ADD CONSTRAINT abat_orden CHECK (abat_hora_fin IS NULL OR abat_hora_inicio IS NULL OR abat_hora_fin >= abat_hora_inicio);

CREATE UNIQUE INDEX preparados_lote_unico ON preparados (obrador_id, num_lote);

-- La vista de stock incluye la caducidad de los preparados.
CREATE OR REPLACE VIEW stock_lotes WITH (security_invoker = true) AS
SELECT 'recepcion'::text AS origen, r.id, r.obrador_id, r.producto_id, r.num_lote,
       r.fecha, r.caducidad, r.unidad, r.cantidad, r.activo,
       r.cantidad
         - COALESCE((SELECT sum(c.cantidad) FROM consumos c WHERE c.origen_recepcion = r.id), 0)
         + COALESCE((SELECT sum(a.delta) FROM ajustes_stock a WHERE a.origen_recepcion = r.id), 0)
         AS disponible
FROM recepciones r
UNION ALL
SELECT 'preparado'::text, p.id, p.obrador_id, p.producto_id, p.num_lote,
       p.fecha, p.caducidad, p.unidad, p.cantidad, p.activo,
       p.cantidad
         - COALESCE((SELECT sum(c.cantidad) FROM consumos c WHERE c.origen_preparado = p.id), 0)
         + COALESCE((SELECT sum(a.delta) FROM ajustes_stock a WHERE a.origen_preparado = p.id), 0)
FROM preparados p;
GRANT SELECT ON stock_lotes TO app_runtime;
