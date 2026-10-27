import { Decimal, ZERO } from './money';

export const PERIOD_STATUSES = ['AL_DIA', 'PARCIAL', 'EN_REVISION', 'PENDIENTE'] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export const DEFAULT_TOLERANCE_USD = '0.05';

export interface PeriodStatusInput {
  /** Suma de `amountUsd` de los pagos APROBADO del periodo. */
  paidUsd: Decimal;
  feeUsd: Decimal;
  /** Cantidad de pagos EN_REVISION del periodo. */
  inReviewCount: number;
  toleranceUsd: Decimal;
}

/**
 * Regla de estado mensual:
 * AL_DIA si pagado ≥ cuota − tolerancia; PARCIAL si pagado > 0;
 * EN_REVISION si no hay nada aprobado pero sí algo en revisión; PENDIENTE en otro caso.
 * La consulta SQL de listados (`statusSql`) replica esta misma regla.
 */
export function periodStatus({
  paidUsd,
  feeUsd,
  inReviewCount,
  toleranceUsd,
}: PeriodStatusInput): PeriodStatus {
  if (paidUsd.gte(feeUsd.minus(toleranceUsd))) return 'AL_DIA';
  if (paidUsd.gt(ZERO)) return 'PARCIAL';
  if (inReviewCount > 0) return 'EN_REVISION';
  return 'PENDIENTE';
}

/** Saldo pendiente en USD (nunca negativo; 0 si está al día dentro de la tolerancia). */
export function balanceUsd(input: PeriodStatusInput): Decimal {
  if (periodStatus(input) === 'AL_DIA') return ZERO;
  return Decimal.max(ZERO, input.feeUsd.minus(input.paidUsd));
}
