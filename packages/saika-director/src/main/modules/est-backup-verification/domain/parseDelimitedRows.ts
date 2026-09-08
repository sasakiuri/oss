export function parseDelimitedRows(source: string, delimiter: ',' | ';' | '\t' = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let quoteClosed = false;

  const finishField = () => {
    row.push(field);
    field = '';
    quoteClosed = false;
  };
  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quoted) {
      if (character !== '"') {
        field += character;
      } else if (source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = false;
        quoteClosed = true;
      }
      continue;
    }
    if (character === '"') {
      if (field.length > 0 || quoteClosed) throw new Error('The EST backup CSV has an unexpected quote');
      quoted = true;
    } else if (character === delimiter) {
      finishField();
    } else if (character === '\n') {
      finishRow();
    } else if (character === '\r') {
      if (source[index + 1] === '\n') index += 1;
      finishRow();
    } else {
      if (quoteClosed && character.trim().length > 0) {
        throw new Error('The EST backup CSV has content after a closing quote');
      }
      if (!quoteClosed) field += character;
    }
  }
  if (quoted) throw new Error('The EST backup CSV has an unterminated quoted field');
  if (field.length > 0 || row.length > 0 || quoteClosed) finishRow();
  return rows;
}
