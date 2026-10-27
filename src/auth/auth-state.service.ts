import { Injectable } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { AppConfig } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthState {
  role: Role;
  active: boolean;
  tokenVersion: number;
  mustChangePassword: boolean;
}

/**
 * Estado de autenticación vigente de cada usuario, con caché corta en memoria.
 * Los cambios de rol, estado o contraseña llaman a `invalidate` para que apliquen de inmediato
 * en esta instancia; otras instancias los ven al vencer la caché.
 */
@Injectable()
export class AuthStateService {
  private readonly cache = new Map<string, { state: AuthState | null; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async get(userId: string): Promise<AuthState | null> {
    const now = Date.now();
    const hit = this.cache.get(userId);
    if (hit && hit.expiresAt > now) return hit.state;

    const state = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, active: true, tokenVersion: true, mustChangePassword: true },
    });
    const ttl = this.config.get('AUTH_CACHE_TTL_MS');
    if (ttl > 0) this.cache.set(userId, { state, expiresAt: now + ttl });
    return state;
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }
}
