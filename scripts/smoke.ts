/**
 * Prueba de humo contra una API desplegada:
 *   BASE_URL=https://… SMOKE_ADMIN_CEDULA=… SMOKE_ADMIN_PASSWORD=… npm run smoke
 *
 * Inicia sesión como administrador, crea un estudiante, le registra un pago en efectivo y
 * verifica que las métricas lo reflejen. Al final anula el pago y desactiva al estudiante
 * (nada se borra: queda en la auditoría). La cuota mensual ya debe estar configurada.
 */
const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const CEDULA = process.env.SMOKE_ADMIN_CEDULA;
const PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;

interface Summary {
  periodo: string;
  totalUsd: string;
  students: { AL_DIA: number };
}

async function call<T>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as T;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

function step(message: string): void {
  console.log(`✓ ${message}`);
}

async function main(): Promise<void> {
  if (!CEDULA || !PASSWORD) throw new Error('Faltan SMOKE_ADMIN_CEDULA y SMOKE_ADMIN_PASSWORD');

  await call('GET', '/health');
  step(`${BASE_URL}/health responde`);

  const session = await call<{ accessToken: string; mustChangePassword: boolean; role: string }>(
    'POST',
    '/auth/login',
    undefined,
    { cedula: CEDULA, password: PASSWORD },
  );
  if (session.role !== 'ADMIN') throw new Error('La cuenta de humo no es ADMIN');
  if (session.mustChangePassword) {
    throw new Error('El administrador debe cambiar su contraseña antes de la prueba de humo');
  }
  const token = session.accessToken;
  step('login del administrador');

  const billing = await call<{ periodo: string; feeUsd: string }>('GET', '/billing/current', token);
  const before = await call<Summary>('GET', '/metrics/summary', token);

  const cedula = `V-9${String(Date.now()).slice(-7)}`;
  const created = await call<{ user: { id: string } }>('POST', '/users', token, {
    cedula,
    fullName: 'Prueba De Humo',
  });
  const studentId = created.user.id;
  step(`estudiante ${cedula} creado`);

  const payment = await call<{ id: string; status: string }>('POST', '/payments/cash', token, {
    userId: studentId,
    periodo: billing.periodo,
    currency: 'USD',
    amount: billing.feeUsd,
    note: 'Prueba de humo',
  });
  if (payment.status !== 'APROBADO') throw new Error(`Pago en estado ${payment.status}`);
  step(`pago en efectivo de $${billing.feeUsd} registrado`);

  try {
    const after = await call<Summary>('GET', '/metrics/summary', token);
    const expectedTotal = (Number(before.totalUsd) + Number(billing.feeUsd)).toFixed(2);
    if (after.totalUsd !== expectedTotal) {
      throw new Error(`totalUsd ${after.totalUsd}, se esperaba ${expectedTotal}`);
    }
    if (after.students.AL_DIA !== before.students.AL_DIA + 1) {
      throw new Error('El estudiante no aparece AL_DIA en las métricas');
    }
    step(`métricas: recaudado $${before.totalUsd} → $${after.totalUsd}, al día +1`);
  } finally {
    await call('POST', `/payments/${payment.id}/void`, token, { reason: 'Prueba de humo' });
    await call('PATCH', `/users/${studentId}`, token, { active: false });
    step('limpieza: pago anulado y estudiante desactivado');
  }
}

main().catch((err: unknown) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
