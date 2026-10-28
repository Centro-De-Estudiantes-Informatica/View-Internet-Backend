import { Role } from '@prisma/client';
import { addDays } from '../src/common/domain/dates';
import {
  bearer,
  createApp,
  periodOffset,
  PNG_BYTES,
  resetDb,
  seedAndLogin,
  setupBilling,
  TestContext,
  thisPeriod,
  today,
} from './helpers';

describe('payments (e2e)', () => {
  let ctx: TestContext;
  let adminToken: string;
  let admin: { id: string };
  let jose: { id: string };
  let joseToken: string;
  let ana: { id: string };
  let anaToken: string;

  beforeAll(async () => {
    ctx = await createApp();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    ctx.storage.objects.clear();
    ({ user: admin, token: adminToken } = await seedAndLogin(ctx, {
      cedula: '10000001',
      role: Role.ADMIN,
    }));
    ({ user: jose, token: joseToken } = await seedAndLogin(ctx, {
      cedula: '30555111',
      fullName: 'José Rodríguez',
    }));
    ({ user: ana, token: anaToken } = await seedAndLogin(ctx, {
      cedula: '28123456',
      fullName: 'Ana Gómez',
    }));
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const cash = (body: Record<string, string>) =>
    ctx
      .http()
      .post('/payments/cash')
      .set(bearer(adminToken))
      .send({ periodo: thisPeriod(), ...body });

  const mobile = (token: string, fields: Record<string, string> = {}, file?: Buffer) => {
    const req = ctx.http().post('/me/payments/mobile').set(bearer(token));
    const all = {
      reference: '004512',
      bank: '0134',
      payerPhone: '04141234567',
      paidAt: today(),
      amount: '1000.00',
      ...fields,
    };
    for (const [k, v] of Object.entries(all)) void req.field(k, v);
    if (file) void req.attach('receipt', file, 'captura.png');
    return req;
  };

  const myStatus = async (token: string) =>
    (await ctx.http().get('/me/status').set(bearer(token)).expect(200)).body;

  describe('con cuota y tasas configuradas', () => {
    beforeEach(async () => {
      await setupBilling(ctx, adminToken);
    });

    describe('Pagos multimoneda con tasa congelada', () => {
      it('pago en bolívares: amountUsd = 5.00 con tasa 200', async () => {
        const res = await cash({ userId: jose.id, currency: 'VES', amount: '1000.00' }).expect(201);
        expect(res.body).toMatchObject({
          currency: 'VES',
          amount: '1000.00',
          rate: '200.0000',
          rateDate: today(),
          amountUsd: '5.00',
        });
      });

      it('un cambio de tasa posterior no recalcula pagos existentes', async () => {
        const res = await cash({ userId: jose.id, currency: 'VES', amount: '1000.00' }).expect(201);
        await ctx
          .http()
          .post('/billing/rates')
          .set(bearer(adminToken))
          .send({ currency: 'VES', ratePerUsd: '210.00' })
          .expect(201);
        const row = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: res.body.id } });
        expect(row.amountUsd.toFixed(2)).toBe('5.00');
        expect(row.rate.toFixed(2)).toBe('200.00');
        const after = await cash({ userId: ana.id, currency: 'VES', amount: '1000.00' }).expect(
          201,
        );
        expect(after.body.amountUsd).toBe('4.76');
      });

      it('día sin tasa nueva: usa la última anterior e informa su fecha', async () => {
        const old = addDays(today(), -3);
        await ctx.prisma.exchangeRate.deleteMany({ where: { currency: 'COP' } });
        await ctx
          .http()
          .post('/billing/rates')
          .set(bearer(adminToken))
          .send({ currency: 'COP', ratePerUsd: '4000.00', effectiveDate: old })
          .expect(201);
        const res = await cash({ userId: jose.id, currency: 'COP', amount: '20000.00' }).expect(
          201,
        );
        expect(res.body).toMatchObject({ rate: '4000.0000', rateDate: old, amountUsd: '5.00' });
      });

      it('una tasa con fecha futura no se acepta', async () => {
        await ctx
          .http()
          .post('/billing/rates')
          .set(bearer(adminToken))
          .send({ currency: 'VES', ratePerUsd: '210.00', effectiveDate: addDays(today(), 2) })
          .expect(422);
      });
    });

    describe('Efectivo registrado por el administrador', () => {
      it('USD en efectivo queda APROBADO con registeredBy y deja al estudiante AL_DIA', async () => {
        const res = await cash({ userId: jose.id, currency: 'USD', amount: '5.00' }).expect(201);
        expect(res.body).toMatchObject({
          method: 'EFECTIVO',
          status: 'APROBADO',
          registeredBy: admin.id,
          rate: '1.0000',
          rateDate: null,
          amountUsd: '5.00',
          user: { id: jose.id, cedula: 'V-30.555.111', fullName: 'José Rodríguez' },
        });
        expect((await myStatus(joseToken)).current.status).toBe('AL_DIA');
      });

      it.each(['0', '0.00', '-5.00', 'abc', '5.001'])('monto inválido %s: 422', async (amount) => {
        await cash({ userId: jose.id, currency: 'USD', amount }).expect(422);
      });

      it('persona inexistente: 404', async () => {
        await cash({
          userId: '00000000-0000-4000-8000-000000000000',
          currency: 'USD',
          amount: '5.00',
        }).expect(404);
      });

      it('un estudiante no puede registrar efectivo', async () => {
        await ctx
          .http()
          .post('/payments/cash')
          .set(bearer(joseToken))
          .send({ userId: jose.id, periodo: thisPeriod(), currency: 'USD', amount: '5.00' })
          .expect(403);
      });
    });

    describe('Reporte de pago móvil', () => {
      it('queda EN_REVISION y aparece en la cola del administrador', async () => {
        const res = await mobile(joseToken).expect(201);
        expect(res.body).toMatchObject({
          method: 'PAGO_MOVIL',
          status: 'EN_REVISION',
          currency: 'VES',
          reference: '004512',
          bank: '0134',
          amountUsd: '5.00',
          hasReceipt: false,
        });
        const queue = await ctx
          .http()
          .get('/payments')
          .query({ status: 'EN_REVISION' })
          .set(bearer(adminToken))
          .expect(200);
        expect(queue.body.items.map((p: { id: string }) => p.id)).toEqual([res.body.id]);
        expect((await myStatus(joseToken)).current.status).toBe('EN_REVISION');
      });

      it('referencia duplicada en el mismo banco: 409 DUPLICATE_REFERENCE', async () => {
        await mobile(joseToken).expect(201);
        const dup = await mobile(anaToken).expect(409);
        expect(dup.body.code).toBe('DUPLICATE_REFERENCE');
        // Otro banco con la misma referencia sí se acepta.
        await mobile(anaToken, { bank: '0102' }).expect(201);
      });

      it('una referencia rechazada se puede volver a reportar', async () => {
        const first = await mobile(joseToken).expect(201);
        await ctx
          .http()
          .post(`/payments/${first.body.id}/reject`)
          .set(bearer(adminToken))
          .send({ reason: 'Monto incorrecto' })
          .expect(200);
        await mobile(joseToken).expect(201);
      });

      it.each(['USD', 'COP'])('pago móvil en %s: 422', async (currency) => {
        const res = await mobile(joseToken, { currency }).expect(422);
        expect(res.body.code).toBe('MOBILE_PAYMENT_VES_ONLY');
      });

      it('solo un ESTUDIANTE reporta pagos móviles', async () => {
        await mobile(adminToken).expect(403);
      });

      it('guarda la captura PNG y el administrador obtiene una URL firmada de 5 min', async () => {
        const res = await mobile(joseToken, {}, PNG_BYTES).expect(201);
        expect(res.body.hasReceipt).toBe(true);
        const [key] = [...ctx.storage.objects.keys()];
        expect(key).toMatch(new RegExp(`^receipts/${jose.id}/[0-9a-f-]+\\.png$`));
        expect(ctx.storage.objects.get(key)?.contentType).toBe('image/png');

        const url = await ctx
          .http()
          .get(`/payments/${res.body.id}/receipt`)
          .set(bearer(adminToken))
          .expect(200);
        expect(url.body).toEqual({ url: expect.stringContaining(key), expiresIn: 300 });
        await ctx.http().get(`/payments/${res.body.id}/receipt`).set(bearer(joseToken)).expect(403);
      });

      it('rechaza capturas que no son JPG/PNG reales o de más de 5 MB', async () => {
        const fake = await mobile(joseToken, {}, Buffer.from('%PDF-1.7 no es imagen')).expect(422);
        expect(fake.body.code).toBe('INVALID_RECEIPT');
        const big = Buffer.concat([PNG_BYTES, Buffer.alloc(5 * 1024 * 1024)]);
        await mobile(joseToken, { reference: '999999' }, big).expect(413);
        expect(ctx.storage.objects.size).toBe(0);
        expect(await ctx.prisma.payment.count()).toBe(0);
      });

      it('sin tasa VES: 422 RATE_MISSING', async () => {
        await ctx.prisma.exchangeRate.deleteMany({ where: { currency: 'VES' } });
        const res = await mobile(joseToken).expect(422);
        expect(res.body.code).toBe('RATE_MISSING');
      });
    });

    describe('Revisión de pagos móviles', () => {
      let paymentId: string;

      beforeEach(async () => {
        paymentId = (await mobile(joseToken).expect(201)).body.id;
      });

      it('aprobar: pasa a APROBADO con reviewedBy/reviewedAt y cuenta para el estado', async () => {
        const res = await ctx
          .http()
          .post(`/payments/${paymentId}/approve`)
          .set(bearer(adminToken))
          .send({})
          .expect(200);
        expect(res.body).toMatchObject({ status: 'APROBADO', reviewedBy: admin.id });
        expect(res.body.reviewedAt).toBeTruthy();
        expect((await myStatus(joseToken)).current.status).toBe('AL_DIA');
        expect(
          await ctx.prisma.auditLog.count({
            where: { entityId: paymentId, action: 'PAYMENT_APPROVED' },
          }),
        ).toBe(1);
      });

      it('rechazar exige motivo y el estudiante lo ve en su historial', async () => {
        await ctx
          .http()
          .post(`/payments/${paymentId}/reject`)
          .set(bearer(adminToken))
          .send({})
          .expect(422);
        await ctx
          .http()
          .post(`/payments/${paymentId}/reject`)
          .set(bearer(adminToken))
          .send({ reason: 'La referencia no aparece en el banco' })
          .expect(200);
        const history = await ctx.http().get('/me/payments').set(bearer(joseToken)).expect(200);
        expect(history.body[0]).toMatchObject({
          status: 'RECHAZADO',
          reviewNote: 'La referencia no aparece en el banco',
        });
        expect((await myStatus(joseToken)).current.status).toBe('PENDIENTE');
      });

      it('revisar dos veces: 409', async () => {
        await ctx.http().post(`/payments/${paymentId}/approve`).set(bearer(adminToken)).expect(200);
        const res = await ctx
          .http()
          .post(`/payments/${paymentId}/approve`)
          .set(bearer(adminToken))
          .expect(409);
        expect(res.body.code).toBe('INVALID_PAYMENT_STATE');
        await ctx
          .http()
          .post(`/payments/${paymentId}/reject`)
          .set(bearer(adminToken))
          .send({ reason: 'tarde' })
          .expect(409);
      });

      it('dos aprobaciones simultáneas: solo una gana', async () => {
        const results = await Promise.all(
          [1, 2, 3].map(() =>
            ctx.http().post(`/payments/${paymentId}/approve`).set(bearer(adminToken)),
          ),
        );
        expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
      });

      it('pago inexistente: 404', async () => {
        await ctx
          .http()
          .post('/payments/00000000-0000-4000-8000-000000000000/approve')
          .set(bearer(adminToken))
          .expect(404);
      });
    });

    describe('Anulación en lugar de borrado', () => {
      it('anula un pago aprobado con motivo y recalcula el estado', async () => {
        const paid = await cash({ userId: jose.id, currency: 'USD', amount: '5.00' }).expect(201);
        expect((await myStatus(joseToken)).current.status).toBe('AL_DIA');

        const res = await ctx
          .http()
          .post(`/payments/${paid.body.id}/void`)
          .set(bearer(adminToken))
          .send({ reason: 'Registrado al estudiante equivocado' })
          .expect(200);
        expect(res.body).toMatchObject({
          status: 'ANULADO',
          voidedBy: admin.id,
          voidReason: 'Registrado al estudiante equivocado',
        });
        expect(res.body.voidedAt).toBeTruthy();
        expect((await myStatus(joseToken)).current.status).toBe('PENDIENTE');
        expect(await ctx.prisma.payment.count({ where: { id: paid.body.id } })).toBe(1);
      });

      it('no se anula un pago que no está APROBADO', async () => {
        const pending = await mobile(joseToken).expect(201);
        await ctx
          .http()
          .post(`/payments/${pending.body.id}/void`)
          .set(bearer(adminToken))
          .send({ reason: 'Error' })
          .expect(409);
      });
    });

    describe('Estado mensual calculado', () => {
      it('parcial: Bs 600 a 200 → $3.00 de $5.00, saldo $2.00 / Bs 400,00', async () => {
        await cash({ userId: jose.id, currency: 'VES', amount: '600.00' }).expect(201);
        const status = await myStatus(joseToken);
        expect(status.current).toMatchObject({
          periodo: thisPeriod(),
          status: 'PARCIAL',
          feeUsd: '5.00',
          paidUsd: '3.00',
          balanceUsd: '2.00',
        });
        expect(status.pending).toEqual({ USD: '2.00', VES: '400.00', COP: '8000.00' });
        expect(status.owedPeriods.map((p: { periodo: string }) => p.periodo)).toEqual([
          thisPeriod(),
        ]);
      });

      it('al día dentro de la tolerancia de $0.05', async () => {
        // Bs 990 / 200 = $4.95
        await cash({ userId: jose.id, currency: 'VES', amount: '990.00' }).expect(201);
        const status = await myStatus(joseToken);
        expect(status.current).toMatchObject({ status: 'AL_DIA', balanceUsd: '0.00' });
        expect(status.owedPeriods).toEqual([]);
        expect(status.pending.USD).toBe('0.00');
      });

      it('sin pagos: PENDIENTE con la cuota completa', async () => {
        const status = await myStatus(joseToken);
        expect(status.current).toMatchObject({ status: 'PENDIENTE', balanceUsd: '5.00' });
        expect(status.pending).toEqual({ USD: '5.00', VES: '1000.00', COP: '20000.00' });
      });
    });

    describe('Aislamiento entre estudiantes', () => {
      it('un estudiante no consulta pagos ajenos', async () => {
        await cash({ userId: ana.id, currency: 'USD', amount: '5.00' }).expect(201);
        await ctx
          .http()
          .get('/payments')
          .query({ userId: ana.id })
          .set(bearer(joseToken))
          .expect(403);
        const mine = await ctx.http().get('/me/payments').set(bearer(joseToken)).expect(200);
        expect(mine.body).toEqual([]);
        const hers = await ctx.http().get('/me/payments').set(bearer(anaToken)).expect(200);
        expect(hers.body).toHaveLength(1);
      });

      it('no se puede reportar un pago a nombre de otro', async () => {
        await mobile(joseToken, { userId: ana.id }).expect(422);
        expect(await ctx.prisma.payment.count({ where: { userId: ana.id } })).toBe(0);
      });
    });

    describe('Listado del administrador', () => {
      it('filtra por estado, periodo, persona y método', async () => {
        await cash({ userId: jose.id, currency: 'USD', amount: '5.00' }).expect(201);
        await mobile(anaToken).expect(201);
        const byUser = await ctx
          .http()
          .get('/payments')
          .query({ userId: ana.id, method: 'PAGO_MOVIL', periodo: thisPeriod() })
          .set(bearer(adminToken))
          .expect(200);
        expect(byUser.body.total).toBe(1);
        expect(byUser.body.items[0].user.id).toBe(ana.id);
        const all = await ctx.http().get('/payments').set(bearer(adminToken)).expect(200);
        expect(all.body.total).toBe(2);
      });
    });
  });

  describe('cuota', () => {
    it('cuota en cada moneda con la tasa usada y su fecha', async () => {
      await setupBilling(ctx, adminToken);
      const res = await ctx.http().get('/billing/current').set(bearer(joseToken)).expect(200);
      expect(res.body).toEqual({
        periodo: thisPeriod(),
        feeUsd: '5.00',
        fee: { USD: '5.00', VES: '1000.00', COP: '20000.00' },
        rates: {
          VES: { ratePerUsd: '200.0000', effectiveDate: today(), stale: false },
          COP: { ratePerUsd: '4000.0000', effectiveDate: today(), stale: false },
        },
      });
    });

    it('cambiar la cuota no afecta al periodo ya abierto', async () => {
      await setupBilling(ctx, adminToken, { fee: '5.00' });
      const res = await ctx
        .http()
        .put('/billing/fee')
        .set(bearer(adminToken))
        .send({ feeUsd: '6.00' })
        .expect(200);
      expect(res.body).toEqual({
        feeUsd: '6.00',
        currentPeriod: thisPeriod(),
        currentPeriodFeeUsd: '5.00',
      });
      const next = await cash({
        userId: jose.id,
        currency: 'USD',
        amount: '6.00',
        periodo: periodOffset(1),
      }).expect(201);
      const period = await ctx.prisma.period.findUniqueOrThrow({
        where: { id: next.body.periodo },
      });
      expect(period.feeUsd.toFixed(2)).toBe('6.00');
      const current = await ctx.prisma.period.findUniqueOrThrow({ where: { id: thisPeriod() } });
      expect(current.feeUsd.toFixed(2)).toBe('5.00');
    });

    it('sin cuota configurada: 422 FEE_NOT_CONFIGURED', async () => {
      const res = await ctx.http().get('/billing/current').set(bearer(joseToken)).expect(422);
      expect(res.body.code).toBe('FEE_NOT_CONFIGURED');
    });

    it('marca la tasa como desactualizada si tiene más de un día', async () => {
      await setupBilling(ctx, adminToken, { ves: null, cop: null });
      await ctx
        .http()
        .post('/billing/rates')
        .set(bearer(adminToken))
        .send({ currency: 'VES', ratePerUsd: '190.00', effectiveDate: addDays(today(), -2) })
        .expect(201);
      const res = await ctx.http().get('/billing/current').set(bearer(adminToken)).expect(200);
      expect(res.body.rates.VES.stale).toBe(true);
      expect(res.body.rates.COP).toBeNull();
      expect(res.body.fee.COP).toBeNull();
    });
  });
});
