import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_ERROR',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

/** Normaliza todos los errores al formato `{ code, message }`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const [status, body] = this.toBody(exception);
    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    res.status(status).json(body);
  }

  private toBody(exception: unknown): [number, ErrorBody] {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const fallbackCode = DEFAULT_CODES[status] ?? 'ERROR';
      if (typeof response === 'string') {
        return [status, { code: fallbackCode, message: response }];
      }
      const r = response as { code?: unknown; message?: unknown };
      const code = typeof r.code === 'string' ? r.code : fallbackCode;
      // ValidationPipe entrega un arreglo de mensajes.
      if (Array.isArray(r.message)) {
        return [status, { code, message: 'Datos inválidos', details: r.message }];
      }
      const message = typeof r.message === 'string' ? r.message : exception.message;
      return [status, { code, message }];
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return [HttpStatus.CONFLICT, { code: 'CONFLICT', message: 'El registro ya existe' }];
      }
      if (exception.code === 'P2025') {
        return [HttpStatus.NOT_FOUND, { code: 'NOT_FOUND', message: 'Registro no encontrado' }];
      }
    }
    return [
      HttpStatus.INTERNAL_SERVER_ERROR,
      { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' },
    ];
  }
}
