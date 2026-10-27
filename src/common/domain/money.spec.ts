import { Decimal, fromUsd, money, rate, toUsd } from './money';

const d = (v: string) => new Decimal(v);

describe('toUsd', () => {
  it('convierte bolívares con la tasa del día', () => {
    expect(money(toUsd(d('1000.00'), d('200.00')))).toBe('5.00');
    expect(money(toUsd(d('600.00'), d('200.00')))).toBe('3.00');
  });

  it('redondea HALF_UP a 2 decimales', () => {
    // 1000 / 210 = 4.7619… → 4.76
    expect(money(toUsd(d('1000.00'), d('210.00')))).toBe('4.76');
    // 20001 / 4000 = 5.00025 → 5.00
    expect(money(toUsd(d('20001.00'), d('4000.0000')))).toBe('5.00');
    // 0.125 → 0.13 (HALF_UP, no bancario)
    expect(money(toUsd(d('1.00'), d('8.0000')))).toBe('0.13');
    // 0.135 → 0.14
    expect(money(toUsd(d('27.00'), d('200.0000')))).toBe('0.14');
  });

  it('USD con tasa 1 queda igual', () => {
    expect(money(toUsd(d('5.00'), d('1')))).toBe('5.00');
  });

  it('no pierde precisión con montos grandes', () => {
    expect(money(toUsd(d('123456789012.34'), d('36.5678')))).toBe('3376106547.63');
  });
});

describe('fromUsd', () => {
  it('expresa la cuota en otras monedas', () => {
    expect(money(fromUsd(d('5.00'), d('200.00')))).toBe('1000.00');
    expect(money(fromUsd(d('2.00'), d('200.00')))).toBe('400.00');
    expect(money(fromUsd(d('5.00'), d('4123.4567')))).toBe('20617.28');
  });
});

describe('serialización', () => {
  it('usa 2 decimales para montos y 4 para tasas', () => {
    expect(money(d('5'))).toBe('5.00');
    expect(rate(d('200'))).toBe('200.0000');
  });
});
