import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_TIMEZONE: z.string().default('America/Caracas'),

  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(8 * 60 * 60),
  AUTH_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(60_000),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),

  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  LOGIN_IP_LIMIT: z.coerce.number().int().positive().default(30),
  /** Saltos de proxy de confianza para leer la IP real de X-Forwarded-For (0 = ninguno). */
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),

  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default('false'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Variables de entorno inválidas:\n${issues.join('\n')}`);
  }
  return parsed.data;
}
