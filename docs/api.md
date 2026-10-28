# API

El contrato completo (esquemas, ejemplos) está en `openapi.json` y en Swagger UI en `/docs` (JSON en `/docs-json`). Este documento resume cómo usarla.

## Convenciones

- **Autenticación**: `Authorization: Bearer <accessToken>` en todo excepto `POST /auth/login` y `GET /health`.
- **Montos**: strings decimales con 2 decimales (`"1000.00"`); las tasas, con 4 (`"200.0000"`). Nunca `number`.
- **Fechas**: `AAAA-MM-DD`; **periodos**: `AAAA-MM`.
- **Cédulas**: se aceptan en cualquier formato; se devuelven como `V-28.123.456`.
- **Bancos**: código de 4 dígitos (`0134` = Banesco, `0105` = Mercantil, `0102` = Banco de Venezuela…).
- **Paginación**: `?page=1&pageSize=20` (máximo 100); la respuesta trae `{ items, total, page, pageSize }`.
- **Campos desconocidos**: se rechazan con 422 (no se ignoran).

## Errores

Todos los errores responden con el mismo formato:

```json
{ "code": "LAST_ADMIN", "message": "Debe quedar al menos un administrador activo" }
```

Los errores de validación agregan `details` con un mensaje por campo. La web traduce cada `code` a su propio mensaje en español.

| HTTP | Código | Cuándo |
| --- | --- | --- |
| 401 | `INVALID_CREDENTIALS` | Cédula o contraseña incorrecta (mismo mensaje en ambos casos) |
| 401 | `UNAUTHORIZED` | Falta el token, es inválido, venció o fue invalidado |
| 403 | `PASSWORD_CHANGE_REQUIRED` | La cuenta tiene contraseña temporal |
| 403 | `ACCOUNT_DISABLED` | La cuenta está desactivada |
| 403 | `FORBIDDEN` | El rol no tiene permiso |
| 404 | `USER_NOT_FOUND`, `PAYMENT_NOT_FOUND`, `RECEIPT_NOT_FOUND` | No existe |
| 409 | `CEDULA_TAKEN` | Ya hay una persona con esa cédula |
| 409 | `CANNOT_CHANGE_OWN_ROLE`, `CANNOT_DEACTIVATE_SELF` | Acción sobre la propia cuenta |
| 409 | `LAST_ADMIN` | Quedaría sin administradores activos |
| 409 | `DUPLICATE_REFERENCE` | Referencia y banco ya usados en un pago en revisión o aprobado |
| 409 | `INVALID_PAYMENT_STATE` | El pago no está en el estado necesario (p. ej. ya fue revisado) |
| 413 | `PAYLOAD_TOO_LARGE` | La captura supera 5 MB |
| 422 | `VALIDATION_ERROR` | Datos con formato inválido (ver `details`) |
| 422 | `INVALID_CEDULA`, `INVALID_PERIOD`, `DATE_IN_FUTURE` | Cédula, periodo o fecha inválidos |
| 422 | `INVALID_CURRENT_PASSWORD`, `PASSWORD_REUSED` | Cambio de contraseña |
| 422 | `RATE_MISSING` | No hay tasa para esa moneda y fecha |
| 422 | `FEE_NOT_CONFIGURED` | Todavía no se configuró la cuota mensual |
| 422 | `MOBILE_PAYMENT_VES_ONLY` | Pago móvil en una moneda distinta de VES |
| 422 | `INVALID_RECEIPT` | La captura no es JPG ni PNG |
| 429 | `TOO_MANY_ATTEMPTS`, `TOO_MANY_REQUESTS` | Demasiados intentos de login (por cédula o por IP) |
| 503 | `DB_UNAVAILABLE`, `STORAGE_NOT_CONFIGURED` | Base de datos o almacenamiento no disponibles |

## Endpoints

**Público**

| Método y ruta | Descripción |
| --- | --- |
| `GET /health` | Estado de la API y de la base de datos |
| `POST /auth/login` | `{ cedula, password }` → `{ accessToken, expiresIn, role, mustChangePassword, user }` |

**Cualquier sesión**

| Método y ruta | Descripción |
| --- | --- |
| `POST /auth/change-password` | `{ currentPassword, newPassword }` → sesión nueva. Única ruta permitida con contraseña temporal. |
| `GET /me` | Perfil propio |
| `GET /me/status` | Estado del mes actual, meses adeudados y total pendiente en USD/VES/COP |
| `GET /me/payments` | Historial propio, del más reciente al más antiguo |
| `GET /billing/current` | Periodo actual, cuota en USD/VES/COP y tasas vigentes (con `stale`) |

**Solo `ESTUDIANTE`**

| Método y ruta | Descripción |
| --- | --- |
| `POST /me/payments/mobile` | Reporta un pago móvil (`multipart/form-data`): `reference`, `bank`, `payerPhone`, `paidAt`, `amount`, `periodo` opcional y `receipt` opcional (JPG/PNG ≤ 5 MB). Queda `EN_REVISION`. |

**Solo `ADMIN`: personas**

| Método y ruta | Descripción |
| --- | --- |
| `GET /users` | Lista paginada. Filtros: `q` (cédula o nombre), `role`, `estado` (del periodo), `periodo`, `active`. Cada ítem trae su estado del periodo. |
| `POST /users` | `{ cedula, fullName, phone?, role? }` → `{ user, temporaryPassword }` |
| `GET /users/{id}` | Perfil |
| `PATCH /users/{id}` | `{ fullName?, phone?, active? }` |
| `PATCH /users/{id}/role` | `{ role }` |
| `POST /users/{id}/reset-password` | → `{ temporaryPassword }`; cierra sus sesiones |

**Solo `ADMIN`: pagos**

| Método y ruta | Descripción |
| --- | --- |
| `GET /payments` | Lista paginada. Filtros: `status`, `periodo`, `userId`, `method`, `currency`. |
| `POST /payments/cash` | `{ userId, periodo, currency, amount, paidAt?, note? }` → pago `APROBADO` |
| `POST /payments/{id}/approve` | `{ note? }`; de `EN_REVISION` a `APROBADO` |
| `POST /payments/{id}/reject` | `{ reason }`; de `EN_REVISION` a `RECHAZADO` |
| `POST /payments/{id}/void` | `{ reason }`; de `APROBADO` a `ANULADO` |
| `GET /payments/{id}/receipt` | `{ url, expiresIn }`: URL firmada de la captura, válida 5 minutos |

**Solo `ADMIN`: cuota, tasas y métricas**

| Método y ruta | Descripción |
| --- | --- |
| `PUT /billing/fee` | `{ feeUsd }` → `{ feeUsd, currentPeriod, currentPeriodFeeUsd }` |
| `POST /billing/rates` | `{ currency: "VES" \| "COP", ratePerUsd, effectiveDate? }` (por defecto, hoy) |
| `GET /billing/rates` | Historial; filtros `currency` y `limit` (30 por defecto, máximo 365) |
| `GET /metrics/summary` | Resumen del periodo (`?periodo=`, por defecto el actual) |
| `GET /metrics/monthly` | Total en USD de los últimos `months` meses (6 por defecto, máximo 24) |
| `GET /metrics/recent` | Últimos pagos aprobados (`limit`: 10 por defecto, máximo 50) |

## Ejemplos

Iniciar sesión:

```bash
curl -s http://localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"cedula":"V-12.345.678","password":"…"}'
```

Registrar un pago en efectivo de Bs 1.000,00:

```bash
curl -s http://localhost:3000/payments/cash \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"userId":"<uuid>","periodo":"2026-10","currency":"VES","amount":"1000.00"}'
```

Respuesta (resumida):

```json
{
  "id": "…",
  "periodo": "2026-10",
  "method": "EFECTIVO",
  "currency": "VES",
  "amount": "1000.00",
  "rate": "200.0000",
  "rateDate": "2026-10-26",
  "amountUsd": "5.00",
  "status": "APROBADO"
}
```

Reportar un pago móvil con captura:

```bash
curl -s http://localhost:3000/me/payments/mobile \
  -H "authorization: Bearer $TOKEN" \
  -F reference=004512 -F bank=0134 -F payerPhone=04141234567 \
  -F paidAt=2026-10-26 -F amount=1000.00 -F receipt=@captura.png
```

## Mantener el contrato

`openapi.json` se genera desde el código (`npm run openapi`) y la CI falla si quedó desactualizado. La web genera sus tipos a partir de este archivo (`npm run api:types` en View-Internet), así que cualquier cambio en un DTO se refleja allá al regenerar.

> **Pendiente conocido:** los parámetros `page` y `pageSize` se publican como `allOf: [Object]` en lugar de `integer`. Falta `type: Number` en su `@ApiPropertyOptional`. La web lo corrige al generar sus tipos.
