import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { normalizeCedula } from '../src/common/domain/cedula';
import { addMonths, currentPeriod, localDate } from '../src/common/domain/period';
import { searchableText } from '../src/common/domain/text';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';
import { ReceiptStorage } from '../src/storage/receipt-storage';

export class InMemoryReceiptStorage extends ReceiptStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
    return Promise.resolve();
  }

  signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    return Promise.resolve(`https://storage.test/${key}?expires=${expiresInSeconds}`);
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}

export interface TestContext {
  app: INestApplication<App>;
  prisma: PrismaService;
  storage: InMemoryReceiptStorage;
  http: () => ReturnType<typeof request>;
}

export async function createApp(): Promise<TestContext> {
  const storage = new InMemoryReceiptStorage();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ReceiptStorage)
    .useValue(storage)
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: ['error'] });
  setupApp(app);
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    storage,
    http: () => request(app.getHttpServer()),
  };
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE audit_logs, payments, exchange_rates, periods, settings, users CASCADE',
  );
}

export interface SeedUserOptions {
  cedula: string;
  fullName?: string;
  role?: Role;
  password?: string;
  mustChangePassword?: boolean;
  active?: boolean;
  createdAt?: Date;
}

export async function seedUser(prisma: PrismaService, opts: SeedUserOptions) {
  const cedula = normalizeCedula(opts.cedula)!;
  const fullName = opts.fullName ?? `Persona ${cedula.digits}`;
  const password = opts.password ?? 'secret-password';
  const user = await prisma.user.create({
    data: {
      cedulaPrefix: cedula.prefix,
      cedulaDigits: cedula.digits,
      fullName,
      fullNameSearch: searchableText(fullName),
      role: opts.role ?? Role.ESTUDIANTE,
      passwordHash: await hash(password, 4),
      mustChangePassword: opts.mustChangePassword ?? false,
      active: opts.active ?? true,
      createdAt: opts.createdAt,
    },
  });
  return { user, password };
}

export async function login(ctx: TestContext, cedula: string, password: string): Promise<string> {
  const res = await ctx.http().post('/auth/login').send({ cedula, password }).expect(200);
  return (res.body as { accessToken: string }).accessToken;
}

export async function seedAndLogin(ctx: TestContext, opts: SeedUserOptions) {
  const { user, password } = await seedUser(ctx.prisma, opts);
  return { user, token: await login(ctx, opts.cedula, password) };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Configura cuota y tasas del día (por defecto $5.00, 200 Bs/USD y 4000 COP/USD). */
export async function setupBilling(
  ctx: TestContext,
  adminToken: string,
  opts: { fee?: string; ves?: string | null; cop?: string | null } = {},
): Promise<void> {
  await ctx
    .http()
    .put('/billing/fee')
    .set(bearer(adminToken))
    .send({ feeUsd: opts.fee ?? '5.00' })
    .expect(200);
  for (const [currency, value] of [
    ['VES', opts.ves === undefined ? '200.00' : opts.ves],
    ['COP', opts.cop === undefined ? '4000.00' : opts.cop],
  ] as const) {
    if (value === null) continue;
    await ctx
      .http()
      .post('/billing/rates')
      .set(bearer(adminToken))
      .send({ currency, ratePerUsd: value })
      .expect(201);
  }
}

const TZ = 'America/Caracas';
export const today = () => localDate(TZ);
export const thisPeriod = () => currentPeriod(TZ);
export const periodOffset = (delta: number) => addMonths(thisPeriod(), delta);

export const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
