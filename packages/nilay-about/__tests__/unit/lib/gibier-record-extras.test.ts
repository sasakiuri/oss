import { describe, expect, it } from 'vitest';

import { readSavedGibierRecords } from '@/app/(standalone)/labs/gibier-record/_store';
import { GIBIER_FINDINGS, gibierFindingsFor } from '@/lib/gibier-findings';
import { formatCoordinate, gibierLocationText, gibierMapUrl, gibierRecordsCsv } from '@/lib/gibier-record';
import { createGibierRecord, gibierRecordSchema } from '@/lib/schemas/gibier-record';

const record = (changes: Partial<ReturnType<typeof createGibierRecord>> = {}) => ({
  ...createGibierRecord('r1', '2026-09-24T00:00:00.000Z'),
  ...changes,
});

const parseCsv = (csv: string) => {
  expect(csv.startsWith('﻿')).toBe(true);
  expect(csv.endsWith('\r\n')).toBe(true);
  return csv.slice(1, -2).split('\r\n');
};

describe('the saved record', () => {
  it('keeps the individual number and the position', () => {
    const saved = record({
      individualNumber: 'A-12',
      latitude: '35.681236',
      longitude: '139.767125',
      locationAccuracyM: '12',
    });
    expect(gibierRecordSchema.parse(saved)).toEqual(saved);
    expect(gibierRecordSchema.safeParse({ ...saved, latitude: '35,68' }).success).toBe(false);
  });

  it('reads a record saved before these fields existed, leaving them absent rather than filled in', () => {
    // A record in the shape saved at b303c7fe, before the number, position and photos existed.
    const older = { ...createGibierRecord('old', '2026-09-01T00:00:00.000Z'), hunterName: '山田太郎', species: 'deer' };
    const parsed = gibierRecordSchema.parse(older);
    expect(parsed).toEqual(older);
    expect(parsed.individualNumber).toBeUndefined();
    // Read as not entered: blank in the CSV and no photos.
    const [header, line] = gibierRecordsCsv([parsed], new Map()).slice(1, -2).split('\r\n');
    const names = header!.split(',');
    const cells = line!.split(',');
    expect(cells[names.indexOf('個体番号')]).toBe('');
    expect(cells[names.indexOf('緯度')]).toBe('');
    expect(cells[names.indexOf('写真の枚数')]).toBe('0');
    expect(cells[names.indexOf('捕獲者名')]).toBe('山田太郎');
    // The store keeps it and reports nothing lost.
    expect(readSavedGibierRecords({ records: [older], currentId: 'old' })).toEqual({
      records: [older],
      currentId: 'old',
      lost: false,
    });
  });
});

describe('the position', () => {
  it('rounds to six places and links to the GSI map only once recorded', () => {
    expect(formatCoordinate(35.6812359999)).toBe('35.681236');
    expect(gibierLocationText(record())).toBe('');
    expect(gibierMapUrl(record())).toBeNull();
    const located = record({ latitude: '35.681236', longitude: '139.767125' });
    expect(gibierLocationText(located)).toBe('35.681236, 139.767125');
    expect(gibierMapUrl(located)).toBe('https://maps.gsi.go.jp/#16/35.681236/139.767125/');
  });

  it('keeps latitude within ±90° and longitude within ±180° (WGS 84)', () => {
    const valid = (latitude: string, longitude: string) =>
      gibierRecordSchema.safeParse(record({ latitude, longitude })).success;
    expect(valid('99.000000', '139.767125')).toBe(false);
    expect(valid('35.681236', '999.000000')).toBe(false);
    expect(valid('-90.5', '0.0')).toBe(false);
    expect(valid('35.681236', '180.000001')).toBe(false);
    expect(valid('90.000000', '-180.000000')).toBe(true);
    expect(valid('-33.868820', '151.209296')).toBe(true);
    expect(gibierMapUrl(record({ latitude: '99.000000', longitude: '999.000000' }))).toBeNull();
    expect(gibierLocationText(record({ latitude: '99.000000', longitude: '999.000000' }))).toBe('');
  });
});

describe('gibierRecordsCsv', () => {
  it('writes a header and one row per animal, in the sheet order with the added columns', () => {
    const lines = parseCsv(
      gibierRecordsCsv(
        [
          record({
            individualNumber: 'A-12',
            species: 'deer',
            hunterName: '山田太郎',
            capturedAt: '2026-09-24T06:30',
            latitude: '35.681236',
            longitude: '139.767125',
            bleeding: 'yes',
            bleedingStartedAt: '2026-09-24T06:40',
            deliveredAt: '2026-09-24T08:10',
          }),
          record({ id: 'r2' }),
        ],
        // The photos are counted from the photo storage, by record id.
        new Map([['r1', 2]]),
      ),
    );
    expect(lines).toHaveLength(3);
    const header = lines[0]!.split(',');
    const row = lines[1]!.split(',');
    const cell = (name: string) => row[header.indexOf(name)];
    expect(header.slice(0, 3)).toEqual(['個体番号', '捕獲獣種', '捕獲者名']);
    expect(cell('個体番号')).toBe('A-12');
    expect(cell('捕獲獣種')).toBe('シカ');
    expect(cell('捕獲日時')).toBe('2026/09/24 06:30');
    expect(cell('緯度')).toBe('35.681236');
    expect(cell('放血開始から搬入まで（分）')).toBe('90');
    expect(cell('写真の枚数')).toBe('2');
    expect(header.filter((name) => name.startsWith('異常の確認：'))).toHaveLength(11);
    expect(lines[2]!.split(',').filter((value) => value !== '')).toEqual(['0']);
  });

  it('quotes commas, quotes and line breaks, and keeps text that looks like a formula as text', () => {
    const [, line] = parseCsv(
      gibierRecordsCsv([record({ notes: '右後肢, "軽傷"\n要確認', hunterName: '=SUM(A1)' })], new Map()),
    );
    expect(line).toContain('"右後肢, ""軽傷""\n要確認"');
    expect(line).toContain("'=SUM(A1)");
  });

  it('leaves out the details set aside behind an answer switched to 無, as the sheet does', () => {
    const [header, line] = parseCsv(gibierRecordsCsv([record({ bleeding: 'no', bleedingPlace: '沢' })], new Map()));
    const names = header!.split(',');
    expect(line!.split(',')[names.indexOf('放血')]).toBe('無');
    expect(line!.split(',')[names.indexOf('放血の場所')]).toBe('');
  });
});

describe('the findings guide', () => {
  it('gives every finding a source and keeps the species apart', () => {
    for (const finding of GIBIER_FINDINGS) expect(finding.where).toMatch(/カラーアトラス p\.\d+|ガイドライン 第/);
    const deer = gibierFindingsFor('organs', 'deer');
    expect(deer.some((finding) => finding.cause === '寄生虫（肝蛭）')).toBe(true);
    expect(deer.some((finding) => finding.species === 'boar')).toBe(false);
    expect(gibierFindingsFor('organs', 'all').length).toBeGreaterThan(deer.length);
  });

  it('gives the atlas body temperature wording for each species', () => {
    const temperatures = gibierFindingsFor('bleeding', 'all').filter((finding) => finding.site === '体温');
    expect(temperatures.map((finding) => [finding.species, finding.sign])).toEqual([
      ['deer', '摂氏 40 度を超える'],
      ['boar', '摂氏 42 度を超える'],
    ]);
  });
});
