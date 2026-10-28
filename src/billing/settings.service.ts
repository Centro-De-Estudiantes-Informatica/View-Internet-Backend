import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '../common/domain/money';
import { DEFAULT_TOLERANCE_USD } from '../common/domain/period-status';
import { PrismaService } from '../prisma/prisma.service';

export const SETTING_MONTHLY_FEE_USD = 'monthlyFeeUsd';
export const SETTING_TOLERANCE_USD = 'statusToleranceUsd';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async feeUsd(db: Db = this.prisma): Promise<Decimal | null> {
    const row = await db.setting.findUnique({ where: { key: SETTING_MONTHLY_FEE_USD } });
    return row ? new Decimal(row.value) : null;
  }

  async setFeeUsd(db: Db, fee: Decimal): Promise<void> {
    const value = fee.toFixed(2);
    await db.setting.upsert({
      where: { key: SETTING_MONTHLY_FEE_USD },
      create: { key: SETTING_MONTHLY_FEE_USD, value },
      update: { value },
    });
  }

  /** Tolerancia de redondeo para considerar AL_DIA (por defecto $0.05). */
  async toleranceUsd(db: Db = this.prisma): Promise<Decimal> {
    const row = await db.setting.findUnique({ where: { key: SETTING_TOLERANCE_USD } });
    return new Decimal(row?.value ?? DEFAULT_TOLERANCE_USD);
  }
}
