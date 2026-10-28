import { Prisma } from '@prisma/client';
import { Decimal } from '../common/domain/money';

/**
 * Subconsulta con el estado de cada usuario en un periodo, en una sola pasada (sin N+1).
 * Columnas: `user_id`, `paid_usd`, `in_review`, `period_status`.
 * Replica la regla de `periodStatus()` en `common/domain/period-status.ts`.
 */
export function userPeriodStatusSql(periodId: string, feeUsd: Decimal, toleranceUsd: Decimal) {
  const threshold = feeUsd.minus(toleranceUsd).toFixed(2);
  return Prisma.sql`
    SELECT
      u.id AS user_id,
      COALESCE(a.paid_usd, 0) AS paid_usd,
      COALESCE(a.in_review, 0) AS in_review,
      CASE
        WHEN COALESCE(a.paid_usd, 0) >= ${threshold}::numeric THEN 'AL_DIA'
        WHEN COALESCE(a.paid_usd, 0) > 0 THEN 'PARCIAL'
        WHEN COALESCE(a.in_review, 0) > 0 THEN 'EN_REVISION'
        ELSE 'PENDIENTE'
      END AS period_status
    FROM users u
    LEFT JOIN (
      SELECT
        user_id,
        SUM(amount_usd) FILTER (WHERE status = 'APROBADO') AS paid_usd,
        COUNT(*) FILTER (WHERE status = 'EN_REVISION')::int AS in_review
      FROM payments
      WHERE period_id = ${periodId}
      GROUP BY user_id
    ) a ON a.user_id = u.id`;
}
