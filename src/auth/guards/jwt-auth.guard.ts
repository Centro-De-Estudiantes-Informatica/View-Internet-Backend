import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { forbidden } from '../../common/errors/business-error';
import { AuthStateService } from '../auth-state.service';
import type { AuthenticatedRequest, JwtPayload } from '../auth-user';
import { IS_PUBLIC } from '../decorators/public.decorator';

/** Guard global: exige un JWT válido y lo contrasta con el estado vigente en la base de datos. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly authState: AuthStateService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) throw unauthorized('Falta el token de acceso');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, { algorithms: ['HS256'] });
    } catch {
      throw unauthorized('Token inválido o vencido');
    }

    const state = await this.authState.get(payload.sub);
    if (!state || state.tokenVersion !== payload.tv) {
      throw unauthorized('La sesión ya no es válida; inicia sesión de nuevo');
    }
    if (!state.active) throw forbidden('ACCOUNT_DISABLED', 'La cuenta está desactivada');

    // El rol se toma de la base de datos, no del token, para que un cambio de rol aplique ya.
    request.user = {
      id: payload.sub,
      role: state.role,
      mustChangePassword: state.mustChangePassword,
    };
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' && token ? token : undefined;
  }
}

function unauthorized(message: string): UnauthorizedException {
  return new UnauthorizedException({ code: 'UNAUTHORIZED', message });
}
