import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Genera `openapi.json` sin conectarse a la base de datos, para que la web genere su cliente
 * tipado (`npm run openapi`). CI verifica que el archivo versionado esté al día.
 */
async function main(): Promise<void> {
  process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost:5432/openapi';
  process.env.JWT_SECRET ??= 'openapi-export-placeholder-secret-0000000';
  const { AppModule } = await import('../src/app.module');
  const { setupApp } = await import('../src/setup-app');

  const app = await NestFactory.create(AppModule, { logger: false, preview: true });
  const document = setupApp(app);
  const out = resolve(__dirname, '..', 'openapi.json');
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  console.log(`OpenAPI escrito en ${out}`);
}

void main();
