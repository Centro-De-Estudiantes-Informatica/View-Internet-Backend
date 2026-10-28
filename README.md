# View-Internet-Backend

API REST del control de pagos del internet de la sede de Informática (NestJS + Prisma + PostgreSQL).
La app web [`View-Internet`](../View-Internet) consume esta API; el contrato está en `openapi.json`
y en `/docs` (Swagger UI) con el servidor en marcha.

**Documentación:** [`docs/`](docs/README.md): [arquitectura](docs/arquitectura.md),
[modelo de datos](docs/modelo-de-datos.md), [reglas de negocio](docs/reglas-de-negocio.md),
[API](docs/api.md) y [operación](docs/operacion.md).

## Desarrollo local

```bash
cp .env.example .env
docker compose up -d db minio      # Postgres en :5434 (+ base view_internet_test) y MinIO en :9000
npm install
npm run db:deploy                  # aplica las migraciones
npm run db:seed                    # primer ADMIN desde SEED_ADMIN_* (debe cambiar la contraseña)
npm run dev
```

Para las capturas de pago móvil en local, crea el bucket `receipts` en la consola de MinIO
(http://localhost:9001, usuario `minio` / `minio-secret`).

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` / `build` / `start` | Servidor en modo watch / compilación / producción |
| `npm test` | Pruebas unitarias (dominio: cédulas, dinero, estados) |
| `npm run test:e2e` | Pruebas e2e contra `TEST_DATABASE_URL` (aplica migraciones y vacía las tablas) |
| `npm run lint` / `format` / `typecheck` | Calidad de código |
| `npm run openapi` | Regenera `openapi.json` (CI falla si quedó desactualizado) |
| `npm run db:migrate` | Crea una migración nueva en desarrollo |
| `npm run smoke` | Prueba de humo contra `BASE_URL` (ver `scripts/smoke.ts`) |

## Notas

- **Montos**: siempre `Decimal` en el dominio y strings con 2 decimales en la API (`"1000.00"`).
- **Errores**: todos responden `{ code, message }` (`LAST_ADMIN`, `DUPLICATE_REFERENCE`, `RATE_MISSING`,
  `PASSWORD_CHANGE_REQUIRED`, …).
- **Migraciones**: el índice único parcial de pagos `(bank, reference)` y los `CHECK` solo existen en el
  SQL de `prisma/migrations`. Si `prisma migrate dev` propone borrarlos en una migración nueva, quita
  esas líneas antes de aplicarla.
- **Neon**: `DATABASE_URL` usa el host agrupado (`-pooler`) y `DIRECT_URL` el directo (migraciones).
- **Límite por IP en el login**: la web llama a la API desde su servidor (BFF); para que el límite
  sea por usuario, la web debe reenviar `X-Forwarded-For` y la API configurar `TRUST_PROXY`.
