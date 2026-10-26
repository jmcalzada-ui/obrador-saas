# Registro de obrador — servicio multiobrador

Web-app nueva, basada en la app actual de Las Croquetas de la Oliva
(`registro-obrador`), pensada como servicio por suscripción para muchos
obradores. **La app actual no se toca**: este repositorio y su despliegue
son completamente independientes.

## Qué hay hecho (fase 0–1, plan básico)

- **Multiobrador con aislamiento real.** Una base Postgres compartida; cada
  tabla lleva `obrador_id` y Postgres aplica *Row Level Security*: cada
  petición solo puede ver y modificar los datos de su obrador, aunque una
  consulta olvide filtrar. Las referencias entre tablas usan claves
  compuestas `(obrador_id, id)`, así no se puede enlazar nada con datos de
  otro obrador.
- **Base de datos por tablas** (antes todo eran bloques JSON que se
  reescribían enteros). Recepciones, preparados, producciones, consumos de
  ingredientes y ajustes de stock en tablas propias. El stock disponible se
  calcula, no se guarda: dos personas registrando a la vez nunca se pisan.
- **Login por email**, sesión de 12 h, freno a intentos repetidos, cambio de
  contraseña obligatorio la primera vez.
- **Roles**: gestor (todo, uno por obrador), jefe de producción (registra y
  edita), operario (registra, no edita), observador (solo consulta).
- **Plazas del plan**: el básico incluye al gestor y una cuenta más; cada
  usuario extra amplía las plazas. Desactivar a alguien libera su plaza y le
  corta el acceso al momento.
- **Módulos por plan preparados**: la suscripción guarda los módulos
  contratados y el servidor tiene el control (`requireModulo`) listo para
  escandallos y APPCC, aunque todavía no se usa.
- **Recepción de mercancía** completa (alta por pasos, listado, detalle con
  trazabilidad hacia delante, edición, baja y borrado según rol), catálogo de
  productos, marcas y proveedores, datos del obrador y gestión del equipo.
- **Interfaz para móvil primero**, instalable como app (PWA), con zonas
  táctiles grandes, menú inferior y teclado numérico en las cantidades.

## Pendiente (siguientes pasos)

1. Preparados y producciones con selección de lotes y descuento de stock.
2. Importar la réplica de los datos actuales como cliente 1 (desde una
   exportación de la app actual, sin conectarse a su base).
3. Alta automática de obradores con pago (Stripe), copias de seguridad por
   obrador y descarga de datos.

## Desarrollo en local

Necesitas Node 20+ y Postgres 15+.

```bash
cd backend && npm install
DATABASE_URL=postgres://usuario:clave@localhost:5432/obrador_dev npm run migrate
DATABASE_URL=... npm run crear-obrador -- --nombre "Obrador de pruebas" --email tu@email.com --gestor "Tu nombre"
DATABASE_URL=... npm run dev          # API en http://localhost:3000

cd ../frontend && npm install && npm run dev   # app en http://localhost:5173
```

Pruebas (usan una base aparte que se borra en cada ejecución):

```bash
cd backend && TEST_DATABASE_URL=postgres://usuario:clave@localhost:5432/obrador_test npm test
```

## Despliegue en Railway (proyecto NUEVO)

No uses el proyecto de Railway de la app actual.

1. En Railway: **New Project → Deploy from GitHub repo → `obrador-saas`**.
2. En ese proyecto: **+ New → Database → PostgreSQL**.
3. En el servicio de la app, pestaña **Variables**:
   - `DATABASE_URL` → referencia a la del Postgres (`${{Postgres.DATABASE_URL}}`)
   - `JWT_SECRET` → una cadena larga y aleatoria
   - `NODE_ENV` → `production`
4. Región: elige una europea en **Settings → Region**.
5. Al desplegar, el servidor aplica solo las migraciones de la base.
6. Crea el obrador de pruebas desde la consola del servicio
   (**⋮ → Shell** o `railway run`):
   `npm run crear-obrador --prefix backend -- --nombre "Obrador de pruebas" --email tu@email.com --gestor "Juan"`

## Estructura

```
backend/
  src/db/migrations/   esquema de la base (SQL), se aplica solo
  src/db/pool.js       enObrador(): transacción aislada a un obrador
  src/auth/            token, permisos por rol, control de módulos
  src/routes/          API: auth, usuarios, obrador, catálogo, recepciones
  test/                pruebas de aislamiento, roles y plazas
frontend/
  src/pantallas/       pantallas de la app
  src/componentes/     piezas comunes (etiqueta de lote, hojas, campos)
```
