import { Prisma } from '@prisma/client';

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

export const ZERO = new Decimal(0);

/** Equivalente en USD: `amount / ratePerUsd`, redondeado a 2 decimales (HALF_UP). */
export function toUsd(amount: Decimal, ratePerUsd: Decimal): Decimal {
  return amount.div(ratePerUsd).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Monto en otra moneda a partir de USD: `usd × ratePerUsd`, redondeado a 2 decimales (HALF_UP). */
export function fromUsd(usd: Decimal, ratePerUsd: Decimal): Decimal {
  return usd.mul(ratePerUsd).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Serialización de montos: siempre string con 2 decimales. */
export function money(value: Decimal): string {
  return value.toFixed(2);
}

/** Serialización de tasas: string con 4 decimales. */
export function rate(value: Decimal): string {
  return value.toFixed(4);
}
