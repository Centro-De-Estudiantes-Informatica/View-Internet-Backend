import type { Payment, User } from '@prisma/client';
import { formatCedula } from '../common/domain/cedula';
import { money, rate } from '../common/domain/money';
import { toDateString } from '../common/domain/period';
import type { PaymentDto } from './dto/payments.dto';

export type PaymentWithUser = Payment & {
  user: Pick<User, 'id' | 'cedulaPrefix' | 'cedulaDigits' | 'fullName'>;
};

export const PAYMENT_USER_SELECT = {
  select: { id: true, cedulaPrefix: true, cedulaDigits: true, fullName: true },
} as const;

export function toPaymentDto(p: PaymentWithUser): PaymentDto {
  return {
    id: p.id,
    user: {
      id: p.user.id,
      cedula: formatCedula(p.user.cedulaPrefix, p.user.cedulaDigits),
      fullName: p.user.fullName,
    },
    periodo: p.periodId,
    method: p.method,
    currency: p.currency,
    amount: money(p.amount),
    rate: rate(p.rate),
    rateDate: p.rateDate && toDateString(p.rateDate),
    amountUsd: money(p.amountUsd),
    status: p.status,
    reference: p.reference,
    bank: p.bank,
    payerPhone: p.payerPhone,
    paidAt: toDateString(p.paidAt),
    hasReceipt: p.receiptKey !== null,
    note: p.note,
    registeredBy: p.registeredById,
    reviewedBy: p.reviewedById,
    reviewedAt: p.reviewedAt,
    reviewNote: p.reviewNote,
    voidedBy: p.voidedById,
    voidedAt: p.voidedAt,
    voidReason: p.voidReason,
    createdAt: p.createdAt,
  };
}
