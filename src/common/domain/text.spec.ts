import { searchableText } from './text';

describe('searchableText', () => {
  it('quita acentos, mayúsculas y espacios repetidos', () => {
    expect(searchableText('  José   Rodríguez ')).toBe('jose rodriguez');
    expect(searchableText('ÑAÑEZ Güiraldes')).toBe('nanez guiraldes');
  });
});
