# Operación

## Desarrollo local

Requisitos: Node.js 22+ y Docker.

```bash
cp .env.example .env
docker compose up -d db minio   # Postgres en :5434 (+ base de pruebas) y MinIO en :9000/:9001
npm install
npm run db:deploy               # aplica las migraciones
npm run db:seed                 # crea el primer ADMIN desde SEED_ADMIN_*
npm run dev                     # API en http://localhost:3000, Swagger en /docs
```

Primeros pasos con la API vacía:

1. Inicia sesión con la cédula y contraseña de `SEED_ADMIN_*`: la API exige cambiar la contraseña.
2. Configura la cuota mensual (`PUT /billing/fee`). Sin ella no se pueden registrar pagos ni calcular estados.
3. Carga la tasa del día de VES y COP (`POST /billing/rates`).
4. Para las capturas de pago móvil, crea el bucket `receipts` en la consola de MinIO (http://localhost:9001, usuario `minio`, contraseña `minio-secret`).

Con la web: en View-Internet usa `API_BASE_URL=http://localhost:3000` y `npm run dev` (puerto 3001).

## Variables de entorno

Se validan al arrancar (`src/config/env.ts`): si falta una obligatoria o tiene mal formato, la API no inicia y dice cuál.

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test` o `production` |
| `PORT` | `3000` | Puerto HTTP |
| `APP_TIMEZONE` | `America/Caracas` | Zona para "hoy" y el periodo actual |
| `DATABASE_URL` | — (obligatoria) | Postgres. En Neon, el host agrupado (`-pooler`) |
| `DIRECT_URL` | — | Host directo de Neon, para migraciones |
| `JWT_SECRET` | — (obligatoria) | Al menos 32 caracteres. Cambiarlo cierra todas las sesiones |
| `JWT_EXPIRES_IN_SECONDS` | `28800` (8 h) | Duración del token |
| `AUTH_CACHE_TTL_MS` | `60000` | Caché del estado de autenticación por usuario |
| `BCRYPT_COST` | `12` | Costo de bcrypt (4–15) |
| `LOGIN_MAX_FAILED_ATTEMPTS` | `5` | Fallos por cédula antes de bloquear |
| `LOGIN_WINDOW_MS` | `900000` (15 min) | Ventana de los límites del login |
| `LOGIN_IP_LIMIT` | `30` | Intentos de login por IP en la ventana |
| `TRUST_PROXY` | `0` | Saltos de proxy de confianza para leer la IP de `X-Forwarded-For`. En producción detrás de un balanceador, normalmente `1` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | — | Almacenamiento de capturas (R2, MinIO, Neon Object Storage…). Sin ellas, las capturas responden `STORAGE_NOT_CONFIGURED` |
| `SEED_ADMIN_CEDULA`, `SEED_ADMIN_NAME`, `SEED_ADMIN_PASSWORD` | — | Solo para `npm run db:seed` |
| `TEST_DATABASE_URL` | — | Base de las pruebas e2e (se vacía en cada corrida) |

## Base de datos

| Comando | Uso |
| --- | --- |
| `npm run db:migrate` | Crea una migración nueva en desarrollo a partir de `schema.prisma` |
| `npm run db:deploy` | Aplica las migraciones pendientes (local, CI, producción) |
| `npm run db:seed` | Crea el primer administrador. Es idempotente: si la cédula existe, no la toca |

**Cuidado con las migraciones nuevas:** el índice único parcial `(bank, reference)` y los `CHECK` solo existen en el SQL de la migración inicial. Si `prisma migrate dev` propone borrarlos, quita esas líneas del SQL generado antes de aplicarlo.

## Pruebas

| Comando | Qué cubre |
| --- | --- |
| `npm test` | Unitarias del dominio: cédulas, dinero, periodos, estado mensual, texto, tipo de imagen |
| `npm run test:e2e` | La API completa contra `TEST_DATABASE_URL`: aplica migraciones, vacía las tablas y prueba autenticación, personas, pagos y métricas |
| `npm run smoke` | Prueba de humo contra una API desplegada (ver abajo) |

### Prueba de humo

```bash
BASE_URL=https://api.ejemplo.com SMOKE_ADMIN_CEDULA=… SMOKE_ADMIN_PASSWORD=… npm run smoke
```

Inicia sesión como administrador, crea un estudiante, le registra un pago en efectivo, verifica que las métricas lo reflejen y al final anula el pago y desactiva al estudiante (nada se borra; queda en la auditoría). La cuota mensual ya debe estar configurada.

## Integración continua

| Workflow | Cuándo | Qué hace |
| --- | --- | --- |
| `.github/workflows/ci.yml` | En cada PR y push a `main` | Lint, formato, tipos, unitarias, e2e (con Postgres de servicio), build y verificación de que `openapi.json` esté al día |
| `.github/workflows/migrate.yml` | Push a `main` que toque `prisma/migrations/`, o manual | `prisma migrate deploy` contra producción, usando el secreto `DIRECT_URL` del entorno `production` |

Si cambias un DTO o un controlador, corre `npm run openapi` y commitea `openapi.json`; si no, la CI falla.

## Despliegue

El `Dockerfile` genera una imagen genérica (Node 22, usuario sin privilegios, puerto 3000) que sirve para Render, Railway, Fly.io o cualquier host de contenedores. El hosting definitivo todavía no está elegido.

Pasos:

1. Crear la base en Neon (rama `main` para producción) y el bucket privado de capturas.
2. Configurar las variables de entorno de producción, con `JWT_SECRET` nuevo y `TRUST_PROXY` según el hosting.
3. Aplicar las migraciones (workflow `migrate.yml` o `npm run db:deploy`) y correr la semilla una vez.
4. Desplegar la imagen y verificar `GET /health` → `{ "status": "ok", "db": "ok" }`.
5. Correr `npm run smoke` contra la URL pública.
6. Configurar en la web `API_BASE_URL` con esa URL.

## Problemas frecuentes

| Síntoma | Causa probable |
| --- | --- |
| La API no arranca: "Variables de entorno inválidas" | Falta `DATABASE_URL` o `JWT_SECRET` tiene menos de 32 caracteres |
| `FEE_NOT_CONFIGURED` en todo | No se ha configurado la cuota: `PUT /billing/fee` |
| `RATE_MISSING` al registrar en Bs o COP | No hay tasa de esa moneda en o antes de la fecha del pago |
| `STORAGE_NOT_CONFIGURED` al reportar con captura | Faltan las variables `S3_*` o no existe el bucket |
| `429` en el login para todos los usuarios | El límite por IP cuenta la IP del servidor de la web: configura `TRUST_PROXY` (la web ya reenvía `X-Forwarded-For`) |
| Un cambio de rol tarda en aplicar | Con varias instancias, cada una tiene su caché de 60 s (`AUTH_CACHE_TTL_MS`) |
| `/health` responde 503 `DB_UNAVAILABLE` | La base no responde; en Neon, revisa que el compute no esté suspendido o la URL sea correcta |
