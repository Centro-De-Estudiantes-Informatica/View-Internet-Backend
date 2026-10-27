import { Injectable } from '@nestjs/common';
import { Currency, PaymentStatus, Prisma, Role } from '@prisma/client';
import { userPeriodStatusSql } from '../billing/period-status.sql';
import { PeriodsService } from '../billing/periods.service';
import { SettingsService } from '../billing/settings.service';
import { formatCedula } from '../common/domain/cedula';
import { Decimal, money, ZERO } from '../common/domain/money';
import { lastPeriods, periodEndUtc, toDateString } from '../common/domain/period';
import { PERIOD_STATUSES, type PeriodStatus } from '../common/domain/period-status';
import { unprocessable } from '../common/errors/business-error';
import { PrismaService } from '../prisma/prisma.service';
import type { CollectedDto, MonthlyPointDto, RecentPaymentDto, SummaryDto } from './metrics.dto';

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly settings: SettingsService,
  ) {}

  /** Solo cuentan los pagos APROBADO. */
  async summary(periodo?: string): Promise<SummaryDto> {
    const currentId = this.periods.current();
    const periodId = periodo ?? currentId;
    if (periodId === currentId) await this.periods.ensure(periodId);
    const fee = await this.periods.feeFor(periodId);
    if (!fee)
      throw unprocessable('FEE_NOT_CONFIGURED', 'Aún no se ha configurado la cuota mensual');
    const tolerance = await this.settings.toleranceUsd();

    // Estudiantes activos dados de alta antes de que terminara el periodo.
    const studentFilter = Prisma.sql`
      u.role = ${Role.ESTUDIANTE}::"Role" AND u.active AND u.created_at < ${periodEndUtc(periodId)}`;

    const [byCurrency, statusRows, inReviewPeriod, inReviewTotal] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['currency'],
        where: { periodId, status: PaymentStatus.APROBADO },
        _sum: { amount: true, amountUsd: true },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ period_status: PeriodStatus; n: number }[]>`
        SELECT s.period_status, COUNT(*)::int AS n
        FROM users u JOIN (${userPeriodStatusSql(periodId, fee, tolerance)}) s ON s.user_id = u.id
        WHERE ${studentFilter}
        GROUP BY s.period_status`,
      this.prisma.payment.count({ where: { periodId, status: PaymentStatus.EN_REVISION } }),
      this.prisma.payment.count({ where: { status: PaymentStatus.EN_REVISION } }),
    ]);

    const collectedFor = (currency: Currency): CollectedDto => {
      const row = byCurrency.find((r) => r.currency === currency);
      return {
        amount: money(row?._sum.amount ?? ZERO),
        amountUsd: money(row?._sum.amountUsd ?? ZERO),
        count: row?._count._all ?? 0,
      };
    };
    const totalUsd = byCurrency.reduce(
      (sum, r) => sum.plus(r._sum.amountUsd ?? ZERO),
      new Decimal(0),
    );

    const students = { total: 0, AL_DIA: 0, PARCIAL: 0, EN_REVISION: 0, PENDIENTE: 0 };
    for (const status of PERIOD_STATUSES) {
      students[status] = statusRows.find((r) => r.period_status === status)?.n ?? 0;
      students.total += students[status];
    }
    const expectedUsd = fee.mul(students.total);
    const percent = expectedUsd.gt(0)
      ? totalUsd.div(expectedUsd).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      : ZERO;

    return {
      periodo: periodId,
      feeUsd: money(fee),
      collected: {
        USD: collectedFor(Currency.USD),
        VES: collectedFor(Currency.VES),
        COP: collectedFor(Currency.COP),
      },
      totalUsd: money(totalUsd),
      expectedUsd: money(expectedUsd),
      percentCollected: money(percent),
      students,
      inReview: { period: inReviewPeriod, total: inReviewTotal },
    };
  }

  /** Recaudado en USD de los últimos `months` periodos, del más antiguo al más reciente. */
  async monthly(months: number): Promise<MonthlyPointDto[]> {
    const ids = lastPeriods(this.periods.current(), months);
    const rows = await this.prisma.payment.groupBy({
      by: ['periodId'],
      where: { periodId: { in: ids }, status: PaymentStatus.APROBADO },
      _sum: { amountUsd: true },
    });
    return ids.map((periodo) => ({
      periodo,
      totalUsd: money(rows.find((r) => r.periodId === periodo)?._sum.amountUsd ?? ZERO),
    }));
  }

  /** Últimos pagos aprobados, por el momento de aprobación. */
  async recent(limit: number): Promise<RecentPaymentDto[]> {
    const ids = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM payments
      WHERE status = 'APROBADO'
      ORDER BY COALESCE(reviewed_at, created_at) DESC, id DESC
      LIMIT ${limit}`;
    const rows = await this.prisma.payment.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      include: {
        user: { select: { id: true, cedulaPrefix: true, cedulaDigits: true, fullName: true } },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map(({ id }) => {
      const p = byId.get(id)!;
      return {
        id: p.id,
        user: {
          id: p.user.id,
          cedula: formatCedula(p.user.cedulaPrefix, p.user.cedulaDigits),
          fullName: p.user.fullName,
        },
        method: p.method,
        currency: p.currency,
        amount: money(p.amount),
        amountUsd: money(p.amountUsd),
        periodo: p.periodId,
        paidAt: toDateString(p.paidAt),
        approvedAt: p.reviewedAt ?? p.createdAt,
      };
    });
  }
}
