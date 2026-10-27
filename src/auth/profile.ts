import type { User } from '@prisma/client';
import { formatCedula } from '../common/domain/cedula';
import type { ProfileDto } from './dto/session.dto';

export function toProfile(user: User): ProfileDto {
  return {
    id: user.id,
    cedula: formatCedula(user.cedulaPrefix, user.cedulaDigits),
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}
