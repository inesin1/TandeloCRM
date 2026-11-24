import { parseCsv } from './csv-parser';

describe('parseCsv', () => {
  it('reads a UTF-8 BOM, semicolon separators, escaped quotes, and line breaks in quoted values', () => {
    expect(
      parseCsv('\uFEFFname;email\r\n"Acme; Europe";"hello ""world""\nagain"'),
    ).toEqual([
      ['name', 'email'],
      ['Acme; Europe', 'hello "world"\nagain'],
    ]);
  });

  it('rejects a quoted value that is never closed', () => {
    expect(() => parseCsv('name,email\n"Acme,acme@example.test')).toThrow(
      'A quoted value is not closed.',
    );
  });
});
