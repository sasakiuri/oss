import type { BackupRecord } from './EstBackupComparator';
import { parseDelimitedRows } from './parseDelimitedRows';

const MAX_RECORDS = 1000;
const MAX_KEY_LENGTH = 200;

export type EstBackupRecordFormat = string;

export interface ParsedEstBackupRecords {
  readonly format: EstBackupRecordFormat;
  readonly records: readonly BackupRecord[];
  readonly sourceDescription?: string;
}

/** A replaceable adapter for one external EST backup representation. */
export interface EstBackupRecordParser {
  readonly format: EstBackupRecordFormat;
  readonly sourceDescription?: string;
  readonly extensions: readonly string[];
  supports(fileName: string): boolean;
  parse(source: string): readonly BackupRecord[];
}

/** Selects a parser without coupling the import workflow to a vendor format. */
export class EstBackupRecordParserRegistry {
  constructor(private readonly parsers: readonly EstBackupRecordParser[]) {
    if (parsers.length === 0) throw new Error('At least one EST backup parser must be registered');
    if (parsers.some((parser) => !parser.format.trim())) throw new Error('Every EST backup parser requires a format');
    if (new Set(parsers.map((parser) => parser.format)).size !== parsers.length) {
      throw new Error('EST backup parsers must have unique formats');
    }
  }

  get supportedExtensions(): readonly string[] {
    return [...new Set(this.parsers.flatMap((parser) => parser.extensions))];
  }

  parse(fileName: string, source: string): ParsedEstBackupRecords {
    const candidates = this.parsers.filter((candidate) => candidate.supports(fileName));
    if (candidates.length > 1) throw new Error('Multiple EST backup parsers support this file; select a single format');
    const parser = candidates[0];
    if (!parser) {
      const supported = this.supportedExtensions.join(', ');
      throw new Error(`Unsupported EST backup file type; expected one of: ${supported}`);
    }
    return {
      format: parser.format,
      records: normalizeRecords(parser.parse(source)),
      ...(parser.sourceDescription ? { sourceDescription: parser.sourceDescription } : {}),
    };
  }
}

export class CanonicalJsonEstBackupRecordParser implements EstBackupRecordParser {
  readonly format = 'JSON' as const;
  readonly extensions = ['.json'] as const;

  supports(fileName: string): boolean {
    return hasExtension(fileName, this.extensions);
  }

  parse(source: string): readonly BackupRecord[] {
    let decoded: unknown;
    try {
      decoded = JSON.parse(stripBom(source));
    } catch {
      throw new Error('The EST backup JSON is not valid JSON');
    }
    const records = Array.isArray(decoded)
      ? decoded
      : isObject(decoded) && Array.isArray(decoded.records)
        ? decoded.records
        : null;
    if (!records) throw new Error('The EST backup JSON must be an array or an object with a records array');
    return records.map((record, index) => normalizeJsonRecord(record, index + 1));
  }
}

export class CanonicalCsvEstBackupRecordParser implements EstBackupRecordParser {
  readonly format = 'CSV' as const;
  readonly extensions = ['.csv'] as const;

  supports(fileName: string): boolean {
    return hasExtension(fileName, this.extensions);
  }

  parse(source: string): readonly BackupRecord[] {
    const rows = parseDelimitedRows(stripBom(source)).filter((row) => row.some((field) => field.trim().length > 0));
    if (rows.length < 2) throw new Error('The EST backup CSV requires a header and at least one record');

    const headers = rows[0]!.map(normalizeHeader);
    const keyIndex = findColumn(headers, ['key', 'participantid', 'startnumber', 'issfid', 'teamid'], 'key');
    const totalIndex = findColumn(headers, ['totalscore', 'score', 'total'], 'totalScore');
    const rankIndex = findColumn(headers, ['rank', 'place', 'position'], 'rank', false);

    return rows.slice(1).map((row, index) => {
      const lineNumber = index + 2;
      const key = row[keyIndex]?.trim() ?? '';
      const totalScore = parseCsvNumber(row[totalIndex], 'totalScore', lineNumber);
      const rawRank = rankIndex === null ? '' : (row[rankIndex]?.trim() ?? '');
      const rank = rawRank === '' ? null : parseCsvNumber(rawRank, 'rank', lineNumber);
      if (rank !== null && (!Number.isInteger(rank) || rank <= 0)) {
        throw new Error(`CSV line ${lineNumber} has an invalid rank`);
      }
      return { key, rank, totalScore };
    });
  }
}

function normalizeRecords(records: readonly BackupRecord[]): readonly BackupRecord[] {
  if (records.length === 0) throw new Error('The EST backup must contain at least one record');
  if (records.length > MAX_RECORDS) throw new Error(`The EST backup cannot contain more than ${MAX_RECORDS} records`);

  const keys = new Set<string>();
  return records.map((record, index) => {
    const key = record.key.trim();
    if (!key) throw new Error(`EST backup record ${index + 1} requires a key`);
    if (key.length > MAX_KEY_LENGTH) throw new Error(`EST backup record ${index + 1} has an overlong key`);
    if (keys.has(key)) throw new Error(`Duplicate EST backup key: ${key}`);
    keys.add(key);
    if (!Number.isFinite(record.totalScore)) {
      throw new Error(`EST backup record ${index + 1} has an invalid totalScore`);
    }
    if (record.rank !== undefined && record.rank !== null && (!Number.isInteger(record.rank) || record.rank <= 0)) {
      throw new Error(`EST backup record ${index + 1} has an invalid rank`);
    }
    return { key, rank: record.rank ?? null, totalScore: record.totalScore };
  });
}

function normalizeJsonRecord(value: unknown, position: number): BackupRecord {
  if (!isObject(value)) throw new Error(`EST backup JSON record ${position} must be an object`);
  if (typeof value.key !== 'string') throw new Error(`EST backup JSON record ${position} requires a string key`);
  if (typeof value.totalScore !== 'number') {
    throw new Error(`EST backup JSON record ${position} requires a numeric totalScore`);
  }
  if (value.rank !== undefined && value.rank !== null && typeof value.rank !== 'number') {
    throw new Error(`EST backup JSON record ${position} has a non-numeric rank`);
  }
  return { key: value.key, totalScore: value.totalScore, rank: value.rank as number | null | undefined };
}

function findColumn(headers: readonly string[], aliases: readonly string[], label: string): number;
function findColumn(
  headers: readonly string[],
  aliases: readonly string[],
  label: string,
  required: false,
): number | null;
function findColumn(
  headers: readonly string[],
  aliases: readonly string[],
  label: string,
  required = true,
): number | null {
  const matches = headers.flatMap((header, index) => (aliases.includes(header) ? [index] : []));
  if (matches.length > 1) throw new Error(`The EST backup CSV has multiple ${label} columns`);
  if (matches.length === 0) {
    if (!required) return null;
    throw new Error(`The EST backup CSV is missing the ${label} column`);
  }
  return matches[0]!;
}

function parseCsvNumber(value: string | undefined, label: string, lineNumber: number): number {
  const normalized = value?.trim() ?? '';
  if (!normalized) throw new Error(`CSV line ${lineNumber} requires ${label}`);
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`CSV line ${lineNumber} has an invalid ${label}`);
  return parsed;
}

function hasExtension(fileName: string, extensions: readonly string[]): boolean {
  const normalized = fileName.trim().toLowerCase();
  return extensions.some((extension) => normalized.endsWith(extension));
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[\s_-]+/g, '');
}

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, '');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
