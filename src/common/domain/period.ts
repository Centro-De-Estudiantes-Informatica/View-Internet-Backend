/** Identificador de periodo `AAAA-MM`. */
export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha calendario `AAAA-MM-DD` en la zona horaria indicada. */
export function localDate(timeZone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export function periodOf(date: string): string {
  return date.slice(0, 7);
}

export function currentPeriod(timeZone: string, at: Date = new Date()): string {
  return periodOf(localDate(timeZone, at));
}

/** Suma `delta` meses a un periodo: `addMonths('2026-01', -1)` → `2025-12`. */
export function addMonths(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Los `count` periodos que terminan en `last`, del más antiguo al más reciente. */
export function lastPeriods(last: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(last, i - count + 1));
}

/** Instante final (exclusivo) de un periodo, en UTC: inicio del mes siguiente. */
export function periodEndUtc(period: string): Date {
  return new Date(`${addMonths(period, 1)}-01T00:00:00Z`);
}

/** `AAAA-MM-DD` → `Date` a medianoche UTC (así guarda Prisma las columnas `@db.Date`). */
export function dateOnly(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** `Date` de una columna `@db.Date` → `AAAA-MM-DD`. */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
