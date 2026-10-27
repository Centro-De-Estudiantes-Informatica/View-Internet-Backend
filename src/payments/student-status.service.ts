import { Injectable } from '@nestjs/common';
import { PaymentStatus, RateCurrency } from '@prisma/client';
import { PeriodsService } from '../billing/periods.service';
import { RatesService } from '../billing/rates.service';
import { SettingsService } from '../billing/settings.service';
import { Decimal, fromUsd, money, ZERO } from '../common/domain/money';
import { localDate, periodOf } from '../common/domain/period';
import { balanceUsd, periodStatus } from '../common/domain/period-status';
import { AppConfig } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import type { MyStatusDto, PeriodBalanceDto } from './dto/payments.dto';

@Injectable()
export class StudentStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly rates: RatesService,
    private readonly settings: SettingsService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Estado del periodo actual y periodos adeudados: los abiertos desde el mes de alta de la
   * persona (o en los que tenga pagos) hasta el actual, que no estén AL_DIA.
   */
  async forUser(userId: string): Promise<MyStatusDto> {
    const currentId = this.periods.current();
    await this.periods.ensure(currentId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const sinceId = periodOf(localDate(this.config.get('APP_TIMEZONE'), user.createdAt));
    const tolerance = await this.settings.toleranceUsd();

    const [grouped, paidPeriods] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['periodId', 'status'],
        where: { userId, status: { in: [PaymentStatus.APROBADO, PaymentStatus.EN_REVISION] } },
        _sum: { amountUsd: true },
        _count: { _all: true },
      }),
      this.prisma.payment.findMany({
        where: { userId },
        distinct: ['periodId'],
        select: { periodId: true },
      }),
    ]);
    const periods = await this.prisma.period.findMany({
      where: {
        id: { lte: currentId },
        OR: [{ id: { gte: sinceId } }, { id: { in: paidPeriods.map((p) => p.periodId) } }],
      },
      orderBy: { id: 'asc' },
    });

    const balances: PeriodBalanceDto[] = periods.map((period) => {
      const approved = grouped.find(
        (g) => g.periodId === period.id && g.status === PaymentStatus.APROBADO,
      );
      const inReview = grouped.find(
        (g) => g.periodId === period.id && g.status === PaymentStatus.EN_REVISION,
      );
      const input = {
        paidUsd: approved?._sum.amountUsd ?? ZERO,
        feeUsd: period.feeUsd,
        inReviewCount: inReview?._count._all ?? 0,
        toleranceUsd: tolerance,
      };
      return {
        periodo: period.id,
        status: periodStatus(input),
        feeUsd: money(period.feeUsd),
        paidUsd: money(input.paidUsd),
        balanceUsd: money(balanceUsd(input)),
        inReviewCount: input.inReviewCount,
      };
    });

    const current = balances.find((b) => b.periodo === currentId)!;
    const owedPeriods = balances.filter((b) => b.status !== 'AL_DIA');
    const pendingUsd = owedPeriods.reduce((sum, b) => sum.plus(b.balanceUsd), new Decimal(0));

    const today = this.periods.today();
    const [ves, cop] = await Promise.all([
      this.rates.latest(RateCurrency.VES, today),
      this.rates.latest(RateCurrency.COP, today),
    ]);
    return {
      current,
      owedPeriods,
      pending: {
        USD: money(pendingUsd),
        VES: ves && money(fromUsd(pendingUsd, ves.ratePerUsd)),
        COP: cop && money(fromUsd(pendingUsd, cop.ratePerUsd)),
      },
    };
  }
}
