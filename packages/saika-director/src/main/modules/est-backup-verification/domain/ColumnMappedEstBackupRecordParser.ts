import type { BackupRecord } from './EstBackupComparator';
import type { EstBackupRecordParser } from './EstBackupRecordParser';
import { parseDelimitedRows } from './parseDelimitedRows';

export interface EstBackupColumnMapping {
  readonly delimiter: ',' | ';' | '\t';
  readonly decimalSeparator: '.' | ',';
  readonly keyColumn: string;
  readonly totalScoreColumn: string;
  readonly rankColumn: string | null;
}

/** Explicit mappings preserve exporter-specific column names without guessing a device protocol. */
export class ColumnMappedEstBackupRecordParser implements EstBackupRecordParser {
  readonly format = 'MAPPED_DELIMITED_V1';
  readonly extensions = ['.csv', '.tsv', '.txt'];
  readonly mapping: EstBackupColumnMapping;
  readonly sourceDescription: string;

  constructor(mapping: EstBackupColumnMapping) {
    if (![',', ';', '\t'].includes(mapping.delimiter)) throw new Error('Unsupported delimiter');
    if (!['.', ','].includes(mapping.decimalSeparator)) throw new Error('Unsupported decimal separator');
    const column = (value: string) => {
      if (!value.trim() || value.trim().length > 100) throw new Error('Column names must contain 1 to 100 characters');
      return value.trim();
    };
    this.mapping = Object.freeze({
      delimiter: mapping.delimiter,
      decimalSeparator: mapping.decimalSeparator,
      keyColumn: column(mapping.keyColumn),
      totalScoreColumn: column(mapping.totalScoreColumn),
      rankColumn: mapping.rankColumn === null ? null : column(mapping.rankColumn),
    });
    const selected = [this.mapping.keyColumn, this.mapping.totalScoreColumn, this.mapping.rankColumn].filter(
      (value) => value !== null,
    );
    if (new Set(selected).size !== selected.length)
      throw new Error('Select different columns for key, total score, and rank');
    this.sourceDescription = `Mapping ${JSON.stringify(this.mapping)}`;
  }

  supports(fileName: string): boolean {
    return this.extensions.some((extension) => fileName.trim().toLowerCase().endsWith(extension));
  }

  parse(source: string): readonly BackupRecord[] {
    const rows = parseDelimitedRows(source.replace(/^\uFEFF/, ''), this.mapping.delimiter).filter((row) =>
      row.some((field) => field.trim().length > 0),
    );
    if (rows.length < 2) throw new Error('The delimited backup requires a header and at least one record');
    const headers = rows[0]!.map((value) => value.trim());
    const locate = (name: string) => {
      const matches = headers.flatMap((header, index) => (header === name ? [index] : []));
      if (matches.length !== 1) throw new Error(`Expected exactly one column named "${name}"; found ${matches.length}`);
      return matches[0]!;
    };
    const keyIndex = locate(this.mapping.keyColumn);
    const scoreIndex = locate(this.mapping.totalScoreColumn);
    const rankIndex = this.mapping.rankColumn === null ? null : locate(this.mapping.rankColumn);
    return rows.slice(1).map((row, index) => {
      if (row.length !== headers.length)
        throw new Error(`Delimited record ${index + 1} has ${row.length} fields; expected ${headers.length}`);
      const score = row[scoreIndex]!.trim();
      const pattern =
        this.mapping.decimalSeparator === '.' ? /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/ : /^[+-]?(?:\d+(?:,\d+)?|,\d+)$/;
      if (!pattern.test(score))
        throw new Error(`Delimited record ${index + 1} has an invalid total score for the selected decimal separator`);
      const totalScore = Number(score.replace(',', '.'));
      if (!Number.isFinite(totalScore)) throw new Error(`Delimited record ${index + 1} has an invalid total score`);
      const rawRank = rankIndex === null ? '' : row[rankIndex]!.trim();
      const rank = rawRank ? Number(rawRank) : null;
      if (rank !== null && (!/^\d+$/.test(rawRank) || !Number.isSafeInteger(rank) || rank <= 0))
        throw new Error(`Delimited record ${index + 1} has an invalid rank`);
      return { key: row[keyIndex]!.trim(), rank, totalScore };
    });
  }
}
