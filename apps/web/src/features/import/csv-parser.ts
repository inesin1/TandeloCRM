export function parseCsv(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let afterQuote = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
        afterQuote = true;
      } else {
        field += character;
      }
      continue;
    }

    if (
      afterQuote &&
      character !== delimiter &&
      character !== '\r' &&
      character !== '\n' &&
      !/\s/.test(character)
    ) {
      throw new Error('Unexpected text after a quoted value.');
    }
    if (character === '"' && !field.trim() && !afterQuote) {
      field = '';
      quoted = true;
    } else if (character === delimiter) {
      row.push(field.trim());
      field = '';
      afterQuote = false;
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(field.trim());
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      field = '';
      afterQuote = false;
    } else {
      if (afterQuote && /\s/.test(character)) continue;
      field += character;
    }
  }

  if (quoted) throw new Error('A quoted value is not closed.');
  row.push(field.trim());
  if (row.some((value) => value.length)) rows.push(row);
  return rows;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/[\r\n]/, 1)[0] ?? '';
  const candidates = [',', ';', '\t'];
  return candidates.reduce((best, candidate) =>
    countOutsideQuotes(firstLine, candidate) >
    countOutsideQuotes(firstLine, best)
      ? candidate
      : best,
  );
}

function countOutsideQuotes(text: string, delimiter: string): number {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '"' && text[index + 1] === '"' && quoted) {
      index++;
    } else if (text[index] === '"') {
      quoted = !quoted;
    } else if (text[index] === delimiter && !quoted) {
      count++;
    }
  }
  return count;
}
