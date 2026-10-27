import { addMonths, currentPeriod, lastPeriods, localDate } from './period';

describe('period helpers', () => {
  it('calcula la fecha local en Caracas', () => {
    // 03:00 UTC del 1 de noviembre = 23:00 del 31 de octubre en Caracas (UTC-4).
    const at = new Date('2026-11-01T03:00:00Z');
    expect(localDate('America/Caracas', at)).toBe('2026-10-31');
    expect(currentPeriod('America/Caracas', at)).toBe('2026-10');
  });

  it('suma y resta meses cruzando el año', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-10', -12)).toBe('2025-10');
  });

  it('lista los últimos periodos en orden', () => {
    expect(lastPeriods('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});
