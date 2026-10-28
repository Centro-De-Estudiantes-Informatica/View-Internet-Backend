import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiForbiddenResponse } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export const ROLES = 'roles';

/** Restringe la ruta a los roles indicados (se valida contra el rol vigente en la base de datos). */
export const Roles = (...roles: Role[]) =>
  applyDecorators(
    SetMetadata(ROLES, roles),
    ApiForbiddenResponse({ description: `Requiere rol ${roles.join(' o ')}` }),
  );
