import { Injectable } from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthStateService } from '../auth/auth-state.service';
import { toProfile } from '../auth/profile';
import { PasswordService } from '../auth/password.service';
import { userPeriodStatusSql } from '../billing/period-status.sql';
import { PeriodsService } from '../billing/periods.service';
import { SettingsService } from '../billing/settings.service';
import { normalizeCedula, searchDigits } from '../common/domain/cedula';
import { Decimal, money } from '../common/domain/money';
import type { PeriodStatus } from '../common/domain/period-status';
import { searchableText } from '../common/domain/text';
import { conflict, notFound, unprocessable } from '../common/errors/business-error';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreatedUserDto,
  CreateUserDto,
  ListUsersQuery,
  UpdateUserDto,
  UserListItemDto,
  UserPageDto,
} from './dto/users.dto';

interface UserRow {
  id: string;
  paid_usd: Prisma.Decimal | null;
  period_status: PeriodStatus | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly authState: AuthStateService,
    private readonly audit: AuditService,
    private readonly periods: PeriodsService,
    private readonly settings: SettingsService,
  ) {}

  async create(dto: CreateUserDto, actorId: string): Promise<CreatedUserDto> {
    const cedula = normalizeCedula(dto.cedula);
    if (!cedula) throw unprocessable('INVALID_CEDULA', 'La cédula no es válida');

    const temporaryPassword = this.passwords.temporary();
    const passwordHash = await this.passwords.hash(temporaryPassword);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            cedulaPrefix: cedula.prefix,
            cedulaDigits: cedula.digits,
            fullName: dto.fullName,
            fullNameSearch: searchableText(dto.fullName),
            phone: dto.phone ?? null,
            role: dto.role ?? Role.ESTUDIANTE,
            passwordHash,
            mustChangePassword: true,
          },
        });
        await this.audit.log(tx, {
          actorId,
          action: 'USER_CREATED',
          entity: 'User',
          entityId: created.id,
          after: auditView(created),
        });
        return created;
      });
      return { user: toProfile(user), temporaryPassword };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw conflict('CEDULA_TAKEN', 'La cédula ya está registrada');
      }
      throw err;
    }
  }

  async get(id: string) {
    return toProfile(await this.findOrThrow(id));
  }

  async list(query: ListUsersQuery): Promise<UserPageDto> {
    const periodId = query.periodo ?? this.periods.current();
    const fee = await this.periods.feeFor(periodId);
    if (!fee && query.estado) {
      throw unprocessable('FEE_NOT_CONFIGURED', 'Aún no se ha configurado la cuota mensual');
    }
    const tolerance = await this.settings.toleranceUsd();

    const filters: Prisma.Sql[] = [];
    if (query.q?.trim()) {
      const digits = searchDigits(query.q);
      filters.push(
        digits
          ? Prisma.sql`u.cedula_digits LIKE ${`%${digits}%`}`
          : Prisma.sql`u.full_name_search LIKE ${`%${escapeLike(searchableText(query.q))}%`}`,
      );
    }
    if (query.role) filters.push(Prisma.sql`u.role = ${query.role}::"Role"`);
    if (query.active !== undefined) filters.push(Prisma.sql`u.active = ${query.active}`);
    if (query.estado) filters.push(Prisma.sql`s.period_status = ${query.estado}`);
    const where = filters.length
      ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`
      : Prisma.empty;

    // Sin cuota configurada no hay estado: se calcula contra 0 y luego se descarta.
    const statusSql = userPeriodStatusSql(periodId, fee ?? new Decimal(0), tolerance);
    const from = Prisma.sql`FROM users u JOIN (${statusSql}) s ON s.user_id = u.id ${where}`;

    const [{ total }] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total ${from}`;
    const rows = await this.prisma.$queryRaw<UserRow[]>`
      SELECT u.id, s.paid_usd, s.period_status ${from}
      ORDER BY u.full_name_search, u.id
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;

    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.id) } } });
    const byId = new Map(users.map((u) => [u.id, u]));
    const items: UserListItemDto[] = rows.map((row) => ({
      ...toProfile(byId.get(row.id)!),
      period: fee
        ? {
            periodo: periodId,
            status: row.period_status!,
            paidUsd: money(new Decimal(row.paid_usd ?? 0)),
            feeUsd: money(fee),
          }
        : null,
    }));
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async changeRole(id: string, role: Role, actorId: string) {
    if (id === actorId) {
      throw conflict('CANNOT_CHANGE_OWN_ROLE', 'No puedes cambiar tu propio rol');
    }
    const user = await this.prisma.$transaction(async (tx) => {
      const activeAdmins = await lockActiveAdmins(tx);
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw notFound('USER_NOT_FOUND', 'La persona no existe');
      if (target.role === role) return target;
      if (target.role === Role.ADMIN && target.active && activeAdmins <= 1) {
        throw lastAdmin();
      }
      const updated = await tx.user.update({ where: { id }, data: { role } });
      await this.audit.log(tx, {
        actorId,
        action: 'ROLE_CHANGED',
        entity: 'User',
        entityId: id,
        before: { role: target.role },
        after: { role },
      });
      return updated;
    });
    this.authState.invalidate(id);
    return toProfile(user);
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    if (dto.active === false && id === actorId) {
      throw conflict('CANNOT_DEACTIVATE_SELF', 'No puedes desactivar tu propia cuenta');
    }
    const user = await this.prisma.$transaction(async (tx) => {
      const activeAdmins = dto.active === false ? await lockActiveAdmins(tx) : null;
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw notFound('USER_NOT_FOUND', 'La persona no existe');

      const data: Prisma.UserUpdateInput = {};
      if (dto.fullName !== undefined && dto.fullName !== target.fullName) {
        data.fullName = dto.fullName;
        data.fullNameSearch = searchableText(dto.fullName);
      }
      if (dto.phone !== undefined && dto.phone !== target.phone) data.phone = dto.phone;
      const statusChanged = dto.active !== undefined && dto.active !== target.active;
      if (statusChanged) {
        if (
          dto.active === false &&
          target.role === Role.ADMIN &&
          activeAdmins !== null &&
          activeAdmins <= 1
        ) {
          throw lastAdmin();
        }
        data.active = dto.active;
      }
      if (Object.keys(data).length === 0) return target;

      const updated = await tx.user.update({ where: { id }, data });
      if (data.fullName !== undefined || data.phone !== undefined) {
        await this.audit.log(tx, {
          actorId,
          action: 'USER_UPDATED',
          entity: 'User',
          entityId: id,
          before: { fullName: target.fullName, phone: target.phone },
          after: { fullName: updated.fullName, phone: updated.phone },
        });
      }
      if (statusChanged) {
        await this.audit.log(tx, {
          actorId,
          action: updated.active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
          entity: 'User',
          entityId: id,
          before: { active: target.active },
          after: { active: updated.active },
        });
      }
      return updated;
    });
    this.authState.invalidate(id);
    return toProfile(user);
  }

  /** Nueva contraseña temporal; invalida los tokens anteriores de esa persona. */
  async resetPassword(id: string, actorId: string): Promise<{ temporaryPassword: string }> {
    await this.findOrThrow(id);
    const temporaryPassword = this.passwords.temporary();
    const passwordHash = await this.passwords.hash(temporaryPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, tokenVersion: { increment: 1 } },
      });
      await this.audit.log(tx, {
        actorId,
        action: 'PASSWORD_RESET',
        entity: 'User',
        entityId: id,
      });
    });
    this.authState.invalidate(id);
    return { temporaryPassword };
  }

  private async findOrThrow(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('USER_NOT_FOUND', 'La persona no existe');
    return user;
  }
}

/**
 * Bloquea las filas de administradores activos hasta el fin de la transacción y devuelve
 * cuántos hay. Así dos cambios simultáneos no pueden dejar el sistema sin administradores.
 */
async function lockActiveAdmins(tx: Prisma.TransactionClient): Promise<number> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM users WHERE role = 'ADMIN'::"Role" AND active FOR UPDATE`;
  return rows.length;
}

function lastAdmin() {
  return conflict('LAST_ADMIN', 'Debe quedar al menos un administrador activo');
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function auditView(user: User): Prisma.InputJsonObject {
  return {
    cedula: `${user.cedulaPrefix}${user.cedulaDigits}`,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    active: user.active,
  };
}
