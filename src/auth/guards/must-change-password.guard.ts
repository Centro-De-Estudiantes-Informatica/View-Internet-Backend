import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { forbidden } from '../../common/errors/business-error';
import type { AuthenticatedRequest } from '../auth-user';
import { ALLOW_PENDING_PASSWORD_CHANGE } from '../decorators/allow-pending-password-change.decorator';
import { IS_PUBLIC } from '../decorators/public.decorator';

/** Bloquea todo excepto el cambio de contraseña mientras la cuenta tenga `mustChangePassword`. */
@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets) ||
      this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE, targets)
    ) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (user?.mustChangePassword) {
      throw forbidden('PASSWORD_CHANGE_REQUIRED', 'Debes cambiar tu contraseña antes de continuar');
    }
    return true;
  }
}
