import { resolveClientIp } from './client-ip';

const SECRET = 'a'.repeat(32);

describe('resolveClientIp', () => {
  it('usa X-Client-IP cuando el secreto coincide', () => {
    const req = {
      ip: '10.0.0.1',
      headers: { 'x-client-ip': '190.1.2.3', 'x-client-ip-secret': SECRET },
    };
    expect(resolveClientIp(req, SECRET)).toBe('190.1.2.3');
  });

  it('ignora X-Client-IP con un secreto incorrecto o ausente', () => {
    const wrong = {
      ip: '10.0.0.1',
      headers: { 'x-client-ip': '1.1.1.1', 'x-client-ip-secret': 'x' },
    };
    const missing = { ip: '10.0.0.1', headers: { 'x-client-ip': '1.1.1.1' } };
    expect(resolveClientIp(wrong, SECRET)).toBe('10.0.0.1');
    expect(resolveClientIp(missing, SECRET)).toBe('10.0.0.1');
  });

  it('sin CLIENT_IP_SECRET configurado nunca confía en el header', () => {
    const req = { ip: '10.0.0.1', headers: { 'x-client-ip': '1.1.1.1', 'x-client-ip-secret': '' } };
    expect(resolveClientIp(req, undefined)).toBe('10.0.0.1');
  });
});
