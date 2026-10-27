import { Decimal } from './money';
import { balanceUsd, periodStatus, PeriodStatusInput } from './period-status';

const input = (paid: string, inReviewCount = 0, fee = '5.00'): PeriodStatusInput => ({
  paidUsd: new Decimal(paid),
  feeUsd: new Decimal(fee),
  inReviewCount,
  toleranceUsd: new Decimal('0.05'),
});

describe('periodStatus', () => {
  it('AL_DIA con la cuota completa', () => {
    expect(periodStatus(input('5.00'))).toBe('AL_DIA');
  });

  it('AL_DIA dentro de la tolerancia de redondeo', () => {
    expect(periodStatus(input('4.95'))).toBe('AL_DIA');
    expect(periodStatus(input('4.94'))).toBe('PARCIAL');
  });

  it('AL_DIA si pagó de más', () => {
    expect(periodStatus(input('7.00'))).toBe('AL_DIA');
  });

  it('PARCIAL con algo aprobado aunque tenga pagos en revisión', () => {
    expect(periodStatus(input('3.00', 1))).toBe('PARCIAL');
  });

  it('EN_REVISION sin nada aprobado y con un pago en revisión', () => {
    expect(periodStatus(input('0', 1))).toBe('EN_REVISION');
  });

  it('PENDIENTE sin pagos', () => {
    expect(periodStatus(input('0'))).toBe('PENDIENTE');
  });
});

describe('balanceUsd', () => {
  it('es la diferencia con la cuota', () => {
    expect(balanceUsd(input('3.00')).toFixed(2)).toBe('2.00');
  });

  it('es 0 al día o con pago de más', () => {
    expect(balanceUsd(input('4.96')).toFixed(2)).toBe('0.00');
    expect(balanceUsd(input('9.00')).toFixed(2)).toBe('0.00');
  });
});
