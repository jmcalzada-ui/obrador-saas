-- =====================================================================
-- 001 · Base multiobrador
--
-- Todas las tablas con datos de un obrador llevan obrador_id y están
-- protegidas con Row Level Security (RLS). La API ejecuta cada petición
-- con el rol "app_runtime" (sin privilegios especiales) y con la
-- variable de sesión app.obrador_id fijada al obrador del usuario.
-- Postgres solo devuelve y solo acepta filas de ese obrador, aunque el
-- código olvide filtrar.
--
-- Las referencias entre tablas usan claves compuestas (obrador_id, id),
-- así es imposible enlazar un registro con un producto o lote de otro
-- obrador.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

-- Obrador actual de la transacción (NULL si no se ha fijado → no ve nada).
CREATE OR REPLACE FUNCTION obrador_actual() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.obrador_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------
-- Obradores (clientes) y su suscripción
-- ---------------------------------------------------------------------
CREATE TABLE obradores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre              text NOT NULL,
  razon_social        text,
  cif                 text,
  registro_sanitario  text,
  direccion           text,
  email_contacto      text,
  telefono            text,
  logo_url            text,
  estado              text NOT NULL DEFAULT 'prueba'
                      CHECK (estado IN ('prueba', 'activo', 'impago', 'suspendido', 'baja')),
  creado_en           timestamptz NOT NULL DEFAULT now()
);

-- Una fila por obrador. Stripe será la fuente de verdad: sus avisos
-- (webhooks) actualizarán esta tabla. Mientras no haya Stripe, se
-- rellena al crear el obrador con el plan básico.
CREATE TABLE suscripciones (
  obrador_id              uuid PRIMARY KEY REFERENCES obradores(id) ON DELETE CASCADE,
  plan                    text NOT NULL DEFAULT 'basico',
  usuarios_incluidos      int  NOT NULL DEFAULT 2 CHECK (usuarios_incluidos >= 1),  -- gestor + 1
  usuarios_extra          int  NOT NULL DEFAULT 0 CHECK (usuarios_extra >= 0),
  modulos                 text[] NOT NULL DEFAULT '{}',  -- p. ej. {escandallos, appcc_temperaturas}
  estado                  text NOT NULL DEFAULT 'prueba',
  prueba_hasta            timestamptz,
  periodo_fin             timestamptz,
  stripe_customer_id      text UNIQUE,
  stripe_subscription_id  text UNIQUE,
  actualizado_en          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Usuarios
-- gestor            → todo; uno por obrador, creado al contratar
-- jefe_produccion   → registra y edita lo ya guardado
-- operario          → registra, no edita lo ya guardado
-- observador        → solo consulta
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obrador_id             uuid NOT NULL REFERENCES obradores(id) ON DELETE CASCADE,
  email                  text NOT NULL,
  nombre                 text NOT NULL,
  password_hash          text NOT NULL,
  rol                    text NOT NULL CHECK (rol IN ('gestor', 'jefe_produccion', 'operario', 'observador')),
  activo                 boolean NOT NULL DEFAULT true,
  debe_cambiar_password  boolean NOT NULL DEFAULT true,
  ultimo_acceso          timestamptz,
  creado_en              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obrador_id, id)
);
-- El email identifica al usuario en toda la plataforma (así el login
-- sabe a qué obrador pertenece sin pedir nada más).
CREATE UNIQUE INDEX usuarios_email_unico ON usuarios (lower(email));
-- Un único gestor por obrador.
CREATE UNIQUE INDEX usuarios_un_gestor ON usuarios (obrador_id) WHERE rol = 'gestor';

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
CREATE TABLE proveedores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obrador_id  uuid NOT NULL REFERENCES obradores(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  cif         text,
  contacto    text,
  activo      boolean NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obrador_id, id)
);
CREATE UNIQUE INDEX proveedores_nombre_unico ON proveedores (obrador_id, lower(nombre));

-- tipo: materia_prima (se recibe), preparado (elaboración intermedia
-- propia, p. ej. una bechamel) o elaborado (producto final).
CREATE TABLE productos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obrador_id     uuid NOT NULL REFERENCES obradores(id) ON DELETE CASCADE,
  nombre         text NOT NULL,
  tipo           text NOT NULL DEFAULT 'materia_prima'
                 CHECK (tipo IN ('materia_prima', 'preparado', 'elaborado')),
  unidad_medida  text NOT NULL DEFAULT 'kg' CHECK (unidad_medida IN ('kg', 'g', 'l', 'ml', 'ud')),
  alergenos      text[] NOT NULL DEFAULT '{}',  -- para preparados/elaborados se calcularán desde sus ingredientes
  activo         boolean NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obrador_id, id)
);
CREATE UNIQUE INDEX productos_nombre_unico ON productos (obrador_id, lower(nombre));

-- Documentos subidos (fichas técnicas, fotos de albaranes). El archivo
-- en sí irá a un almacenamiento externo; aquí solo la referencia.
CREATE TABLE archivos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obrador_id    uuid NOT NULL REFERENCES obradores(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  mime_type     text NOT NULL,
  tamano_bytes  bigint,
  clave_almacen text NOT NULL,
  subido_por    uuid,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obrador_id, id)
);

CREATE TABLE marcas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obrador_id   uuid NOT NULL REFERENCES obradores(id) ON DELETE CASCADE,
  producto_id  uuid NOT NULL,
  nombre       text NOT NULL,
  composicion  text NOT NULL DEFAULT '',
  alergenos    text[] NOT NULL DEFAULT '{}',
  unidad       text CHECK (unidad IN ('kg', 'g', 'l', 'ml', 'ud')),
  ficha_id     uuid,
  activo       boolean NOT NULL DEFAULT true,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obrador_id, id),
  FOREIGN KEY (obrador_id, producto_id) REFERENCES productos (obrador_id, id) ON DELETE CASCADE,
  FOREIGN KEY (obrador_id, ficha_id) REFERENCES archivos (obrador_id, id)
);
CREATE UNIQUE INDEX marcas_nombre_unico ON marcas (obrador_id, producto_id, lower(nombre));

-- ---------------------------------------------------------------------
-- Recepción de mercancía (lotes que entran)
-- ---------------------------------------------------------------------
CREATE TABLE recepciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obrador_id      uuid NOT NULL REFERENCES obradores(id) ON DELETE CASCADE,
  fecha           date NOT NULL,
  producto_id     uuid NOT NULL,
  marca_id        uuid,
  proveedor_id    uuid,
  num_lote        text NOT NULL DEFAULT '',
  caducidad       date,
  factura         text NOT NULL DEFAULT '',
  temp_entrada    numeric(5,1),
  estado_entrada  text NOT NULL DEFAULT 'conforme' CHECK (estado_entrada IN ('conforme', 'no_conforme', 'conforme_con_incidencia')),
  cantidad        numeric(12,3) NOT NULL CHECK (cantidad > 0),
  unidad          text NOT NULL CHECK (unidad IN ('kg', 'g', 'l', 'ml', 'ud')),
  precio_total    numeric(12,2) CHECK (precio_total >= 0),  -- sin impuestos
  observaciones   text NOT NULL DEFAULT '',
  activo          boolean NOT NULL DEFAULT true,
  creado_por      uuid,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  modificado_por  uuid,
  modificado_en   timestamptz,
  UNIQUE (obrador_id, id),
  FOREIGN KEY (obrador_id, producto_id) REFERENCES productos (obrador_id, id),
  FOREIGN KEY (obrador_id, marca_id) REFERENCES marcas (obrador_id, id),
  FOREIGN KEY (obrador_id, proveedor_id) REFERENCES proveedores (obrador_id, id)
);
CREATE INDEX recepciones_obrador_fecha ON recepciones (obrador_id, fecha DESC);
CREATE INDEX recepciones_producto ON recepciones (obrador_id, producto_id);

-- ---------------------------------------------------------------------
-- Preparados internos (elaboraciones intermedias que generan un lote
-- propio que luego se usa como ingrediente)
-- ---------------------------------------------------------------------
CREATE TABLE preparados (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obrador_id      uuid NOT NULL REFERENCES obradores(id) ON DELETE CASCADE,
  fecha           date NOT NULL,
  producto_id     uuid NOT NULL,
  num_lote        text NOT NULL,
  responsable     text NOT NULL DEFAULT '',
  cantidad        numeric(12,3) NOT NULL CHECK (cantidad > 0),
  unidad          text NOT NULL CHECK (unidad IN ('kg', 'g', 'l', 'ml', 'ud')),
  observaciones   text NOT NULL DEFAULT '',
  activo          boolean NOT NULL DEFAULT true,
  creado_por      uuid,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  modificado_por  uuid,
  modificado_en   timestamptz,
  UNIQUE (obrador_id, id),
  FOREIGN KEY (obrador_id, producto_id) REFERENCES productos (obrador_id, id)
);
CREATE INDEX preparados_obrador_fecha ON preparados (obrador_id, fecha DESC);

-- ---------------------------------------------------------------------
-- Producciones (lote de producto final). Los controles (temperaturas,
-- checks, fases como el boleado) dependen del proceso de cada obrador:
-- se guardan en "controles" (JSON) para no imponer el proceso de un
-- obrador concreto a todos.
-- ---------------------------------------------------------------------
CREATE TABLE producciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obrador_id      uuid NOT NULL REFERENCES obradores(id) ON DELETE CASCADE,
  fecha           date NOT NULL,
  producto_id     uuid NOT NULL,
  num_lote        text NOT NULL,
  responsable     text NOT NULL DEFAULT '',
  cantidad        numeric(12,3) CHECK (cantidad > 0),
  unidad          text CHECK (unidad IN ('kg', 'g', 'l', 'ml', 'ud')),
  unidades        int CHECK (unidades >= 0),
  estado          text NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso', 'completada')),
  controles       jsonb NOT NULL DEFAULT '{}',
  observaciones   text NOT NULL DEFAULT '',
  creado_por      uuid,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  modificado_por  uuid,
  modificado_en   timestamptz,
  UNIQUE (obrador_id, id),
  FOREIGN KEY (obrador_id, producto_id) REFERENCES productos (obrador_id, id)
);
CREATE INDEX producciones_obrador_fecha ON producciones (obrador_id, fecha DESC);

-- ---------------------------------------------------------------------
-- Consumos: cada ingrediente usado en un preparado o una producción,
-- enlazado al lote de origen. Es el corazón de la trazabilidad (hacia
-- atrás y hacia delante) y la base del stock disponible.
-- ---------------------------------------------------------------------
CREATE TABLE consumos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obrador_id         uuid NOT NULL REFERENCES obradores(id) ON DELETE CASCADE,
  preparado_id       uuid,                    -- destino: uno de los dos
  produccion_id      uuid,
  fase               text NOT NULL DEFAULT 'principal',  -- p. ej. masa, boleado
  origen_recepcion   uuid,                    -- origen: lote recibido…
  origen_preparado   uuid,                    -- …o lote de un preparado…
  producto_id        uuid NOT NULL,           -- …o ninguno (lote anotado a mano)
  num_lote           text NOT NULL DEFAULT '',
  cantidad           numeric(12,3) NOT NULL CHECK (cantidad > 0),
  unidad             text NOT NULL CHECK (unidad IN ('kg', 'g', 'l', 'ml', 'ud')),
  creado_en          timestamptz NOT NULL DEFAULT now(),
  CHECK ((preparado_id IS NULL) <> (produccion_id IS NULL)),
  CHECK (NOT (origen_recepcion IS NOT NULL AND origen_preparado IS NOT NULL)),
  FOREIGN KEY (obrador_id, preparado_id) REFERENCES preparados (obrador_id, id) ON DELETE CASCADE,
  FOREIGN KEY (obrador_id, produccion_id) REFERENCES producciones (obrador_id, id) ON DELETE CASCADE,
  FOREIGN KEY (obrador_id, origen_recepcion) REFERENCES recepciones (obrador_id, id),
  FOREIGN KEY (obrador_id, origen_preparado) REFERENCES preparados (obrador_id, id),
  FOREIGN KEY (obrador_id, producto_id) REFERENCES productos (obrador_id, id)
);
CREATE INDEX consumos_origen_rec ON consumos (obrador_id, origen_recepcion) WHERE origen_recepcion IS NOT NULL;
CREATE INDEX consumos_origen_prep ON consumos (obrador_id, origen_preparado) WHERE origen_preparado IS NOT NULL;
CREATE INDEX consumos_destino_prep ON consumos (obrador_id, preparado_id) WHERE preparado_id IS NOT NULL;
CREATE INDEX consumos_destino_prod ON consumos (obrador_id, produccion_id) WHERE produccion_id IS NOT NULL;

-- Ajustes manuales de stock (mermas, recuentos…), sin perder histórico.
CREATE TABLE ajustes_stock (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obrador_id        uuid NOT NULL REFERENCES obradores(id) ON DELETE CASCADE,
  origen_recepcion  uuid,
  origen_preparado  uuid,
  delta             numeric(12,3) NOT NULL CHECK (delta <> 0),
  motivo            text NOT NULL,
  nota              text NOT NULL DEFAULT '',
  usuario_id        uuid,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  CHECK ((origen_recepcion IS NULL) <> (origen_preparado IS NULL)),
  FOREIGN KEY (obrador_id, origen_recepcion) REFERENCES recepciones (obrador_id, id) ON DELETE CASCADE,
  FOREIGN KEY (obrador_id, origen_preparado) REFERENCES preparados (obrador_id, id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- Stock disponible por lote: se calcula, no se guarda. Así dos personas
-- registrando a la vez nunca se pisan el stock.
-- security_invoker → la vista respeta el RLS de quien consulta.
-- ---------------------------------------------------------------------
CREATE VIEW stock_lotes WITH (security_invoker = true) AS
SELECT 'recepcion'::text AS origen, r.id, r.obrador_id, r.producto_id, r.num_lote,
       r.fecha, r.caducidad, r.unidad, r.cantidad, r.activo,
       r.cantidad
         - COALESCE((SELECT sum(c.cantidad) FROM consumos c WHERE c.origen_recepcion = r.id), 0)
         + COALESCE((SELECT sum(a.delta) FROM ajustes_stock a WHERE a.origen_recepcion = r.id), 0)
         AS disponible
FROM recepciones r
UNION ALL
SELECT 'preparado'::text, p.id, p.obrador_id, p.producto_id, p.num_lote,
       p.fecha, NULL::date, p.unidad, p.cantidad, p.activo,
       p.cantidad
         - COALESCE((SELECT sum(c.cantidad) FROM consumos c WHERE c.origen_preparado = p.id), 0)
         + COALESCE((SELECT sum(a.delta) FROM ajustes_stock a WHERE a.origen_preparado = p.id), 0)
FROM preparados p;

-- ---------------------------------------------------------------------
-- Row Level Security en todas las tablas con datos de obrador.
-- No se usa FORCE: el propietario de las tablas (la conexión del
-- servidor) puede hacer tareas de sistema (login, alta de obradores,
-- avisos de Stripe, copias). Todo lo que hace un usuario pasa por
-- app_runtime, que no es propietario y queda sujeto al RLS.
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['usuarios', 'proveedores', 'productos', 'archivos', 'marcas', 'recepciones',
                           'preparados', 'producciones', 'consumos', 'ajustes_stock', 'suscripciones']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY aislamiento_obrador ON %I USING (obrador_id = obrador_actual()) WITH CHECK (obrador_id = obrador_actual())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_runtime', t);
  END LOOP;
END $$;

ALTER TABLE obradores ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_obrador ON obradores USING (id = obrador_actual()) WITH CHECK (id = obrador_actual());
GRANT SELECT, UPDATE ON obradores TO app_runtime;
-- La suscripción solo la cambia el sistema (Stripe), nunca el obrador.
REVOKE INSERT, UPDATE, DELETE ON suscripciones FROM app_runtime;
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT ON stock_lotes TO app_runtime;
GRANT EXECUTE ON FUNCTION obrador_actual() TO app_runtime;
