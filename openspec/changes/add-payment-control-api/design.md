## Context

La sede de Informática instalará internet para los estudiantes con una cuota mensual. Los dos repos (`View-Internet` para la web, `View-Internet-Backend` para la API) están vacíos. Este backend es la **única fuente de verdad** de las reglas de negocio: la web nunca calcula estados ni conversiones.

Restricciones conocidas:
- Tres monedas en circulación: USD, bolívares (VES) y pesos colombianos (COP). La tasa del bolívar cambia a diario.
- Pago móvil (solo VES) lo reporta el estudiante; el efectivo lo registra el administrador.
- Por ahora las cuentas las crea el administrador (el autorregistro queda abierto para más adelante).
- Equipo pequeño, presupuesto bajo: preferir servicios con plan gratuito.

## Goals / Non-Goals

**Goals:**
- API REST con autorización por rol y contrato OpenAPI que consuma la web.
- Modelo de pagos auditable: nada se borra, todo guarda quién y cuándo.
- Estado mensual del estudiante **derivado** de los pagos, nunca un booleano editable.
- Conversión de monedas reproducible (tasa congelada en cada pago).

**Non-Goals:**
- Integración con el router o portal cautivo para cortar el acceso (fase 2).
- Verificación automática de pagos móviles contra el banco.
- Autorregistro de estudiantes y notificaciones (correo/WhatsApp).
- Pagos en línea con pasarela.

## Decisions

### 1. NestJS + Prisma + PostgreSQL (Neon)
NestJS da módulos, `Guards` para roles, `Pipes` de validación (class-validator) y genera OpenAPI con `@nestjs/swagger`. Prisma da migraciones tipadas. Neon ofrece Postgres serverless con plan gratuito y ramas para pruebas.
- *Alternativas*: Express a mano (menos estructura para roles y validación); FastAPI (dividiría el stack en dos lenguajes respecto a la web en TypeScript).

### 2. Modelo de datos

```
User(id, cedulaPrefix 'V'|'E', cedulaDigits UNIQUE(prefix,digits), fullName, fullNameSearch,
     phone?, role ESTUDIANTE|ADMIN, active, passwordHash, mustChangePassword,
     tokenVersion, createdAt)
Setting(key, value)                         -- p. ej. monthlyFeeUsd
Period(id 'AAAA-MM', feeUsd DECIMAL(10,2), openedAt)
ExchangeRate(id, currency VES|COP, ratePerUsd DECIMAL(18,4), effectiveDate, createdBy)
Payment(id, userId, periodId, method EFECTIVO|PAGO_MOVIL, currency USD|VES|COP,
        amount DECIMAL(18,2), rate DECIMAL(18,4), amountUsd DECIMAL(10,2),
        status EN_REVISION|APROBADO|RECHAZADO|ANULADO,
        reference?, bank?, payerPhone?, paidAt, receiptKey?,
        registeredBy?, reviewedBy?, reviewedAt?, reviewNote?, voidedBy?, voidReason?,
        createdAt)
  -- índice único parcial: (bank, reference) WHERE status IN ('EN_REVISION','APROBADO')
AuditLog(id, actorId, action, entity, entityId, before JSONB, after JSONB, createdAt)
```
- Para USD, `rate = 1`.
- La cédula se separa en prefijo + dígitos; la unicidad es por dígitos + prefijo y la búsqueda usa solo los dígitos.
- `fullNameSearch` = nombre en minúsculas sin acentos (o la extensión `unaccent` + índice trigram `pg_trgm` para búsquedas parciales).

### 3. Estado mensual calculado en consulta
`status(user, period)` se calcula con una agregación SQL (`SUM(amountUsd) FILTER (WHERE status='APROBADO')`, `COUNT(*) FILTER (WHERE status='EN_REVISION')`) y se aplica la regla de la spec. Para el listado se hace una sola consulta con `LEFT JOIN` agregado por periodo, sin N+1.
- *Alternativa*: guardar una columna de estado y actualizarla con triggers → riesgo de desincronización; se descarta. Si el volumen creciera, se puede pasar a una vista materializada.

### 4. Un pago cubre un periodo
Cada pago apunta a un único `periodId`. Un pago adelantado se registra contra el periodo futuro (se abre al vuelo). No hay reparto automático de excedentes en v1, lo que mantiene el modelo simple y auditable.

### 5. Dinero como decimal
Prisma `Decimal` (decimal.js) en todo el dominio; nunca `number`. `amountUsd = round(amount / rate, 2, HALF_UP)`. La API serializa montos como **strings** (`"1000.00"`) para no perder precisión en JSON. Tolerancia de $0.05 para considerar `AL_DIA`, que absorbe el redondeo de VES/COP.

### 6. Autenticación
- `bcrypt` (cost 12) para contraseñas; contraseña temporal aleatoria de 10 caracteres que se muestra una sola vez.
- JWT de acceso (HS256, 8 h) con `sub`, `role` y `tv` (tokenVersion). Un guard global compara `tv` y `role` con la base de datos (se cachea 60 s): restablecer la contraseña o cambiar el rol invalida los tokens viejos.
- Guard `MustChangePassword` bloquea todo excepto `/auth/change-password`.
- Rate limit con `@nestjs/throttler` en `/auth/login` (5 intentos fallidos cada 15 min por cédula, más un límite por IP).
- La web guarda el token en una cookie httpOnly de **su propio dominio** y llama a esta API desde el servidor (patrón BFF). Así se evita exponer el token al navegador y no hace falta CORS con credenciales.

### 7. Capturas de pago móvil
Se suben con `multipart/form-data` (máximo 5 MB, JPG/PNG validados por *magic bytes*) a almacenamiento de objetos compatible con S3, en un bucket privado. La clave se guarda en `receiptKey`. Solo un `ADMIN` obtiene una URL firmada (5 min) con `GET /payments/:id/receipt`.

### 8. Endpoints (resumen)
```
POST   /auth/login                 público
POST   /auth/change-password       autenticado
GET    /me                         autenticado
GET    /me/status                  ESTUDIANTE|ADMIN
GET    /me/payments                ESTUDIANTE|ADMIN
POST   /me/payments/mobile         ESTUDIANTE  (multipart)
GET    /billing/current            autenticado
PUT    /billing/fee                ADMIN
POST   /billing/rates              ADMIN
GET    /billing/rates?currency=    ADMIN
GET    /users?q=&role=&estado=&periodo=&page=   ADMIN
POST   /users                      ADMIN
PATCH  /users/:id                  ADMIN  (nombre, teléfono, active)
PATCH  /users/:id/role             ADMIN
POST   /users/:id/reset-password   ADMIN
GET    /payments?status=&periodo=&userId=       ADMIN
POST   /payments/cash              ADMIN
POST   /payments/:id/approve       ADMIN
POST   /payments/:id/reject        ADMIN  {reason}
POST   /payments/:id/void          ADMIN  {reason}
GET    /payments/:id/receipt       ADMIN
GET    /metrics/summary?periodo=   ADMIN
GET    /metrics/monthly?months=    ADMIN
GET    /metrics/recent?limit=      ADMIN
```
Los errores de negocio responden `{ code, message }` (`LAST_ADMIN`, `CANNOT_CHANGE_OWN_ROLE`, `DUPLICATE_REFERENCE`, `RATE_MISSING`, `PASSWORD_CHANGE_REQUIRED`, …) para que la web los traduzca.

### 9. Concurrencia en la revisión
Aprobar, rechazar y anular se hacen con `UPDATE … WHERE id = ? AND status = 'EN_REVISION'` (o `'APROBADO'` al anular) y se comprueba que se haya afectado una fila; si no, 409. Así dos administradores no aprueban dos veces el mismo pago.

### 10. Semilla del primer administrador
`prisma db seed` crea el primer `ADMIN` a partir de variables de entorno (`SEED_ADMIN_CEDULA`, `SEED_ADMIN_PASSWORD`) con `mustChangePassword = true`.

## Risks / Trade-offs

- [Un pago móvil falso o reutilizado] → Revisión manual obligatoria, referencia única por banco y captura opcional.
- [Tasa VES desactualizada al registrar un pago] → La respuesta informa la fecha de la tasa usada; el dashboard avisa si la última tasa tiene más de 1 día.
- [Error del administrador al registrar] → Anulación con motivo y auditoría; nunca se borra.
- [Hosting serverless con arranque en frío] → Latencia aceptable para este uso; Neon con *scale-to-zero*. Si molesta, se puede usar un plan siempre encendido.
- [Datos personales (cédula, teléfono, capturas)] → HTTPS, bucket privado, URLs firmadas cortas y nunca registrar contraseñas ni tokens en los logs.
- [Tolerancia de $0.05] → Podría ocultar diferencias reales muy pequeñas; es configurable en `Setting`.

## Migration Plan

Proyecto nuevo, sin datos previos.
1. Crear el proyecto Neon (rama `main` y rama `dev`) y el bucket privado.
2. `prisma migrate deploy` y `prisma db seed` para el primer administrador.
3. Desplegar la API, configurar las variables de entorno y verificar `/health` y `/docs`.
4. Cargar la cuota mensual y la primera tasa VES/COP.
5. Rollback: volver a la versión anterior del despliegue; las migraciones son aditivas.

## Open Questions

- ¿Hosting de la API: Vercel (NestJS como función), Render o Railway?
- ¿Almacenamiento de capturas: Vercel Blob, Neon Object Storage o Cloudflare R2?
- ¿Se permitirá más adelante el autorregistro con aprobación del administrador?
- ¿Se cobra mora o hay fecha límite de pago dentro del mes? (Hoy un mes no pagado es `PENDIENTE` sin recargo.)
- ¿Los pagos en COP también pueden llegar por transferencia (Nequi/Bancolombia) y necesitan reporte del estudiante?
- Fase 2: integración con el router o hotspot (por ejemplo, la API de MikroTik) para habilitar o cortar el acceso según el estado.
