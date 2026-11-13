import { HttpStatus, Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service';
import { BusinessError } from '../common/errors/business-error';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Cuenta los intentos fallidos de inicio de sesión por cédula en una ventana deslizante.
 * Se guardan en Postgres para que el bloqueo valga en todas las instancias de la API
 * (en Vercel corren varias a la vez).
 */
@Injectable()
export class LoginAttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async assertNotLocked(key: string): Promise<void> {
    const recent = await this.prisma.loginFailure.count({
      where: { key, createdAt: { gt: this.windowStart() } },
    });
    if (recent >= this.config.get('LOGIN_MAX_FAILED_ATTEMPTS')) {
      throw new BusinessError(
        'TOO_MANY_ATTEMPTS',
        'Demasiados intentos fallidos. Intenta de nuevo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordFailure(key: string): Promise<void> {
    // De paso se borran los intentos que ya salieron de la ventana, para que la tabla no crezca.
    await this.prisma.$transaction([
      this.prisma.loginFailure.deleteMany({ where: { createdAt: { lte: this.windowStart() } } }),
      this.prisma.loginFailure.create({ data: { key } }),
    ]);
  }

  async reset(key: string): Promise<void> {
    await this.prisma.loginFailure.deleteMany({ where: { key } });
  }

  private windowStart(): Date {
    return new Date(Date.now() - this.config.get('LOGIN_WINDOW_MS'));
  }
}
