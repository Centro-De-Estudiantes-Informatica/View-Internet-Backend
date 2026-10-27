import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config.service';
import { setupApp } from './setup-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(AppConfig);
  if (config.get('TRUST_PROXY') > 0) app.set('trust proxy', config.get('TRUST_PROXY'));
  app.enableShutdownHooks();
  setupApp(app);
  await app.listen(config.get('PORT'));
}

void bootstrap();
