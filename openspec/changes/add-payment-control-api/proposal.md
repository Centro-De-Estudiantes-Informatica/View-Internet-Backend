## Why

La sede de Informática va a ofrecer internet a los estudiantes con una **cuota mensual** y hoy no hay forma confiable de saber quién pagó, cuánto dinero entró ni en qué moneda. Este backend (`View-Internet-Backend`) concentra toda la lógica de negocio —personas, roles, pagos en USD/VES/COP, aprobación de pagos móviles y métricas— para que la app web (`View-Internet`) solo presente datos y nunca decida reglas.

## What Changes

- API REST nueva (NestJS + Prisma + PostgreSQL en Neon) consumida por la app web.
- Autenticación por **cédula + contraseña** con JWT; contraseña temporal creada por el administrador y cambio obligatorio en el primer ingreso.
- Dos roles: `ESTUDIANTE` y `ADMIN`, con autorización por rol en cada endpoint.
- Gestión de personas: el administrador crea cuentas, lista, busca por cédula o nombre (sin importar puntos, prefijo `V-`/`E-` ni acentos), cambia roles y restablece contraseñas. Siempre debe existir al menos un administrador.
- Configuración de la **cuota mensual en USD** y de las **tasas del día** (Bs/USD y COP/USD).
- Pagos multimoneda (USD, VES, COP) con la tasa congelada al momento del pago y su equivalente en USD:
  - **Efectivo**: lo registra el administrador y queda aprobado.
  - **Pago móvil** (solo VES): lo reporta el estudiante con referencia y captura opcional; queda `EN_REVISION` hasta que un administrador lo apruebe o rechace.
  - Los pagos no se borran: se **anulan** con motivo (auditoría).
- Estado mensual de cada estudiante **calculado** a partir de los pagos aprobados: `AL_DIA`, `PARCIAL`, `EN_REVISION`, `PENDIENTE`.
- Endpoints de métricas para el dashboard: recaudado por moneda, equivalente USD, esperado, estudiantes al día, pagos por revisar y serie mensual.

## Capabilities

### New Capabilities
- `auth`: inicio de sesión por cédula, emisión/validación de JWT, cambio de contraseña obligatorio y autorización por rol.
- `user-management`: alta de personas por el administrador, listado paginado, búsqueda por cédula o nombre, cambio de rol con protección del último administrador, restablecer contraseña y activar/desactivar.
- `billing-config`: cuota mensual en USD por periodo y registro de tasas de cambio diarias VES/COP.
- `payments`: registro de pagos en efectivo, reporte de pago móvil, revisión (aprobar/rechazar), anulación, conversión a USD y cálculo del estado mensual por estudiante.
- `dashboard-metrics`: agregados del periodo y serie histórica para el panel del administrador.

### Modified Capabilities
<!-- Ninguna: el repositorio no tiene specs previas. -->

## Impact

- **Repositorio nuevo**: `View-Internet-Backend` pasa de vacío a un servicio NestJS con Prisma y migraciones.
- **Infraestructura**: base de datos PostgreSQL (Neon), almacenamiento de objetos para las capturas de pago móvil y un hosting para la API.
- **Contrato**: la app web `View-Internet` (cambio `add-payment-control-web`) depende de esta API; el contrato se publica como OpenAPI (`/docs`).
- **Datos sensibles**: cédulas, teléfonos y comprobantes de pago → contraseñas con hash, HTTPS obligatorio y acceso a capturas solo para administradores.
