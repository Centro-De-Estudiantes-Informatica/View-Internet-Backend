import { timingSafeEqual } from 'node:crypto';

/** Header con la IP del navegador que manda el servidor de la web. */
export const CLIENT_IP_HEADER = 'x-client-ip';
/** Secreto compartido que prueba que el header anterior lo puso la web y no el cliente. */
export const CLIENT_IP_SECRET_HEADER = 'x-client-ip-secret';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

function header(req: RequestLike, name: string): string | undefined {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * IP del usuario final para limitar intentos de login.
 *
 * La web llama a la API desde su servidor, así que `req.ip` es la IP de la web (y en Vercel
 * `X-Forwarded-For` se sobrescribe). Si la web manda `X-Client-IP` junto con el secreto
 * compartido `CLIENT_IP_SECRET`, se usa esa IP; si no, `req.ip`.
 */
export function resolveClientIp(req: RequestLike, secret: string | undefined): string {
  const fallback = req.ip ?? 'unknown';
  if (!secret) return fallback;
  const given = header(req, CLIENT_IP_SECRET_HEADER);
  const clientIp = header(req, CLIENT_IP_HEADER);
  if (!given || !clientIp || !sameSecret(given, secret)) return fallback;
  return clientIp.slice(0, 64);
}
