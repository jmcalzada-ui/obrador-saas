-- =====================================================================
-- 002 · Alta de clientes, cobros, avisos de impago y back office
--
-- Los datos bancarios (tarjeta o cuenta para domiciliación) NO se
-- guardan aquí: los introduce el cliente en la página segura de Stripe.
-- Aquí solo queda un resumen para reconocerlos ("Visa ···4242").
-- =====================================================================

-- Datos de facturación y contacto completos del obrador
ALTER TABLE obradores
  ADD COLUMN sector            text CHECK (sector IN ('carnica', 'panaderia', 'pasteleria', 'comidas_preparadas',
                                                      'catering', 'heladeria', 'conservas', 'otro')),
  ADD COLUMN num_empleados     int CHECK (num_empleados > 0),
  ADD COLUMN direccion_fiscal  text,
  ADD COLUMN codigo_postal     text,
  ADD COLUMN municipio         text,
  ADD COLUMN provincia         text,
  ADD COLUMN pais              text NOT NULL DEFAULT 'ES',
  ADD COLUMN contacto_nombre   text,
  ADD COLUMN email_facturacion text;

-- Nuevo estado: dado de alta pero aún sin primer cobro (sin acceso).
ALTER TABLE obradores DROP CONSTRAINT obradores_estado_check;
ALTER TABLE obradores ALTER COLUMN estado SET DEFAULT 'pendiente_pago';
ALTER TABLE obradores ADD CONSTRAINT obradores_estado_check
  CHECK (estado IN ('pendiente_pago', 'prueba', 'activo', 'impago', 'suspendido', 'baja'));

ALTER TABLE suscripciones ALTER COLUMN estado SET DEFAULT 'pendiente_pago';
ALTER TABLE suscripciones
  ADD COLUMN importe_mensual        numeric(10,2),          -- sin impuestos, según lo contratado
  ADD COLUMN metodo_pago_tipo       text CHECK (metodo_pago_tipo IN ('card', 'sepa_debit')),
  ADD COLUMN metodo_pago_resumen    text,                   -- "Visa ···4242", "Domiciliación ···1234"
  ADD COLUMN proximo_cobro          timestamptz,
  ADD COLUMN ultimo_cobro_ok        timestamptz,
  ADD COLUMN impago_desde           timestamptz,            -- primer fallo de la racha actual
  ADD COLUMN recordatorio_impago_en timestamptz,            -- aviso de los 5 días ya enviado
  ADD COLUMN suspendido_en          timestamptz,
  ADD COLUMN contratado_en          timestamptz;            -- primer cobro correcto

-- Historial de cobros (facturas de Stripe). El obrador puede ver las suyas.
CREATE TABLE pagos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obrador_id         uuid NOT NULL REFERENCES obradores(id) ON DELETE CASCADE,
  stripe_invoice_id  text UNIQUE,
  numero_factura     text,
  importe            numeric(10,2) NOT NULL,   -- total cobrado, impuestos incluidos
  base_imponible     numeric(10,2),
  impuestos          numeric(10,2),
  moneda             text NOT NULL DEFAULT 'eur',
  estado             text NOT NULL CHECK (estado IN ('pagado', 'fallido', 'pendiente', 'anulado')),
  intentos           int NOT NULL DEFAULT 1,
  periodo_desde      timestamptz,
  periodo_hasta      timestamptz,
  url_factura        text,                     -- página de la factura en Stripe
  url_pdf            text,
  fecha              timestamptz NOT NULL DEFAULT now(),
  pagado_en          timestamptz
);
CREATE INDEX pagos_obrador_fecha ON pagos (obrador_id, fecha DESC);
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_obrador ON pagos USING (obrador_id = obrador_actual());
GRANT SELECT ON pagos TO app_runtime;

-- Correos enviados. "referencia" evita mandar dos veces el mismo aviso
-- (p. ej. el recordatorio de un mismo impago).
CREATE TABLE emails_enviados (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obrador_id    uuid REFERENCES obradores(id) ON DELETE CASCADE,
  tipo          text NOT NULL,
  referencia    text NOT NULL,
  destinatario  text NOT NULL,
  asunto        text NOT NULL,
  estado        text NOT NULL DEFAULT 'enviado' CHECK (estado IN ('enviado', 'simulado', 'error')),
  error         text,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, referencia)
);
CREATE INDEX emails_obrador ON emails_enviados (obrador_id, creado_en DESC);

-- Avisos de Stripe ya procesados (Stripe puede repetir un aviso).
CREATE TABLE stripe_eventos (
  id            text PRIMARY KEY,
  tipo          text NOT NULL,
  procesado_en  timestamptz NOT NULL DEFAULT now()
);

-- Administradores del back office (tú y quien autorices). Tabla aparte de
-- los usuarios de los obradores: nunca se mezclan los accesos.
CREATE TABLE admins (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL,
  nombre         text NOT NULL,
  password_hash  text NOT NULL,
  rol            text NOT NULL DEFAULT 'admin' CHECK (rol IN ('superadmin', 'admin')),
  activo         boolean NOT NULL DEFAULT true,
  ultimo_acceso  timestamptz,
  creado_en      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX admins_email_unico ON admins (lower(email));
-- app_runtime no tiene ningún permiso sobre admins, emails ni eventos.

-- Registro de acciones hechas desde el back office.
CREATE TABLE admin_acciones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid REFERENCES admins(id),
  obrador_id  uuid REFERENCES obradores(id) ON DELETE SET NULL,
  accion      text NOT NULL,
  detalle     jsonb NOT NULL DEFAULT '{}',
  creado_en   timestamptz NOT NULL DEFAULT now()
);
