import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';

/** Configuración compartida entre `main.ts`, las pruebas e2e y la exportación del OpenAPI. */
export function setupApp(app: INestApplication): OpenAPIObject {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const config = new DocumentBuilder()
    .setTitle('View Internet API')
    .setDescription(
      'Control de pagos del internet de la sede de Informática. Los montos se serializan como strings decimales. Los errores responden `{ code, message }`.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    // En Vercel la API es una función y no incluye los archivos de swagger-ui-dist: se sirven del CDN.
    ...(process.env.VERCEL ? swaggerFromCdn() : {}),
  });
  return document;
}

const SWAGGER_UI_CDN = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.13';

function swaggerFromCdn() {
  return {
    customCssUrl: `${SWAGGER_UI_CDN}/swagger-ui.css`,
    customJs: [
      `${SWAGGER_UI_CDN}/swagger-ui-bundle.js`,
      `${SWAGGER_UI_CDN}/swagger-ui-standalone-preset.js`,
    ],
  };
}
