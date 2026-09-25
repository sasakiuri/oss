/**
 * Temporary results pages for a competition: the organizer pastes a table, protects it with a
 * passphrase, and shares a link. The page and its data expire on their own.
 */

import { parseDelimited } from './delimited-text';

export const RESULTS_DAYS_OPTIONS = [7, 30, 90] as const;
export const RESULTS_TITLE_MAX_LENGTH = 80;
export const RESULTS_NOTE_MAX_LENGTH = 500;
export const RESULTS_COLUMNS_MAX = 10;
export const RESULTS_ROWS_MAX = 300;
export const RESULTS_CELL_MAX_LENGTH = 40;
export const RESULTS_PASSPHRASE_MIN_LENGTH = 8;
export const RESULTS_PASSPHRASE_MAX_LENGTH = 64;

export type TableError = 'empty' | 'tooManyColumns' | 'tooManyRows' | 'cellTooLong';

/**
 * A table pasted from a spreadsheet (tab-separated) or a CSV file: the first line is the header.
 * Blank lines are skipped and short rows are padded; nothing is cut, so a limit is an error.
 */
export function parseResultsTable(
  text: string,
): { ok: true; columns: string[]; rows: string[][] } | { ok: false; error: TableError } {
  const delimiter = text.includes('\t') ? '\t' : ',';
  const lines = parseDelimited(text, delimiter)
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell !== ''));
  const [header, ...rows] = lines;
  if (!header || rows.length === 0) return { ok: false, error: 'empty' };
  const width = Math.max(header.length, ...rows.map((row) => row.length));
  if (width > RESULTS_COLUMNS_MAX) return { ok: false, error: 'tooManyColumns' };
  if (rows.length > RESULTS_ROWS_MAX) return { ok: false, error: 'tooManyRows' };
  const pad = (row: string[]) => [...row, ...Array<string>(width - row.length).fill('')];
  const padded = [pad(header), ...rows.map(pad)];
  if (padded.some((row) => row.some((cell) => [...cell].length > RESULTS_CELL_MAX_LENGTH))) {
    return { ok: false, error: 'cellTooLong' };
  }
  return { ok: true, columns: pad(header), rows: padded.slice(1) };
}

/** The public page's address; the id is in the fragment, which is not sent to a server. */
export const resultsViewPath = (id: string) => `/labs/event-results/view#${id}`;

/** The id in a results page link (or the fragment alone), or null. */
export function readResultsId(value: string): string | null {
  return /(?:^|#)([A-Za-z0-9_-]{16})$/.exec(value.trim())?.[1] ?? null;
}

/** The table back as tab-separated text, for editing in the same box it was pasted into. */
export function tableToText(columns: readonly string[], rows: readonly (readonly string[])[]): string {
  const quote = (cell: string) => (/[\t"\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  return [columns, ...rows].map((row) => row.map(quote).join('\t')).join('\n');
}
