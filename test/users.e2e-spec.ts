import { Role } from '@prisma/client';
import { UsersService } from '../src/users/users.service';
import {
  bearer,
  createApp,
  login,
  resetDb,
  seedAndLogin,
  seedUser,
  setupBilling,
  TestContext,
  thisPeriod,
} from './helpers';

describe('user-management (e2e)', () => {
  let ctx: TestContext;
  let admin: { id: string };
  let adminToken: string;

  beforeAll(async () => {
    ctx = await createApp();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    const seeded = await seedAndLogin(ctx, {
      cedula: 'V-10.000.001',
      fullName: 'Admin Principal',
      role: Role.ADMIN,
    });
    admin = seeded.user;
    adminToken = seeded.token;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const createUser = (body: object) => ctx.http().post('/users').set(bearer(adminToken)).send(body);

  describe('Alta de personas', () => {
    it('guarda la cédula normalizada, devuelve la contraseña temporal y exige cambiarla', async () => {
      const res = await createUser({ cedula: 'V-30.555.111', fullName: 'José Rodríguez' }).expect(
        201,
      );
      expect(res.body.user).toMatchObject({
        cedula: 'V-30.555.111',
        fullName: 'José Rodríguez',
        role: 'ESTUDIANTE',
        mustChangePassword: true,
      });
      expect(res.body.temporaryPassword).toMatch(/^[A-Za-z0-9]{10}$/);

      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id } });
      expect(`${row.cedulaPrefix}${row.cedulaDigits}`).toBe('V30555111');
      expect(row.passwordHash).not.toContain(res.body.temporaryPassword);

      const session = await ctx
        .http()
        .post('/auth/login')
        .send({ cedula: '30555111', password: res.body.temporaryPassword })
        .expect(200);
      expect(session.body.mustChangePassword).toBe(true);

      const audit = await ctx.prisma.auditLog.findFirst({ where: { entityId: row.id } });
      expect(audit).toMatchObject({ action: 'USER_CREATED', actorId: admin.id });
    });

    it('cédula duplicada en otro formato: 409', async () => {
      await createUser({ cedula: 'V-30.555.111', fullName: 'José Rodríguez' }).expect(201);
      const res = await createUser({ cedula: '30555111', fullName: 'Otro' }).expect(409);
      expect(res.body.code).toBe('CEDULA_TAKEN');
    });

    it('cédula inválida: 422', async () => {
      const res = await createUser({ cedula: 'J-123', fullName: 'Empresa' }).expect(422);
      expect(res.body.code).toBe('INVALID_CEDULA');
    });
  });

  describe('Listado y búsqueda', () => {
    beforeEach(async () => {
      await seedUser(ctx.prisma, { cedula: 'V-28.123.456', fullName: 'Ana Gómez' });
      await seedUser(ctx.prisma, { cedula: 'V-30.555.111', fullName: 'José Rodríguez' });
      await seedUser(ctx.prisma, { cedula: 'E-84.000.002', fullName: 'María Pérez' });
    });

    const search = (query: Record<string, string | number>) =>
      ctx.http().get('/users').query(query).set(bearer(adminToken)).expect(200);

    it('busca por cédula con formato', async () => {
      const res = await search({ q: '28.123' });
      expect(res.body.items.map((u: { cedula: string }) => u.cedula)).toEqual(['V-28.123.456']);
    });

    it('busca por nombre sin acento ni mayúsculas', async () => {
      for (const q of ['jose', 'JOSÉ', 'rodri']) {
        const res = await search({ q });
        expect(res.body.items.map((u: { fullName: string }) => u.fullName)).toEqual([
          'José Rodríguez',
        ]);
      }
    });

    it('filtra por rol y pagina', async () => {
      const page1 = await search({ role: 'ESTUDIANTE', pageSize: 2, page: 1 });
      const page2 = await search({ role: 'ESTUDIANTE', pageSize: 2, page: 2 });
      expect(page1.body.total).toBe(3);
      expect(page1.body.items).toHaveLength(2);
      expect(page2.body.items).toHaveLength(1);
      expect(page1.body.items[0].fullName).toBe('Ana Gómez');
    });

    it('filtra pendientes del mes por estado calculado', async () => {
      await setupBilling(ctx, adminToken);
      const ana = await ctx.prisma.user.findFirstOrThrow({ where: { fullName: 'Ana Gómez' } });
      await ctx
        .http()
        .post('/payments/cash')
        .set(bearer(adminToken))
        .send({ userId: ana.id, periodo: thisPeriod(), currency: 'USD', amount: '5.00' })
        .expect(201);

      const pending = await search({
        role: 'ESTUDIANTE',
        estado: 'PENDIENTE',
        periodo: thisPeriod(),
      });
      expect(pending.body.items.map((u: { fullName: string }) => u.fullName)).toEqual([
        'José Rodríguez',
        'María Pérez',
      ]);
      expect(pending.body.items[0].period).toMatchObject({ status: 'PENDIENTE', paidUsd: '0.00' });

      const upToDate = await search({ estado: 'AL_DIA' });
      expect(upToDate.body.items).toHaveLength(1);
      expect(upToDate.body.items[0].period).toMatchObject({
        periodo: thisPeriod(),
        status: 'AL_DIA',
        paidUsd: '5.00',
        feeUsd: '5.00',
      });
    });
  });

  describe('Cambio de rol', () => {
    it('promueve a administrador y lo audita', async () => {
      const { user: ana } = await seedUser(ctx.prisma, {
        cedula: '28123456',
        fullName: 'Ana Gómez',
      });
      const res = await ctx
        .http()
        .patch(`/users/${ana.id}/role`)
        .set(bearer(adminToken))
        .send({ role: 'ADMIN' })
        .expect(200);
      expect(res.body.role).toBe('ADMIN');
      const audit = await ctx.prisma.auditLog.findFirstOrThrow({
        where: { entityId: ana.id, action: 'ROLE_CHANGED' },
      });
      expect(audit).toMatchObject({
        actorId: admin.id,
        before: { role: 'ESTUDIANTE' },
        after: { role: 'ADMIN' },
      });
    });

    it('no permite cambiar el propio rol', async () => {
      const res = await ctx
        .http()
        .patch(`/users/${admin.id}/role`)
        .set(bearer(adminToken))
        .send({ role: 'ESTUDIANTE' })
        .expect(409);
      expect(res.body.code).toBe('CANNOT_CHANGE_OWN_ROLE');
    });

    it('LAST_ADMIN: no se le quita el rol al único administrador activo', async () => {
      // Solo el propio administrador podría intentarlo por HTTP (y eso es CANNOT_CHANGE_OWN_ROLE),
      // así que la regla se verifica en el servicio con otro actor.
      const users = ctx.app.get(UsersService);
      await expect(users.changeRole(admin.id, Role.ESTUDIANTE, 'otro-actor')).rejects.toMatchObject(
        {
          code: 'LAST_ADMIN',
        },
      );
      await expect(users.update(admin.id, { active: false }, 'otro-actor')).rejects.toMatchObject({
        code: 'LAST_ADMIN',
      });
    });

    it('LAST_ADMIN: dos administradores que se degradan a la vez dejan al menos uno', async () => {
      const { user: b, token: tokenB } = await seedAndLogin(ctx, {
        cedula: '10000002',
        role: Role.ADMIN,
      });
      const [r1, r2] = await Promise.all([
        ctx
          .http()
          .patch(`/users/${b.id}/role`)
          .set(bearer(adminToken))
          .send({ role: 'ESTUDIANTE' }),
        ctx
          .http()
          .patch(`/users/${admin.id}/role`)
          .set(bearer(tokenB))
          .send({ role: 'ESTUDIANTE' }),
      ]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses[0]).toBe(200);
      expect([403, 409]).toContain(statuses[1]);
      expect(await ctx.prisma.user.count({ where: { role: 'ADMIN', active: true } })).toBe(1);
    });

    it('con otro administrador activo sí se puede degradar a uno', async () => {
      const { user: b } = await seedUser(ctx.prisma, { cedula: '10000002', role: Role.ADMIN });
      await ctx
        .http()
        .patch(`/users/${b.id}/role`)
        .set(bearer(adminToken))
        .send({ role: 'ESTUDIANTE' })
        .expect(200);
    });
  });

  describe('Restablecer contraseña y desactivar', () => {
    it('restablecer devuelve una temporal nueva y anula los tokens anteriores', async () => {
      const { user, token } = await seedAndLogin(ctx, { cedula: '28123456' });
      await ctx.http().get('/me').set(bearer(token)).expect(200);

      const res = await ctx
        .http()
        .post(`/users/${user.id}/reset-password`)
        .set(bearer(adminToken))
        .expect(200);
      expect(res.body.temporaryPassword).toMatch(/^[A-Za-z0-9]{10}$/);

      await ctx.http().get('/me').set(bearer(token)).expect(401);
      const fresh = await login(ctx, '28123456', res.body.temporaryPassword);
      const blocked = await ctx.http().get('/me').set(bearer(fresh)).expect(403);
      expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      expect(
        await ctx.prisma.auditLog.count({ where: { entityId: user.id, action: 'PASSWORD_RESET' } }),
      ).toBe(1);
    });

    it('desactivar impide iniciar sesión, corta la sesión y conserva el historial', async () => {
      await setupBilling(ctx, adminToken);
      const { user, token, password } = await seedUser(ctx.prisma, { cedula: '28123456' }).then(
        async (s) => ({ ...s, token: await login(ctx, '28123456', s.password) }),
      );
      await ctx
        .http()
        .post('/payments/cash')
        .set(bearer(adminToken))
        .send({ userId: user.id, periodo: thisPeriod(), currency: 'USD', amount: '5.00' })
        .expect(201);

      const res = await ctx
        .http()
        .patch(`/users/${user.id}`)
        .set(bearer(adminToken))
        .send({ active: false })
        .expect(200);
      expect(res.body.active).toBe(false);

      await ctx.http().post('/auth/login').send({ cedula: '28123456', password }).expect(403);
      await ctx.http().get('/me').set(bearer(token)).expect(403);
      expect(await ctx.prisma.payment.count({ where: { userId: user.id } })).toBe(1);
      expect(
        await ctx.prisma.auditLog.count({
          where: { entityId: user.id, action: 'USER_DEACTIVATED' },
        }),
      ).toBe(1);
    });

    it('edita nombre y teléfono, y el nombre nuevo se puede buscar', async () => {
      const { user } = await seedUser(ctx.prisma, { cedula: '28123456', fullName: 'Ana Gomez' });
      await ctx
        .http()
        .patch(`/users/${user.id}`)
        .set(bearer(adminToken))
        .send({ fullName: 'Ana Gómez Núñez', phone: '0414-123.45.67' })
        .expect(200);
      const res = await ctx
        .http()
        .get('/users')
        .query({ q: 'nunez' })
        .set(bearer(adminToken))
        .expect(200);
      expect(res.body.items[0]).toMatchObject({
        fullName: 'Ana Gómez Núñez',
        phone: '04141234567',
      });
    });

    it('no permite desactivar la propia cuenta', async () => {
      const res = await ctx
        .http()
        .patch(`/users/${admin.id}`)
        .set(bearer(adminToken))
        .send({ active: false })
        .expect(409);
      expect(res.body.code).toBe('CANNOT_DEACTIVATE_SELF');
    });
  });
});
