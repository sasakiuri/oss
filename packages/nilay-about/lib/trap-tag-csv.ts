import {
  TRAP_TAG_FIELDS,
  TRAP_TAG_MAX_FIELD_LENGTH,
  emptyTrapTagDraft,
  validateTrapTagFields,
  type TrapTagDraft,
  type TrapTagFieldError,
  type TrapTagFieldKey,
  type TrapTagPurpose,
} from '@/lib/schemas/trap-tag';

/** The column headers, in Japanese as on the tag. */
export const TRAP_TAG_CSV_HEADERS: Record<TrapTagFieldKey, string> = {
  address: '住所',
  name: '氏名',
  governor: '登録の都道府県知事名',
  fiscalYear: '登録年度',
  registrationNumber: '登録番号',
  authority: '許可権者名',
  validPeriod: '許可の有効期間',
  permitNumber: '許可証の番号',
  species: '捕獲等をする鳥獣の種類',
};

/** Up to this many tag sets are made from one file; each becomes its own sheet. */
export const TRAP_TAG_CSV_MAX_ROWS = 50;

// A spreadsheet runs a leading =, +, - or @ as a formula; the template has no data, but the rule is kept.
const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

/** A file with the header row of a purpose, to fill in a spreadsheet. UTF-8 with a BOM, CRLF. */
export function trapTagCsvTemplate(purpose: TrapTagPurpose): string {
  return `﻿${TRAP_TAG_FIELDS[purpose].map((key) => cell(TRAP_TAG_CSV_HEADERS[key])).join(',')}\r\n`;
}

/** RFC 4180 records: quoted fields may hold commas, quotes (doubled) and line breaks. */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"' && field === '') quoted = true;
    else if (character === ',') {
      record.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else field += character;
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  // A line with nothing on it is not a tag.
  return records.filter((row) => row.some((value) => value.trim() !== ''));
}

export interface TrapTagCsvRow {
  /** The line of the file, counting the header as 1. */
  line: number;
  fields: TrapTagDraft;
  errors: Partial<Record<TrapTagFieldKey, TrapTagFieldError>>;
}

export type TrapTagCsvResult =
  | { ok: true; rows: TrapTagCsvRow[] }
  | { ok: false; reason: 'empty' | 'tooMany' | 'missingColumns'; missing?: string[] };

/**
 * Reads a file of tag sets for a purpose. Columns are found by their header, in any order; unknown
 * columns are ignored. Each row is checked like the form, and rows with errors are returned with them
 * so the person can correct the file.
 */
export function readTrapTagCsv(
  text: string,
  purpose: TrapTagPurpose,
  blanks: readonly TrapTagFieldKey[] = [],
): TrapTagCsvResult {
  const [header, ...records] = parseCsv(text);
  if (!header || records.length === 0) return { ok: false, reason: 'empty' };
  if (records.length > TRAP_TAG_CSV_MAX_ROWS) return { ok: false, reason: 'tooMany' };
  const keys = TRAP_TAG_FIELDS[purpose].filter((key) => !blanks.includes(key));
  const columns = new Map(header.map((name, index) => [name.trim(), index]));
  const missing = keys.filter((key) => !columns.has(TRAP_TAG_CSV_HEADERS[key])).map((key) => TRAP_TAG_CSV_HEADERS[key]);
  if (missing.length > 0) return { ok: false, reason: 'missingColumns', missing };
  const rows = records.map((record, index): TrapTagCsvRow => {
    const fields: TrapTagDraft = { ...emptyTrapTagDraft };
    for (const key of keys) {
      const value = record[columns.get(TRAP_TAG_CSV_HEADERS[key]) ?? -1] ?? '';
      fields[key] = value.trim().slice(0, TRAP_TAG_MAX_FIELD_LENGTH + 1);
    }
    return { line: index + 2, fields, errors: validateTrapTagFields(purpose, fields, blanks).errors };
  });
  return { ok: true, rows };
}
