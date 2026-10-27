// Carga .env (si existe) y apunta la app a la base de datos de pruebas.
try {
  process.loadEnvFile('.env');
} catch {
  // En CI las variables vienen del entorno.
}

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('Falta TEST_DATABASE_URL para las pruebas e2e');
if (!/test/i.test(new URL(testUrl).pathname)) {
  throw new Error('TEST_DATABASE_URL debe apuntar a una base cuyo nombre contenga "test"');
}

process.env.DATABASE_URL = testUrl;
process.env.DIRECT_URL = testUrl;
process.env.NODE_ENV = 'test';
process.env.BCRYPT_COST = '4';
process.env.LOGIN_IP_LIMIT = '1000';
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
