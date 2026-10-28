import { Injectable } from '@nestjs/common';
import { Currency } from '@prisma/client';
import { RatesService } from '../billing/rates.service';
import { Decimal, toUsd } from '../common/domain/money';

export interface PaymentAmounts {
  ratePerUsd: Decimal;
  rateDate: string | null;
  amountUsd: Decimal;
}

/** Congela la tasa del día del pago y calcula su equivalente en USD. */
@Injectable()
export class PaymentCalculator {
  constructor(private readonly rates: RatesService) {}

  async calculate(currency: Currency, amount: Decimal, paidAt: string): Promise<PaymentAmounts> {
    const { ratePerUsd, effectiveDate } = await this.rates.resolve(currency, paidAt);
    return { ratePerUsd, rateDate: effectiveDate, amountUsd: toUsd(amount, ratePerUsd) };
  }
}
