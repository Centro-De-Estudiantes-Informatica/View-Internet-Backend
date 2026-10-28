import { Injectable } from '@nestjs/common';
import { Currency, ExchangeRate, RateCurrency } from '@prisma/client';
import { dateOnly, toDateString } from '../common/domain/period';
import { Decimal } from '../common/domain/money';
import { unprocessable } from '../common/errors/business-error';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

export interface ResolvedRate {
  ratePerUsd: Decimal;
  /** Fecha de la tasa usada (`AAAA-MM-DD`); `null` para USD. */
  effectiveDate: string | null;
}

@Injectable()
export class RatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Registra (o corrige) la tasa de un día. */
  async set(
    currency: RateCurrency,
    ratePerUsd: Decimal,
    effectiveDate: string,
    actorId: string,
  ): Promise<ExchangeRate> {
    return this.prisma.$transaction(async (tx) => {
      const where = {
        currency_effectiveDate: { currency, effectiveDate: dateOnly(effectiveDate) },
      };
      const before = await tx.exchangeRate.findUnique({ where });
      const saved = await tx.exchangeRate.upsert({
        where,
        create: {
          currency,
          ratePerUsd,
          effectiveDate: dateOnly(effectiveDate),
          createdById: actorId,
        },
        update: { ratePerUsd, createdById: actorId },
      });
      await this.audit.log(tx, {
        actorId,
        action: before ? 'RATE_UPDATED' : 'RATE_CREATED',
        entity: 'ExchangeRate',
        entityId: saved.id,
        before: before ? { ratePerUsd: before.ratePerUsd.toFixed(4) } : undefined,
        after: { currency, effectiveDate, ratePerUsd: saved.ratePerUsd.toFixed(4) },
      });
      return saved;
    });
  }

  list(currency: RateCurrency | undefined, limit: number): Promise<ExchangeRate[]> {
    return this.prisma.exchangeRate.findMany({
      where: currency ? { currency } : undefined,
      orderBy: [{ effectiveDate: 'desc' }, { currency: 'asc' }],
      take: limit,
    });
  }

  /** Última tasa registrada en o antes de `date`; `null` si no hay ninguna. */
  async latest(currency: RateCurrency, date: string): Promise<ExchangeRate | null> {
    return this.prisma.exchangeRate.findFirst({
      where: { currency, effectiveDate: { lte: dateOnly(date) } },
      orderBy: { effectiveDate: 'desc' },
    });
  }

  /** Tasa aplicable a un pago en `currency` hecho el `date`. USD siempre es 1. */
  async resolve(currency: Currency, date: string): Promise<ResolvedRate> {
    if (currency === Currency.USD) return { ratePerUsd: new Decimal(1), effectiveDate: null };
    const found = await this.latest(currency, date);
    if (!found) {
      throw unprocessable('RATE_MISSING', `No hay una tasa ${currency} registrada para esa fecha`);
    }
    return { ratePerUsd: found.ratePerUsd, effectiveDate: toDateString(found.effectiveDate) };
  }
}
