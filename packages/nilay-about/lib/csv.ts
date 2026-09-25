/**
 * CSV for the Labs tools, as RFC 4180 has it: comma separated, CRLF line ends, and a cell quoted
 * whenever a comma, a quote or a line break would otherwise split it.
 *
 * Text a person typed is kept inert: a spreadsheet runs a cell that starts with =, +, -, @, a tab
 * or a carriage return as a formula, so such text gets a leading apostrophe. Numbers are written
 * as numbers, since a negative number is not typed text and must stay a number in the sheet.
 */

export type CsvValue = string | number | null;

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

/** One cell. `null` and a number that is not finite are left empty rather than written as text. */
export function csvCell(value: CsvValue): string {
  if (value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const inert = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(inert) ? `"${inert.replaceAll('"', '""')}"` : inert;
}

/** The header row, then one line per row, joined with CRLF. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
