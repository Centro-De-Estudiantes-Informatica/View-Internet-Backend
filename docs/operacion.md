# Operación

## Desarrollo local

Requisitos: Node.js 22+ y Docker.

```bash
cp .env.example .env
docker compose up -d db s3      # Postgres en :5434 (+ base de pruebas) y RustFS (S3) en :9000/:9001
npm install
npm run db:deploy               # aplica las migraciones
npm run db:seed                 # crea el primer ADMIN desde SEED_ADMIN_*
npm run s3:bucket               # crea el bucket de capturas (idempotente)
npm run dev                     # API en http://localhost:3000, Swagger en /docs
```

Primeros pasos con la API vacía:

1. Inicia sesión con la cédula y contraseña de `SEED_ADMIN_*`: la API exige cambiar la contraseña.
2. Configura la cuota mensual (`PUT /billing/fee`). Sin ella no se pueden registrar pagos ni calcular estados.
3. Carga la tasa del día de VES y COP (`POST /billing/rates`).

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
| `TRUST_PROXY` | `0` | Saltos de proxy de confianza para leer la IP de `X-Forwarded-For`. En Vercel no hace falta |
| `CLIENT_IP_SECRET` | — | Secreto compartido con la web (≥ 32 caracteres) para confiar en su header `X-Client-IP`. Debe ser igual en los dos proyectos |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | — | Almacenamiento de capturas (R2, RustFS, Neon Object Storage…). Sin ellas, las capturas responden `STORAGE_NOT_CONFIGURED` |
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

La API corre en **Vercel** como una función (NestJS sin configuración, entrada `src/main.ts`). `vercel.json` fija el framework y la región `iad1`, la misma de Neon (`aws-us-east-1`).

| Pieza | Producción | Vistas previas |
| --- | --- | --- |
| Proyecto Vercel | `view-internet-api` (entorno Production) | `view-internet-api` (entorno Preview) |
| Neon (proyecto `view-internet`) | rama `main` | rama `preview` |
| Bucket de capturas | `receipts` en la rama `main` (Neon Object Storage) | `receipts` en la rama `preview` |

Cada entorno de Vercel tiene sus propias variables: `DATABASE_URL` (host `-pooler`), `DIRECT_URL`, `JWT_SECRET`, `CLIENT_IP_SECRET` (igual que en la web), `APP_TIMEZONE` y las `S3_*` de su rama. `TRUST_PROXY` no hace falta en Vercel.

Pasos para una versión nueva:

1. Si hay migraciones, el workflow `migrate.yml` las aplica a producción al hacer push a `main`. Hay que aplicarlas **antes** de que la versión nueva reciba tráfico.
2. Desplegar (`vercel deploy --prod`, o automático al hacer push si el repo está conectado a Vercel) y verificar `GET /health` → `{ "status": "ok", "db": "ok" }`.
3. Correr `npm run smoke` contra la URL pública.

Swagger (`/docs`) toma sus archivos estáticos del CDN cuando corre en Vercel, porque la función no incluye `swagger-ui-dist`.

El `Dockerfile` sigue sirviendo para otros hosts de contenedores (Render, Railway, Fly.io); en ese caso hay que configurar `TRUST_PROXY`.

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
