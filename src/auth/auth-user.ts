import type { Role } from '@prisma/client';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export interface JwtPayload {
  sub: string;
  role: Role;
  /** tokenVersion vigente al emitir el token. */
  tv: number;
}
