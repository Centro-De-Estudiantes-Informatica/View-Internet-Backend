-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "CedulaPrefix" AS ENUM ('V', 'E');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ESTUDIANTE', 'ADMIN');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'VES', 'COP');

-- CreateEnum
CREATE TYPE "RateCurrency" AS ENUM ('VES', 'COP');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('EFECTIVO', 'PAGO_MOVIL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('EN_REVISION', 'APROBADO', 'RECHAZADO', 'ANULADO');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "cedula_prefix" "CedulaPrefix" NOT NULL,
    "cedula_digits" VARCHAR(10) NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "full_name_search" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(20),
    "role" "Role" NOT NULL DEFAULT 'ESTUDIANTE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" VARCHAR(64) NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "periods" (
    "id" CHAR(7) NOT NULL,
    "fee_usd" DECIMAL(10,2) NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "currency" "RateCurrency" NOT NULL,
    "rate_per_usd" DECIMAL(18,4) NOT NULL,
    "effective_date" DATE NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "period_id" CHAR(7) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "rate" DECIMAL(18,4) NOT NULL,
    "rate_date" DATE,
    "amount_usd" DECIMAL(10,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "reference" VARCHAR(30),
    "bank" VARCHAR(4),
    "payer_phone" VARCHAR(20),
    "paid_at" DATE NOT NULL,
    "receipt_key" TEXT,
    "note" VARCHAR(500),
    "registered_by" UUID,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" VARCHAR(500),
    "voided_by" UUID,
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "entity" VARCHAR(32) NOT NULL,
    "entity_id" VARCHAR(64) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_cedula_digits_idx" ON "users"("cedula_digits");

-- CreateIndex
CREATE INDEX "users_role_active_idx" ON "users"("role", "active");

-- CreateIndex
CREATE UNIQUE INDEX "users_cedula_prefix_cedula_digits_key" ON "users"("cedula_prefix", "cedula_digits");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_currency_effective_date_key" ON "exchange_rates"("currency", "effective_date");

-- CreateIndex
CREATE INDEX "payments_period_id_status_idx" ON "payments"("period_id", "status");

-- CreateIndex
CREATE INDEX "payments_user_id_period_id_idx" ON "payments"("user_id", "period_id");

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_registered_by_fkey" FOREIGN KEY ("registered_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Referencia de pago móvil única por banco entre pagos vigentes (no rechazados ni anulados).
CREATE UNIQUE INDEX "payments_bank_reference_active_key"
  ON "payments" ("bank", "reference")
  WHERE "status" IN ('EN_REVISION', 'APROBADO') AND "reference" IS NOT NULL;

-- Búsqueda parcial por nombre (full_name_search ya viene en minúsculas y sin acentos).
CREATE INDEX "users_full_name_search_trgm_idx"
  ON "users" USING GIN ("full_name_search" gin_trgm_ops);

-- Búsqueda parcial por dígitos de la cédula.
CREATE INDEX "users_cedula_digits_trgm_idx"
  ON "users" USING GIN ("cedula_digits" gin_trgm_ops);

-- Los montos nunca son negativos ni cero; la tasa siempre es positiva.
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0 AND "rate" > 0);
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_rate_positive" CHECK ("rate_per_usd" > 0);
ALTER TABLE "periods" ADD CONSTRAINT "periods_id_format" CHECK ("id" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
