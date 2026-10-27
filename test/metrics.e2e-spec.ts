import { Role } from '@prisma/client';
import {
  bearer,
  createApp,
  periodOffset,
  resetDb,
  seedAndLogin,
  seedUser,
  setupBilling,
  TestContext,
  thisPeriod,
  today,
} from './helpers';

/**
 * Datos semilla con totales calculados a mano (cuota $5.00, 200 Bs/USD, 4000 COP/USD):
 *
 *   A  efectivo USD 5.00                 → AL_DIA      (+ USD 3.00 anulado: no suma)
 *   B  pago móvil Bs 1000 aprobado       → AL_DIA
 *   C  efectivo COP 8000 = $2.00         → PARCIAL
 *   D  pago móvil Bs 600 en revisión     → EN_REVISION
 *   E  pago móvil Bs 500 rechazado       → PENDIENTE
 *   F  desactivado, efectivo USD 5.00    → suma al recaudado, no al esperado ni a los estados
 *   A  periodo anterior: efectivo USD 5.00; B periodo anterior: pago móvil en revisión
 *
 * Recaudado: USD 10.00 ($10) · VES 1000.00 ($5) · COP 8000.00 ($2) → $17.00
 * Esperado: 5 estudiantes activos × $5.00 = $25.00 → 68.00 %
 */
describe('dashboard-metrics (e2e)', () => {
  let ctx: TestContext;
  let adminToken: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ctx = await createApp();
    await resetDb(ctx.prisma);
    ({ token: adminToken } = await seedAndLogin(ctx, { cedula: '10000001', role: Role.ADMIN }));
    await setupBilling(ctx, adminToken);

    const tokens: Record<string, string> = {};
    for (const [i, name] of ['A', 'B', 'C', 'D', 'E', 'F'].entries()) {
      const { user, token } = await seedAndLogin(ctx, {
        cedula: `2000000${i}`,
        fullName: `Estudiante ${name}`,
      });
      ids[name] = user.id;
      tokens[name] = token;
    }

    const cash = async (user: string, currency: string, amount: string, periodo = thisPeriod()) =>
      (
        await ctx
          .http()
          .post('/payments/cash')
          .set(bearer(adminToken))
          .send({ userId: ids[user], periodo, currency, amount })
          .expect(201)
      ).body as { id: string };
    const mobile = async (
      user: string,
      reference: string,
      amount: string,
      periodo = thisPeriod(),
    ) =>
      (
        await ctx
          .http()
          .post('/me/payments/mobile')
          .set(bearer(tokens[user]))
          .field('reference', reference)
          .field('bank', '0134')
          .field('payerPhone', '04141234567')
          .field('paidAt', today())
          .field('amount', amount)
          .field('periodo', periodo)
          .expect(201)
      ).body as { id: string };
    const review = (id: string, action: 'approve' | 'reject' | 'void', reason?: string) =>
      ctx
        .http()
        .post(`/payments/${id}/${action}`)
        .set(bearer(adminToken))
        .send(reason ? { reason } : {})
        .expect(200);

    await cash('A', 'USD', '5.00', periodOffset(-1));
    await mobile('B', '100001', '1000.00', periodOffset(-1));
    await cash('A', 'USD', '5.00');
    await review((await cash('A', 'USD', '3.00')).id, 'void', 'Duplicado');
    await cash('C', 'COP', '8000.00');
    await mobile('D', '100002', '600.00');
    await review((await mobile('E', '100003', '500.00')).id, 'reject', 'No aparece');
    await cash('F', 'USD', '5.00');
    await ctx
      .http()
      .patch(`/users/${ids.F}`)
      .set(bearer(adminToken))
      .send({ active: false })
      .expect(200);
    // El último en aprobarse: debe encabezar /metrics/recent.
    await review((await mobile('B', '100004', '1000.00')).id, 'approve');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('resumen del periodo con totales por moneda, esperado, estados y por revisar', async () => {
    const res = await ctx.http().get('/metrics/summary').set(bearer(adminToken)).expect(200);
    expect(res.body).toEqual({
      periodo: thisPeriod(),
      feeUsd: '5.00',
      collected: {
        USD: { amount: '10.00', amountUsd: '10.00', count: 2 },
        VES: { amount: '1000.00', amountUsd: '5.00', count: 1 },
        COP: { amount: '8000.00', amountUsd: '2.00', count: 1 },
      },
      totalUsd: '17.00',
      expectedUsd: '25.00',
      percentCollected: '68.00',
      students: { total: 5, AL_DIA: 2, PARCIAL: 1, EN_REVISION: 1, PENDIENTE: 1 },
      inReview: { period: 1, total: 2 },
    });
  });

  it('acepta un periodo explícito', async () => {
    const res = await ctx
      .http()
      .get('/metrics/summary')
      .query({ periodo: periodOffset(-1) })
      .set(bearer(adminToken))
      .expect(200);
    expect(res.body).toMatchObject({
      periodo: periodOffset(-1),
      totalUsd: '5.00',
      collected: { USD: { amount: '5.00', count: 1 } },
      inReview: { period: 1, total: 2 },
    });
  });

  it('serie de los últimos 6 meses, de la más antigua a la más reciente, con ceros', async () => {
    const res = await ctx
      .http()
      .get('/metrics/monthly')
      .query({ months: 6 })
      .set(bearer(adminToken))
      .expect(200);
    expect(res.body).toEqual([
      { periodo: periodOffset(-5), totalUsd: '0.00' },
      { periodo: periodOffset(-4), totalUsd: '0.00' },
      { periodo: periodOffset(-3), totalUsd: '0.00' },
      { periodo: periodOffset(-2), totalUsd: '0.00' },
      { periodo: periodOffset(-1), totalUsd: '5.00' },
      { periodo: thisPeriod(), totalUsd: '17.00' },
    ]);
    const def = await ctx.http().get('/metrics/monthly').set(bearer(adminToken)).expect(200);
    expect(def.body).toHaveLength(6);
  });

  it('últimos pagos aprobados, del más reciente al más antiguo', async () => {
    const res = await ctx
      .http()
      .get('/metrics/recent')
      .query({ limit: 10 })
      .set(bearer(adminToken))
      .expect(200);
    expect(res.body).toHaveLength(5);
    expect(res.body[0]).toMatchObject({
      user: { id: ids.B, fullName: 'Estudiante B' },
      method: 'PAGO_MOVIL',
      currency: 'VES',
      amount: '1000.00',
      amountUsd: '5.00',
    });
    expect(res.body.map((p: { user: { id: string } }) => p.user.id)).toEqual([
      ids.B,
      ids.F,
      ids.C,
      ids.A,
      ids.A,
    ]);
    const limited = await ctx
      .http()
      .get('/metrics/recent')
      .query({ limit: 2 })
      .set(bearer(adminToken))
      .expect(200);
    expect(limited.body).toHaveLength(2);
  });

  it('valida los parámetros', async () => {
    await ctx
      .http()
      .get('/metrics/monthly')
      .query({ months: 0 })
      .set(bearer(adminToken))
      .expect(422);
    await ctx
      .http()
      .get('/metrics/recent')
      .query({ limit: 500 })
      .set(bearer(adminToken))
      .expect(422);
    await ctx
      .http()
      .get('/metrics/summary')
      .query({ periodo: '2026-13' })
      .set(bearer(adminToken))
      .expect(422);
  });

  it('las personas desactivadas no se cuentan en el esperado de periodos siguientes', async () => {
    const next = await ctx
      .http()
      .get('/metrics/summary')
      .query({ periodo: periodOffset(1) })
      .set(bearer(adminToken))
      .expect(200);
    expect(next.body.students.total).toBe(5);
    expect(next.body.expectedUsd).toBe('25.00');
    await seedUser(ctx.prisma, { cedula: '29999999' });
    const after = await ctx
      .http()
      .get('/metrics/summary')
      .query({ periodo: periodOffset(1) })
      .set(bearer(adminToken))
      .expect(200);
    expect(after.body.students.total).toBe(6);
  });
});
