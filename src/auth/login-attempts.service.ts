import { HttpStatus, Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service';
import { BusinessError } from '../common/errors/business-error';

/**
 * Cuenta los intentos fallidos de inicio de sesión por cédula en una ventana deslizante.
 * Vive en memoria: con varias instancias el límite aplica por instancia.
 */
@Injectable()
export class LoginAttemptsService {
  private readonly failures = new Map<string, number[]>();

  constructor(private readonly config: AppConfig) {}

  assertNotLocked(key: string): void {
    const recent = this.recent(key);
    if (recent.length >= this.config.get('LOGIN_MAX_FAILED_ATTEMPTS')) {
      throw new BusinessError(
        'TOO_MANY_ATTEMPTS',
        'Demasiados intentos fallidos. Intenta de nuevo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(key: string): void {
    const recent = this.recent(key);
    recent.push(Date.now());
    this.failures.set(key, recent);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  private recent(key: string): number[] {
    const since = Date.now() - this.config.get('LOGIN_WINDOW_MS');
    const recent = (this.failures.get(key) ?? []).filter((t) => t > since);
    if (recent.length === 0) this.failures.delete(key);
    return recent;
  }
}
