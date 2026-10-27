import { Injectable } from '@nestjs/common';
import { RateCurrency } from '@prisma/client';
import { addDays } from '../common/domain/dates';
import { toDateString } from '../common/domain/period';
import { Decimal, fromUsd, money, rate } from '../common/domain/money';
import { unprocessable } from '../common/errors/business-error';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { BillingCurrentDto, CurrentRateDto, FeeDto } from './dto/billing.dto';
import { PeriodsService } from './periods.service';
import { RatesService } from './rates.service';
import { SettingsService } from './settings.service';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly periods: PeriodsService,
    private readonly rates: RatesService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Cambia la cuota. Antes se asegura de que el periodo actual esté abierto con la cuota
   * anterior, para que el cambio solo afecte a los periodos siguientes.
   */
  async setFee(feeUsd: Decimal, actorId: string): Promise<FeeDto> {
    const currentId = this.periods.current();
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.settings.feeUsd(tx);
      if (previous) await this.periods.ensure(currentId, tx);
      await this.settings.setFeeUsd(tx, feeUsd);
      const current = await this.periods.ensure(currentId, tx);
      await this.audit.log(tx, {
        actorId,
        action: 'FEE_UPDATED',
        entity: 'Setting',
        entityId: 'monthlyFeeUsd',
        before: previous ? { feeUsd: money(previous) } : undefined,
        after: { feeUsd: money(feeUsd) },
      });
      return {
        feeUsd: money(feeUsd),
        currentPeriod: current.id,
        currentPeriodFeeUsd: money(current.feeUsd),
      };
    });
  }

  async current(): Promise<BillingCurrentDto> {
    const period = await this.periods.ensure(this.periods.current());
    const today = this.periods.today();
    const [ves, cop] = await Promise.all([
      this.rates.latest(RateCurrency.VES, today),
      this.rates.latest(RateCurrency.COP, today),
    ]);
    const toRate = (r: typeof ves): CurrentRateDto | null =>
      r && {
        ratePerUsd: rate(r.ratePerUsd),
        effectiveDate: toDateString(r.effectiveDate),
        stale: toDateString(r.effectiveDate) < addDays(today, -1),
      };
    return {
      periodo: period.id,
      feeUsd: money(period.feeUsd),
      fee: {
        USD: money(period.feeUsd),
        VES: ves && money(fromUsd(period.feeUsd, ves.ratePerUsd)),
        COP: cop && money(fromUsd(period.feeUsd, cop.ratePerUsd)),
      },
      rates: { VES: toRate(ves), COP: toRate(cop) },
    };
  }

  assertNotFuture(date: string): void {
    if (date > this.periods.today()) {
      throw unprocessable('DATE_IN_FUTURE', 'La fecha no puede ser futura');
    }
  }
}
