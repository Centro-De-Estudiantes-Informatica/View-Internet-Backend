import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '../common/domain/money';
import { DEFAULT_TOLERANCE_USD } from '../common/domain/period-status';
import { PrismaService } from '../prisma/prisma.service';

export const SETTING_MONTHLY_FEE_USD = 'monthlyFeeUsd';
export const SETTING_TOLERANCE_USD = 'statusToleranceUsd';
export const SETTING_PAYMENT_DESTINATION = 'mobilePaymentDestination';

/** Datos del pago móvil de la sede (banco por código SUDEBAN, teléfono y cédula o RIF). */
export interface PaymentDestination {
  bank: string;
  phone: string;
  document: string;
}

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

  async paymentDestination(db: Db = this.prisma): Promise<PaymentDestination | null> {
    const row = await db.setting.findUnique({ where: { key: SETTING_PAYMENT_DESTINATION } });
    return row ? (JSON.parse(row.value) as PaymentDestination) : null;
  }

  async setPaymentDestination(db: Db, destination: PaymentDestination): Promise<void> {
    const value = JSON.stringify(destination);
    await db.setting.upsert({
      where: { key: SETTING_PAYMENT_DESTINATION },
      create: { key: SETTING_PAYMENT_DESTINATION, value },
      update: { value },
    });
  }

  /** Tolerancia de redondeo para considerar AL_DIA (por defecto $0.05). */
  async toleranceUsd(db: Db = this.prisma): Promise<Decimal> {
    const row = await db.setting.findUnique({ where: { key: SETTING_TOLERANCE_USD } });
    return new Decimal(row?.value ?? DEFAULT_TOLERANCE_USD);
  }
}
