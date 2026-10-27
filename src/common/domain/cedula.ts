export type CedulaPrefix = 'V' | 'E';

export interface Cedula {
  /** `null` cuando la entrada no trae prefijo. */
  prefix: CedulaPrefix | null;
  /** Solo dígitos, sin ceros a la izquierda. */
  digits: string;
}

const CEDULA_RE = /^([VE])?(\d{5,9})$/;

/**
 * Interpreta una cédula escrita con o sin puntos, guiones, espacios o prefijo `V`/`E`.
 * Ejemplos válidos: `V-28.123.456`, `v28123456`, `28123456`, `E 1.234.567`.
 */
export function parseCedula(input: string): Cedula | null {
  const compact = input.toUpperCase().replace(/[\s.\-_]/g, '');
  const match = CEDULA_RE.exec(compact);
  if (!match) return null;
  const digits = match[2].replace(/^0+/, '');
  if (digits.length < 5) return null;
  return { prefix: (match[1] as CedulaPrefix | undefined) ?? null, digits };
}

/** Forma canónica para almacenar y comparar: `V30555111`. Sin prefijo se asume `V`. */
export function normalizeCedula(input: string): { prefix: CedulaPrefix; digits: string } | null {
  const parsed = parseCedula(input);
  if (!parsed) return null;
  return { prefix: parsed.prefix ?? 'V', digits: parsed.digits };
}

/** Formato de presentación: `V-28.123.456`. */
export function formatCedula(prefix: CedulaPrefix, digits: string): string {
  return `${prefix}-${digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/** Dígitos de un término de búsqueda si trae 3 o más; si no, `null` (se busca por nombre). */
export function searchDigits(term: string): string | null {
  const digits = term.replace(/\D/g, '');
  return digits.length >= 3 ? digits : null;
}
