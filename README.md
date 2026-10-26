# Registro de obrador — servicio multiobrador

Web-app por suscripción para pequeños obradores (2–30 personas): industria
cárnica, panaderías, pastelerías, comidas preparadas, catering… Basada en la
app de Las Croquetas de la Oliva (`registro-obrador`), pero generalista.
**La app actual no se toca**: este repositorio y su despliegue son
independientes.

Tres puertas en la misma web:

| Dirección | Para quién |
| --- | --- |
| `/` | La app de cada obrador (móvil primero, instalable) |
| `/alta` | Alta de un obrador nuevo: datos, facturación, contacto, acceso y pago |
| `/admin` | Back office privado de la plataforma |

## Qué incluye

**App del obrador (plan básico)**
- **Productos**: nombre general → marcas particulares, cada una con ficha
  técnica en PDF, precio de referencia, formato, proveedor y alérgenos. La
  unidad de medida queda fijada por el producto.
- **Entradas de mercancía**: alta por pasos con sugerencias al escribir
  (producto, marca, proveedor), lote, cantidad, bultos, caducidad, precio por
  unidad o total, temperatura (con aviso según conservación), controles de
  envase, etiquetado y transporte, y estado de la mercancía.
- **Preparados internos**: los nombres se guardan y se ofrecen la vez
  siguiente con sus ingredientes habituales. La primera vez se indica si
  llevan **proceso térmico**; si es así, cada lote registra cocción
  (temperatura y tiempo) y abatimiento (temperaturas y horas), con objetivos
  ajustables (por defecto ≥ 75 °C y ≤ 10 °C en 120 min) y medida correctora
  obligatoria si algo queda fuera. Ingredientes con lote y stock, caducidad
  propuesta por vida útil, trazabilidad hacia atrás y hacia delante.
- **Roles**: gestor (todo), jefe de producción (registra y edita), operario
  (registra), observador (consulta). Plan básico = gestor + 1 usuario.

**Cobros**
- Alta con tarjeta o domiciliación SEPA en la página segura de Stripe (los
  datos bancarios nunca pasan por nuestro servidor).
- Planes: básico mensual (29,90 €), básico anual (299 €, 2 meses gratis) y
  completo anual con todos los módulos (539 €, 3 meses gratis; se activa
  cuando los módulos estén terminados). Usuario extra: 3 €/mes o 30 €/año.
- Tarjeta: cuenta activa al cobrar. Domiciliación: activa al aceptar el
  mandato. Correo con factura e información de la contratación.
- Cobro fallido → correo inmediato; recordatorio a los 5 días avisando de
  la suspensión; a los 10 días la cuenta queda en suspenso (el gestor solo
  puede entrar para actualizar la forma de pago). Al cobrarse, se reactiva
  sola.

**Back office**
- Acceso privado, separado de los obradores. Administrador principal y
  otros administradores.
- Clientes con LED verde (cobrado) / rojo (cobro fallido) / gris (sin
  contratar), fecha de alta, contratación, próximo cobro, cobrado en 12
  meses y desde el alta, y último uso de la app.
- Ficha de cliente: facturación, contacto, pagos, usuarios, correos
  enviados y acciones (reactivar o suspender a mano, con motivo).

## Variables de entorno (Railway → Variables)

| Variable | Para qué |
| --- | --- |
| `DATABASE_URL` | Postgres del proyecto (`${{Postgres.DATABASE_URL}}`) |
| `JWT_SECRET` | Cadena larga y aleatoria |
| `NODE_ENV` | `production` |
| `URL_PUBLICA` | Dirección pública, p. ej. `https://app.tuservicio.com` |
| `STRIPE_SECRET_KEY` | Clave secreta de Stripe (`sk_test_…` para pruebas) |
| `STRIPE_WEBHOOK_SECRET` | Secreto del webhook (`whsec_…`) |
| `STRIPE_PRECIO_BASICO` | Id del precio de 29,90 €/mes (`price_…`) |
| `STRIPE_PRECIO_USUARIO_EXTRA` | Id del precio de 3 €/mes por usuario |
| `STRIPE_PRECIO_BASICO_ANUAL` | Id del precio de 299 €/año (2 meses gratis) |
| `STRIPE_PRECIO_USUARIO_EXTRA_ANUAL` | Id del precio de 30 €/año por usuario (2 meses gratis) |
| `STRIPE_PRECIO_COMPLETO_ANUAL` | Id del precio del plan completo, 539 €/año (3 meses gratis) |
| `PLAN_COMPLETO_DISPONIBLE` | `1` cuando los módulos estén listos para ofrecer el plan completo |
| `RESEND_API_KEY` | Envío de correos (resend.com) |
| `CORREO_REMITENTE` | p. ej. `Tu Servicio <hola@tuservicio.com>` |
| `ADMIN_INICIAL_EMAIL` / `ADMIN_INICIAL_PASSWORD` / `ADMIN_INICIAL_NOMBRE` | Crea el administrador principal en el primer arranque (contraseña de 12+ caracteres) |
| `PAGOS_SIMULADOS` | `1` en el entorno de pruebas sin Stripe (simula los cobros) |

Sin `STRIPE_SECRET_KEY` y fuera de producción, los pagos se **simulan** (el
alta se activa al momento y el back office permite simular cobros correctos
o fallidos). Sin `RESEND_API_KEY`, los correos se registran pero no se envían.

### Configurar Stripe
1. Productos y precios recurrentes: «Plan básico» (29,90 €/mes y
   299 €/año), «Usuario extra» (3 €/mes y 30 €/año) y «Plan completo»
   (539 €/año). Copia los cinco ids de precio.
2. Activa tarjeta y SEPA Direct Debit como métodos de pago.
3. Webhook a `https://TU-DOMINIO/api/stripe/webhook` con los eventos
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.updated` y `customer.subscription.deleted`.
4. Portal de clientes: permite actualizar la forma de pago.
5. En *Recuperación de ingresos*: activa los reintentos de domiciliación
   (por falta de saldo) y que Stripe **no cancele** la suscripción antes de
   10 días (la suspensión la gestiona la app).
6. Con domiciliación, el acceso se da al aceptar el mandato; si el cargo
   se rechaza días después, empieza el ciclo de impago. Conviene configurar
   tu propio identificador de acreedor SEPA en Stripe.
7. Impuestos (IGIC/IVA) y numeración de facturas: a definir con la gestoría.

## Desarrollo en local

Necesitas Node 20+ y Postgres 15+.

```bash
cd backend && npm install
export DATABASE_URL=postgres://usuario:clave@localhost:5432/obrador_dev
npm run migrate
npm run crear-admin -- --email tu@email.com --nombre "Tu nombre" --principal
npm run crear-obrador -- --nombre "Obrador de pruebas" --email gestor@email.com --gestor "Nombre"
npm run dev                                   # API en http://localhost:3000
cd ../frontend && npm install && npm run dev  # app en http://localhost:5173
```

Pruebas (base aparte que se borra en cada ejecución):

```bash
cd backend && TEST_DATABASE_URL=postgres://usuario:clave@localhost:5432/obrador_test npm test
```

## Despliegue en Railway (proyecto NUEVO)

1. **New Project → Deploy from GitHub repo → `obrador-saas`**, región europea.
2. **+ New → Database → PostgreSQL**.
3. Variables de la tabla anterior.
4. El servidor aplica solo las migraciones al arrancar.
5. Desde la consola del servicio: `npm run crear-admin --prefix backend -- --email … --nombre … --principal`.

## Estructura

```
backend/src/db/migrations/   esquema de la base (SQL), se aplica solo
backend/src/db/pool.js       enObrador(): transacción aislada a un obrador (RLS)
backend/src/lib/cobros.js    ciclo de cobro, impagos y suspensión
backend/src/lib/correo.js    plantillas y envío de correos
backend/src/routes/          API: auth, alta, admin, catálogo, recepciones, preparados…
backend/test/                aislamiento, roles, cobros, back office, preparados
frontend/src/pantallas/      app del obrador y alta
frontend/src/admin/          back office
```
