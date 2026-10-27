import { HttpException, HttpStatus } from '@nestjs/common';

/** Error de negocio con un código estable que la web traduce. Responde `{ code, message }`. */
export class BusinessError extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus,
  ) {
    super({ code, message }, status);
  }
}

export const conflict = (code: string, message: string) =>
  new BusinessError(code, message, HttpStatus.CONFLICT);

export const unprocessable = (code: string, message: string) =>
  new BusinessError(code, message, HttpStatus.UNPROCESSABLE_ENTITY);

export const forbidden = (code: string, message: string) =>
  new BusinessError(code, message, HttpStatus.FORBIDDEN);

export const notFound = (code: string, message: string) =>
  new BusinessError(code, message, HttpStatus.NOT_FOUND);
