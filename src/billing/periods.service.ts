import { Injectable } from '@nestjs/common';
import { Period, Prisma } from '@prisma/client';
import { currentPeriod, localDate, PERIOD_RE } from '../common/domain/period';
import { Decimal } from '../common/domain/money';
import { unprocessable } from '../common/errors/business-error';
import { AppConfig } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from './settings.service';

type Db = PrismaService | Prisma.TransactionClient;

/** Periodos mensuales `AAAA-MM`. Se abren de forma perezosa congelando la cuota vigente. */
@Injectable()
export class PeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: AppConfig,
  ) {}

  current(): string {
    return currentPeriod(this.config.get('APP_TIMEZONE'));
  }

  today(): string {
    return localDate(this.config.get('APP_TIMEZONE'));
  }

  /** Devuelve el periodo; si no existe lo abre con la cuota vigente en este momento. */
  async ensure(periodId: string, db: Db = this.prisma): Promise<Period> {
    assertPeriodId(periodId);
    const existing = await db.period.findUnique({ where: { id: periodId } });
    if (existing) return existing;
    const fee = await this.settings.feeUsd(db);
    if (!fee) {
      throw unprocessable('FEE_NOT_CONFIGURED', 'Aún no se ha configurado la cuota mensual');
    }
    // upsert para tolerar dos aperturas simultáneas del mismo periodo.
    return db.period.upsert({
      where: { id: periodId },
      create: { id: periodId, feeUsd: fee },
      update: {},
    });
  }

  /**
   * Cuota de un periodo sin abrirlo: la congelada si existe, o la vigente si aún no se abrió.
   * `null` si no hay cuota configurada.
   */
  async feeFor(periodId: string): Promise<Decimal | null> {
    assertPeriodId(periodId);
    const period = await this.prisma.period.findUnique({ where: { id: periodId } });
    return period?.feeUsd ?? (await this.settings.feeUsd());
  }
}

export function assertPeriodId(periodId: string): void {
  if (!PERIOD_RE.test(periodId)) {
    throw unprocessable('INVALID_PERIOD', 'El periodo debe tener el formato AAAA-MM');
  }
}
