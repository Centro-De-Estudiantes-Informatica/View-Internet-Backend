import { Role } from '@prisma/client';
import {
  bearer,
  createApp,
  login,
  resetDb,
  seedAndLogin,
  seedUser,
  setupBilling,
  TestContext,
} from './helpers';

describe('auth (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createApp();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('Inicio de sesión por cédula', () => {
    it('credenciales válidas: 200 con token, rol y mustChangePassword', async () => {
      await seedUser(ctx.prisma, { cedula: 'V-28.123.456', password: 'clave-segura' });
      const res = await ctx
        .http()
        .post('/auth/login')
        .send({ cedula: 'V-28.123.456', password: 'clave-segura' })
        .expect(200);
      expect(res.body).toMatchObject({
        tokenType: 'Bearer',
        role: 'ESTUDIANTE',
        mustChangePassword: false,
        user: { cedula: 'V-28.123.456' },
      });
      expect(typeof res.body.accessToken).toBe('string');
    });

    it('la cédula en otro formato identifica la misma cuenta', async () => {
      const { user } = await seedUser(ctx.prisma, {
        cedula: 'V-28.123.456',
        password: 'clave-segura',
      });
      for (const cedula of ['28123456', '28.123.456', 'v28123456', 'V 28 123 456']) {
        const res = await ctx
          .http()
          .post('/auth/login')
          .send({ cedula, password: 'clave-segura' })
          .expect(200);
        expect(res.body.user.id).toBe(user.id);
      }
    });

    it('credenciales inválidas: 401 genérico sin revelar qué dato falló', async () => {
      await seedUser(ctx.prisma, { cedula: 'V-28.123.456', password: 'clave-segura' });
      const wrongPassword = await ctx
        .http()
        .post('/auth/login')
        .send({ cedula: '28123456', password: 'otra' })
        .expect(401);
      const unknownCedula = await ctx
        .http()
        .post('/auth/login')
        .send({ cedula: '99999999', password: 'clave-segura' })
        .expect(401);
      const garbage = await ctx
        .http()
        .post('/auth/login')
        .send({ cedula: 'no-es-cedula', password: 'x' })
        .expect(401);
      expect(wrongPassword.body).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Cédula o contraseña incorrecta',
      });
      expect(unknownCedula.body).toEqual(wrongPassword.body);
      expect(garbage.body).toEqual(wrongPassword.body);
    });

    it('cuenta desactivada: 403 y sin token', async () => {
      await seedUser(ctx.prisma, {
        cedula: 'V-28.123.456',
        password: 'clave-segura',
        active: false,
      });
      const res = await ctx
        .http()
        .post('/auth/login')
        .send({ cedula: '28123456', password: 'clave-segura' })
        .expect(403);
      expect(res.body.code).toBe('ACCOUNT_DISABLED');
      expect(res.body.accessToken).toBeUndefined();
    });

    it('datos faltantes: 422', async () => {
      await ctx.http().post('/auth/login').send({ cedula: '28123456' }).expect(422);
    });
  });

  describe('Cambio de contraseña obligatorio', () => {
    it('primer ingreso: cualquier ruta distinta del cambio responde PASSWORD_CHANGE_REQUIRED', async () => {
      const { token } = await seedAndLogin(ctx, { cedula: '28123456', mustChangePassword: true });
      for (const path of ['/me/status', '/me', '/billing/current']) {
        const res = await ctx.http().get(path).set(bearer(token)).expect(403);
        expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      }
    });

    it('cambio exitoso: guarda el hash, quita la marca, emite token nuevo e invalida el viejo', async () => {
      const { token: adminToken } = await seedAndLogin(ctx, {
        cedula: '10000001',
        role: Role.ADMIN,
      });
      await setupBilling(ctx, adminToken);
      const { token, password } = await seedUser(ctx.prisma, {
        cedula: '28123456',
        password: 'temporal1',
        mustChangePassword: true,
      }).then(async (s) => ({ ...s, token: await login(ctx, '28123456', s.password) }));

      const res = await ctx
        .http()
        .post('/auth/change-password')
        .set(bearer(token))
        .send({ currentPassword: password, newPassword: 'nueva-clave-123' })
        .expect(200);
      expect(res.body.mustChangePassword).toBe(false);
      const newToken = res.body.accessToken as string;

      await ctx.http().get('/me/status').set(bearer(newToken)).expect(200);
      await ctx.http().get('/me').set(bearer(token)).expect(401);
      await ctx
        .http()
        .post('/auth/login')
        .send({ cedula: '28123456', password: 'nueva-clave-123' })
        .expect(200);
      await ctx.http().post('/auth/login').send({ cedula: '28123456', password }).expect(401);
    });

    it('rechaza contraseñas nuevas de menos de 8 caracteres o una actual incorrecta', async () => {
      const { token, password } = await seedUser(ctx.prisma, {
        cedula: '28123456',
        mustChangePassword: true,
      }).then(async (s) => ({ ...s, token: await login(ctx, '28123456', s.password) }));
      await ctx
        .http()
        .post('/auth/change-password')
        .set(bearer(token))
        .send({ currentPassword: password, newPassword: 'corta' })
        .expect(422);
      const wrong = await ctx
        .http()
        .post('/auth/change-password')
        .set(bearer(token))
        .send({ currentPassword: 'no-es', newPassword: 'nueva-clave-123' })
        .expect(422);
      expect(wrong.body.code).toBe('INVALID_CURRENT_PASSWORD');
    });
  });

  describe('Autorización por rol', () => {
    it('sin token: 401; con token mal formado: 401', async () => {
      await ctx.http().get('/me').expect(401);
      await ctx.http().get('/me').set(bearer('basura')).expect(401);
    });

    it('/health y /auth/login son públicos', async () => {
      await ctx.http().get('/health').expect(200);
    });

    it('un estudiante no accede a rutas de administrador', async () => {
      const { token } = await seedAndLogin(ctx, { cedula: '28123456' });
      for (const path of ['/users', '/payments', '/metrics/summary', '/billing/rates']) {
        await ctx.http().get(path).set(bearer(token)).expect(403);
      }
    });

    it('rol cambiado después de emitir el token: se usa el rol vigente', async () => {
      const { token: adminA } = await seedAndLogin(ctx, { cedula: '10000001', role: Role.ADMIN });
      const { user: b, token: adminB } = await seedAndLogin(ctx, {
        cedula: '10000002',
        role: Role.ADMIN,
      });
      await ctx.http().get('/users').set(bearer(adminB)).expect(200);

      await ctx
        .http()
        .patch(`/users/${b.id}/role`)
        .set(bearer(adminA))
        .send({ role: 'ESTUDIANTE' })
        .expect(200);

      await ctx.http().get('/users').set(bearer(adminB)).expect(403);
    });
  });

  describe('Protección contra fuerza bruta', () => {
    it('tras 5 intentos fallidos para la misma cédula responde 429, aun con la clave correcta', async () => {
      await seedUser(ctx.prisma, { cedula: 'V-28.123.456', password: 'clave-segura' });
      await seedUser(ctx.prisma, { cedula: 'V-28.123.457', password: 'clave-segura' });
      for (let i = 0; i < 5; i++) {
        await ctx
          .http()
          .post('/auth/login')
          .send({ cedula: i % 2 ? 'V-28.123.456' : '28123456', password: 'mala' })
          .expect(401);
      }
      const locked = await ctx
        .http()
        .post('/auth/login')
        .send({ cedula: '28123456', password: 'clave-segura' })
        .expect(429);
      expect(locked.body.code).toBe('TOO_MANY_ATTEMPTS');

      // Otra cédula no se ve afectada.
      await ctx
        .http()
        .post('/auth/login')
        .send({ cedula: '28123457', password: 'clave-segura' })
        .expect(200);
    });
  });
});
