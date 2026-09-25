import { describe, expect, it } from 'vitest';

import { csvCell, toCsv } from '@/lib/csv';

describe('csvCell', () => {
  it('writes plain text and numbers as they are', () => {
    expect(csvCell('Home range')).toBe('Home range');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(-3)).toBe('-3');
    expect(csvCell(0)).toBe('0');
  });

  it('leaves a missing value and a number that is not finite empty', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('quotes a cell that holds a comma, a quote or a line break, doubling the quotes (RFC 4180)', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell('carriage\rreturn')).toBe('"carriage\rreturn"');
  });

  it('keeps typed text that a spreadsheet would run as a formula inert', () => {
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+81 90')).toBe("'+81 90");
    expect(csvCell('-note')).toBe("'-note");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tindent')).toBe("'\tindent");
    // Made inert first, then quoted, so the apostrophe sits inside the quotes.
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  });
});

describe('toCsv', () => {
  it('puts the header first and ends every line in CRLF, with no line after the last', () => {
    expect(
      toCsv(
        ['name', 'value'],
        [
          ['a', 1],
          ['b, c', null],
        ],
      ),
    ).toBe('name,value\r\na,1\r\n"b, c",');
  });

  it('writes the header alone when there are no rows', () => {
    expect(toCsv(['only'], [])).toBe('only');
  });
});
