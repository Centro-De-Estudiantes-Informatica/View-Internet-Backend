import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import { parseCedula } from '../common/domain/cedula';
import { forbidden, unprocessable } from '../common/errors/business-error';
import { AppConfig } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthStateService } from './auth-state.service';
import type { JwtPayload } from './auth-user';
import type { SessionDto } from './dto/session.dto';
import { LoginAttemptsService } from './login-attempts.service';
import { PasswordService } from './password.service';
import { toProfile } from './profile';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly passwords: PasswordService,
    private readonly attempts: LoginAttemptsService,
    private readonly authState: AuthStateService,
  ) {}

  async login(rawCedula: string, password: string): Promise<SessionDto> {
    const cedula = parseCedula(rawCedula);
    const attemptKey = cedula ? cedula.digits : rawCedula.trim().toLowerCase();
    this.attempts.assertNotLocked(attemptKey);

    const user = cedula ? await this.findByCedula(cedula.prefix, cedula.digits) : null;
    const valid = user
      ? await this.passwords.verify(password, user.passwordHash)
      : await this.passwords.verifyDummy(password);
    if (!user || !valid) {
      this.attempts.recordFailure(attemptKey);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Cédula o contraseña incorrecta',
      });
    }
    this.attempts.reset(attemptKey);

    if (!user.active) throw forbidden('ACCOUNT_DISABLED', 'La cuenta está desactivada');
    return this.issueSession(user);
  }

  async changePassword(userId: string, current: string, next: string): Promise<SessionDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(current, user.passwordHash))) {
      throw unprocessable('INVALID_CURRENT_PASSWORD', 'La contraseña actual no es correcta');
    }
    if (current === next) {
      throw unprocessable('PASSWORD_REUSED', 'La nueva contraseña debe ser distinta de la actual');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await this.passwords.hash(next),
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
      },
    });
    this.authState.invalidate(userId);
    return this.issueSession(updated);
  }

  async profile(userId: string) {
    return toProfile(await this.prisma.user.findUniqueOrThrow({ where: { id: userId } }));
  }

  private async issueSession(user: User): Promise<SessionDto> {
    const payload: JwtPayload = { sub: user.id, role: user.role, tv: user.tokenVersion };
    const expiresIn = this.config.get('JWT_EXPIRES_IN_SECONDS');
    const accessToken = await this.jwt.signAsync(payload, { expiresIn, algorithm: 'HS256' });
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      user: toProfile(user),
    };
  }

  /** Sin prefijo se busca solo por dígitos; si hay más de una coincidencia (V y E) no se adivina. */
  private async findByCedula(prefix: 'V' | 'E' | null, digits: string): Promise<User | null> {
    if (prefix) {
      return this.prisma.user.findUnique({
        where: { cedulaPrefix_cedulaDigits: { cedulaPrefix: prefix, cedulaDigits: digits } },
      });
    }
    const matches = await this.prisma.user.findMany({ where: { cedulaDigits: digits }, take: 2 });
    return matches.length === 1 ? matches[0] : null;
  }
}
