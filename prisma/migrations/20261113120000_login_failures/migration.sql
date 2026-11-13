-- CreateTable
CREATE TABLE "login_failures" (
    "id" BIGSERIAL NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_failures_key_created_at_idx" ON "login_failures"("key", "created_at");
