import { formatCedula, normalizeCedula, parseCedula, searchDigits } from './cedula';

describe('parseCedula', () => {
  it.each([
    ['V-28.123.456', { prefix: 'V', digits: '28123456' }],
    ['v28123456', { prefix: 'V', digits: '28123456' }],
    ['28123456', { prefix: null, digits: '28123456' }],
    ['28.123.456', { prefix: null, digits: '28123456' }],
    ['E-1.234.567', { prefix: 'E', digits: '1234567' }],
    [' V 30 555 111 ', { prefix: 'V', digits: '30555111' }],
    ['V-028123456', { prefix: 'V', digits: '28123456' }],
  ])('interpreta %s', (input, expected) => {
    expect(parseCedula(input)).toEqual(expected);
  });

  it.each(['', 'J-12345678', 'V-12', 'abc', '1234567890', 'V-12.34a.567', '00001234'])(
    'rechaza %s',
    (input) => {
      expect(parseCedula(input)).toBeNull();
    },
  );
});

describe('normalizeCedula', () => {
  it('asume V cuando no hay prefijo', () => {
    expect(normalizeCedula('30555111')).toEqual({ prefix: 'V', digits: '30555111' });
  });

  it('respeta el prefijo E', () => {
    expect(normalizeCedula('E-84.000.001')).toEqual({ prefix: 'E', digits: '84000001' });
  });
});

describe('formatCedula', () => {
  it('agrega puntos de miles', () => {
    expect(formatCedula('V', '28123456')).toBe('V-28.123.456');
    expect(formatCedula('E', '1234567')).toBe('E-1.234.567');
    expect(formatCedula('V', '123456')).toBe('V-123.456');
  });
});

describe('searchDigits', () => {
  it('usa los dígitos cuando hay 3 o más', () => {
    expect(searchDigits('28.123')).toBe('28123');
    expect(searchDigits('V-281')).toBe('281');
  });

  it('busca por nombre cuando hay menos de 3 dígitos', () => {
    expect(searchDigits('jose')).toBeNull();
    expect(searchDigits('ana 2')).toBeNull();
  });
});
