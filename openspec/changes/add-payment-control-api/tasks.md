## 1. Base del proyecto

- [x] 1.1 Inicializar el proyecto NestJS con TypeScript estricto, ESLint, Prettier y scripts `dev`, `build`, `test`
- [x] 1.2 Agregar Prisma y conectarlo a Neon (`DATABASE_URL` agrupada y `DIRECT_URL` para migraciones)
- [x] 1.3 Configuración por variables de entorno validadas al arrancar (`@nestjs/config` + zod/joi)
- [x] 1.4 Configurar OpenAPI en `/docs`, endpoint `/health` y filtro global de errores `{ code, message }`
- [x] 1.5 Pipeline de CI: lint, test y build en cada PR

## 2. Modelo de datos

- [x] 2.1 Esquema Prisma: `User`, `Setting`, `Period`, `ExchangeRate`, `Payment`, `AuditLog` con enums y montos `Decimal`
- [x] 2.2 Migración con el índice único parcial `(bank, reference)` para pagos `EN_REVISION`/`APROBADO`
- [x] 2.3 Extensiones `unaccent` y `pg_trgm` e índice de búsqueda por nombre
- [x] 2.4 Utilidad para normalizar cédulas (prefijo + dígitos) con pruebas unitarias
- [x] 2.5 Semilla del primer administrador desde variables de entorno

## 3. Autenticación y roles

- [x] 3.1 `POST /auth/login` con bcrypt, JWT (`sub`, `role`, `tv`) y respuesta genérica en 401
- [x] 3.2 Guard global JWT que valida `tokenVersion`, `role` y `active` contra la base de datos (caché corta)
- [x] 3.3 Decorador `@Roles()` y `RolesGuard`
- [x] 3.4 Guard de `mustChangePassword` y `POST /auth/change-password`
- [x] 3.5 Rate limit en el login (por cédula y por IP)
- [x] 3.6 Pruebas e2e de los escenarios de la spec `auth`

## 4. Gestión de personas

- [x] 4.1 `POST /users` con contraseña temporal y manejo de cédula duplicada (409)
- [x] 4.2 `GET /users` paginado con búsqueda por cédula/nombre y filtros por rol y estado del periodo
- [x] 4.3 `PATCH /users/:id/role` con las reglas `CANNOT_CHANGE_OWN_ROLE` y `LAST_ADMIN` dentro de una transacción
- [x] 4.4 `PATCH /users/:id` (datos y activar/desactivar, respetando `LAST_ADMIN`) y `POST /users/:id/reset-password`
- [x] 4.5 Registro de auditoría en cada cambio de rol, estado de cuenta y restablecimiento
- [x] 4.6 Pruebas e2e de la spec `user-management`

## 5. Cuota y tasas

- [x] 5.1 `PUT /billing/fee` y apertura perezosa de `Period` congelando la cuota
- [x] 5.2 `POST /billing/rates` y `GET /billing/rates` con la resolución "última tasa en o antes de la fecha"
- [x] 5.3 `GET /billing/current`: cuota en USD/VES/COP con la tasa y su fecha
- [x] 5.4 Pruebas unitarias de conversión y redondeo con `Decimal`

## 6. Pagos

- [x] 6.1 Servicio de dominio `PaymentCalculator` (tasa → `amountUsd`) y `PeriodStatus` (regla de estado con tolerancia)
- [x] 6.2 `POST /payments/cash` (ADMIN, cualquier moneda, `APROBADO`)
- [x] 6.3 Almacenamiento de objetos: subida validada (tipo y 5 MB) y URLs firmadas
- [x] 6.4 `POST /me/payments/mobile` (ESTUDIANTE, solo VES, `EN_REVISION`, `DUPLICATE_REFERENCE`)
- [x] 6.5 `POST /payments/:id/approve|reject|void` con actualización condicional (409 si cambió el estado) y auditoría
- [x] 6.6 `GET /payments` (ADMIN), `GET /payments/:id/receipt` (ADMIN), `GET /me/payments` y `GET /me/status`
- [x] 6.7 Pruebas e2e de la spec `payments`, incluidas las de aislamiento entre estudiantes

## 7. Métricas

- [x] 7.1 `GET /metrics/summary` con totales por moneda, equivalente USD, esperado, conteo por estado y pagos por revisar
- [x] 7.2 `GET /metrics/monthly` con relleno de ceros
- [x] 7.3 `GET /metrics/recent`
- [ ] 7.4 Pruebas con datos semilla que reproduzcan los números del mockup

## 8. Despliegue

- [ ] 8.1 Elegir el hosting (pregunta abierta) y configurar las variables de entorno
- [x] 8.2 `prisma migrate deploy` en el pipeline de despliegue
- [x] 8.3 Publicar el OpenAPI para que la web genere su cliente tipado
- [ ] 8.4 Prueba de humo: login del administrador semilla, crear estudiante, registrar pago y verificar métricas
