-- =====================================================================
-- 012 · Salidas de lotes a clientes (módulo opcional)
--   Para los obradores que no llevan la trazabilidad de salida en su
--   programa de facturación: cada salida es un pedido a un cliente con
--   sus líneas (producto, lote y cantidad). Lo activa el gestor.
-- =====================================================================
ALTER TABLE obradores ADD COLUMN modulo_salidas boolean NOT NULL DEFAULT false;

CREATE TABLE clientes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obrador_id  uuid NOT NULL REFERENCES obradores(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  cif         text,
  contacto    text,
  direccion   text,
  activo      boolean NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obrador_id, id)
);
CREATE UNIQUE INDEX clientes_nombre_unico ON clientes (obrador_id, lower(nombre));

CREATE TABLE salidas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obrador_id      uuid NOT NULL REFERENCES obradores(id) ON DELETE CASCADE,
  fecha           date NOT NULL,
  num_pedido      text NOT NULL,
  cliente_id      uuid NOT NULL,
  observaciones   text NOT NULL DEFAULT '',
  creado_por      uuid,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  modificado_por  uuid,
  modificado_en   timestamptz,
  UNIQUE (obrador_id, id),
  FOREIGN KEY (obrador_id, cliente_id) REFERENCES clientes (obrador_id, id)
);
CREATE UNIQUE INDEX salidas_pedido_unico ON salidas (obrador_id, lower(num_pedido));
CREATE INDEX salidas_obrador_fecha ON salidas (obrador_id, fecha DESC);

-- Cada línea: un lote de producción (final o interna) o un lote anotado a mano.
CREATE TABLE salida_lineas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obrador_id     uuid NOT NULL REFERENCES obradores(id) ON DELETE CASCADE,
  salida_id      uuid NOT NULL,
  producto_id    uuid NOT NULL,
  produccion_id  uuid,
  preparado_id   uuid,
  num_lote       text NOT NULL DEFAULT '',
  cantidad       numeric(12,3) NOT NULL CHECK (cantidad > 0),
  unidad         text NOT NULL DEFAULT '',
  orden          int NOT NULL DEFAULT 0,
  CHECK (NOT (produccion_id IS NOT NULL AND preparado_id IS NOT NULL)),
  FOREIGN KEY (obrador_id, salida_id) REFERENCES salidas (obrador_id, id) ON DELETE CASCADE,
  FOREIGN KEY (obrador_id, producto_id) REFERENCES productos (obrador_id, id),
  -- Un lote que ya ha salido no se puede borrar (se perdería la trazabilidad).
  FOREIGN KEY (obrador_id, produccion_id) REFERENCES producciones (obrador_id, id),
  FOREIGN KEY (obrador_id, preparado_id) REFERENCES preparados (obrador_id, id)
);
CREATE INDEX salida_lineas_salida ON salida_lineas (obrador_id, salida_id);
CREATE INDEX salida_lineas_produccion ON salida_lineas (obrador_id, produccion_id) WHERE produccion_id IS NOT NULL;
CREATE INDEX salida_lineas_preparado ON salida_lineas (obrador_id, preparado_id) WHERE preparado_id IS NOT NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes', 'salidas', 'salida_lineas']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY aislamiento_obrador ON %I USING (obrador_id = obrador_actual()) WITH CHECK (obrador_id = obrador_actual())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_runtime', t);
  END LOOP;
END $$;
