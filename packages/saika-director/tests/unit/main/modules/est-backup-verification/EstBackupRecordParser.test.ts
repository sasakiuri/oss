import { describe, expect, it } from 'vitest';

import {
  CanonicalCsvEstBackupRecordParser,
  CanonicalJsonEstBackupRecordParser,
  EstBackupRecordParserRegistry,
} from '@/main/modules/est-backup-verification';

function registry(): EstBackupRecordParserRegistry {
  return new EstBackupRecordParserRegistry([
    new CanonicalJsonEstBackupRecordParser(),
    new CanonicalCsvEstBackupRecordParser(),
  ]);
}

describe('EstBackupRecordParserRegistry', () => {
  it('parses a BOM-prefixed canonical JSON envelope and normalizes keys', () => {
    const parsed = registry().parse(
      'independent-memory.JSON',
      '\uFEFF{ "records": [{ "key": " 101 ", "rank": 1, "totalScore": 630.1 }] }',
    );

    expect(parsed).toEqual({
      format: 'JSON',
      records: [{ key: '101', rank: 1, totalScore: 630.1 }],
    });
  });

  it('parses CSV aliases, quoted fields, CRLF, and an omitted rank', () => {
    const parsed = registry().parse(
      'est-printout.csv',
      '\uFEFFStart Number,Place,Total Score,Name\r\n"10,1",1,630.1,"Athlete, A"\r\n102,,629.0,Athlete B\r\n',
    );

    expect(parsed).toEqual({
      format: 'CSV',
      records: [
        { key: '10,1', rank: 1, totalScore: 630.1 },
        { key: '102', rank: null, totalScore: 629 },
      ],
    });
  });

  it('rejects duplicate keys and unsupported formats before verification', () => {
    expect(() =>
      registry().parse('backup.json', '[{"key":"101","totalScore":630},{"key":" 101 ","totalScore":629}]'),
    ).toThrow('Duplicate EST backup key: 101');
    expect(() => registry().parse('backup.xml', '<records />')).toThrow(
      'Unsupported EST backup file type; expected one of: .json, .csv',
    );
  });

  it('rejects malformed numeric fields and unterminated CSV quotes', () => {
    expect(() => registry().parse('backup.csv', 'key,totalScore\n101,not-a-score')).toThrow(
      'CSV line 2 has an invalid totalScore',
    );
    expect(() => registry().parse('backup.csv', 'key,totalScore\n"101,630')).toThrow(
      'The EST backup CSV has an unterminated quoted field',
    );
  });
});
