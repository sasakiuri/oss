import { describe, expect, it } from 'vitest';
import {
  ColumnMappedEstBackupRecordParser,
  EstBackupRecordParserRegistry,
  CanonicalCsvEstBackupRecordParser,
  type EstBackupColumnMapping,
} from '@/main/modules/est-backup-verification';

const mapping: EstBackupColumnMapping = {
  delimiter: ';',
  decimalSeparator: ',',
  keyColumn: 'Bib',
  totalScoreColumn: 'Total',
  rankColumn: 'Place',
};
const parse = (source: string, overrides: Partial<EstBackupColumnMapping> = {}) =>
  new EstBackupRecordParserRegistry([new ColumnMappedEstBackupRecordParser({ ...mapping, ...overrides })]).parse(
    'export.csv',
    source,
  );

describe('Column-mapped EST backups', () => {
  it('preserves string keys, handles quoted fields and decimal commas, and records the exact mapping', () => {
    const parsed = parse(
      '\uFEFFName;Total;Place;Bib\r\n"Athlete; A";"630,1";1;00101\r\n"Athlete ""B""";629,0;;00102\r\n',
    );
    expect(parsed.records).toEqual([
      { key: '00101', rank: 1, totalScore: 630.1 },
      { key: '00102', rank: null, totalScore: 629 },
    ]);
    expect(parsed.sourceDescription).toBe(`Mapping ${JSON.stringify(mapping)}`);
  });

  it('supports tab-delimited exports without rank and treats column names as explicit selections', () => {
    const parser = new ColumnMappedEstBackupRecordParser({
      ...mapping,
      delimiter: '\t',
      decimalSeparator: '.',
      rankColumn: null,
    });
    expect(
      new EstBackupRecordParserRegistry([parser]).parse('export.TSV', 'Bib\tTotal\tName\n00101\t630.1\tA').records,
    ).toEqual([{ key: '00101', rank: null, totalScore: 630.1 }]);
    expect(() => parse('bib;Total;Place\n001;630,1;1')).toThrow('column named "Bib"');
  });

  it.each([
    ['Bib;Total;Total;Place\n001;630,1;630,1;1', 'exactly one column'],
    ['Bib;Total;Place\n001;630,1;1;extra', 'fields'],
    ['Bib;Total;Place\n001;630,1', 'fields'],
    ['Bib;Total;Place\n001;630.1;1', 'decimal separator'],
    ['Bib;Total;Place\n001;6e2;1', 'invalid total score'],
    ['Bib;Total;Place\n001;0x10;1', 'invalid total score'],
    ['Bib;Total;Place\n001;1.234,5;1', 'invalid total score'],
    ['Bib;Total;Place\n001;630,1;0', 'invalid rank'],
    ['Bib;Total;Place\n001;630,1;1\n 001 ;630,1;1', 'Duplicate EST backup key'],
    ['Bib;Total;Place\n"001;630,1;1', 'unterminated'],
  ])('rejects malformed or ambiguous export %s', (source, error) => {
    expect(() => parse(source)).toThrow(error);
  });

  it('rejects overlapping mappings and ambiguous parser registration rather than choosing by order', () => {
    expect(() => new ColumnMappedEstBackupRecordParser({ ...mapping, totalScoreColumn: 'Bib' })).toThrow(
      'different columns',
    );
    const registry = new EstBackupRecordParserRegistry([
      new CanonicalCsvEstBackupRecordParser(),
      new ColumnMappedEstBackupRecordParser(mapping),
    ]);
    expect(() => registry.parse('export.csv', 'Bib;Total;Place\n001;630,1;1')).toThrow('select a single format');
  });
});
