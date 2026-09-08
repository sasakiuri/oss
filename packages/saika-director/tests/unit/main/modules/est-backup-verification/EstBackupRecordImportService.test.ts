import { describe, expect, it, vi } from 'vitest';

import {
  CanonicalJsonEstBackupRecordParser,
  ColumnMappedEstBackupRecordParser,
  EstBackupRecordImportService,
  EstBackupRecordParserRegistry,
  type IEstBackupRecordFileGateway,
} from '@/main/modules/est-backup-verification';

const SHA256 = 'a'.repeat(64);

describe('EstBackupRecordImportService', () => {
  it('uses an explicitly selected parser and retains its mapping with the original file hash', async () => {
    const files: IEstBackupRecordFileGateway = {
      chooseSource: vi.fn(async () => ({
        fileName: 'export.txt',
        content: 'Bib;Total\n001;630,1',
        sizeBytes: 19,
        sha256: SHA256,
      })),
    };
    const service = new EstBackupRecordImportService(
      files,
      new EstBackupRecordParserRegistry([new CanonicalJsonEstBackupRecordParser()]),
    );
    const parser = new ColumnMappedEstBackupRecordParser({
      delimiter: ';',
      decimalSeparator: ',',
      keyColumn: 'Bib',
      totalScoreColumn: 'Total',
      rankColumn: null,
    });
    const result = await service.importRecords(parser);
    expect(result).toMatchObject({
      status: 'IMPORTED',
      records: [{ key: '001', rank: null, totalScore: 630.1 }],
      sourceReference: `MAPPED_DELIMITED_V1; 19 bytes; SHA-256 ${SHA256}; ${parser.sourceDescription}`,
    });
    expect(files.chooseSource).toHaveBeenCalledWith(['.csv', '.tsv', '.txt']);
    await expect(service.importRecords()).rejects.toThrow('Unsupported EST backup file type');
  });
  it('returns cancellation without invoking a parser', async () => {
    const files: IEstBackupRecordFileGateway = { chooseSource: vi.fn(async () => null) };
    const service = new EstBackupRecordImportService(
      files,
      new EstBackupRecordParserRegistry([new CanonicalJsonEstBackupRecordParser()]),
    );

    await expect(service.importRecords()).resolves.toEqual({ status: 'CANCELLED' });
  });

  it('returns normalized records with raw-file provenance', async () => {
    const files: IEstBackupRecordFileGateway = {
      chooseSource: vi.fn(async () => ({
        fileName: 'range-a-independent.json',
        content: '[{"key":" 101 ","rank":1,"totalScore":630.1}]',
        sizeBytes: 49,
        sha256: SHA256,
      })),
    };
    const service = new EstBackupRecordImportService(
      files,
      new EstBackupRecordParserRegistry([new CanonicalJsonEstBackupRecordParser()]),
    );

    await expect(service.importRecords()).resolves.toEqual({
      status: 'IMPORTED',
      fileName: 'range-a-independent.json',
      sizeBytes: 49,
      sha256: SHA256,
      format: 'JSON',
      sourceName: 'range-a-independent.json',
      sourceReference: `JSON; 49 bytes; SHA-256 ${SHA256}`,
      records: [{ key: '101', rank: 1, totalScore: 630.1 }],
    });
  });
});
