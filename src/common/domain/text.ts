/** Minúsculas sin acentos ni espacios repetidos: `José  Rodríguez` → `jose rodriguez`. */
export function searchableText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
