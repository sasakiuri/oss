import { describe, expect, it } from 'vitest';

import { buildImagePdf } from '@/lib/image-pdf';
import { emptyTrapTagDraft, validateTrapTagFields } from '@/lib/schemas/trap-tag';
import { getTrapTagLayout, sideValues, trapTagSides } from '@/lib/trap-tag';
import { TRAP_TAG_CSV_HEADERS, parseCsv, readTrapTagCsv, trapTagCsvTemplate } from '@/lib/trap-tag-csv';

const permitFields = {
  ...emptyTrapTagDraft,
  address: '東京都千代田区霞が関1-2-2',
  name: '山田太郎',
  authority: '東京都知事',
  validPeriod: '令和8年4月1日〜令和9年3月31日',
  permitNumber: '第123号',
  species: 'ニホンジカ',
};

describe('sides of the tag', () => {
  it('moves only the species to the back of a two-sided tag', () => {
    expect(trapTagSides('permit', true)).toEqual({
      front: ['address', 'name', 'authority', 'validPeriod', 'permitNumber'],
      back: ['species'],
    });
    expect(trapTagSides('permit', false).back).toEqual([]);
    // A hunting tag has no species, so it is always one-sided.
    expect(trapTagSides('hunting', true).back).toEqual([]);
  });

  it('puts both sets of items on a combined tag, the shared address and name once', () => {
    const { front, back } = trapTagSides('combined', true);
    expect(front).toEqual([
      'address',
      'name',
      'authority',
      'validPeriod',
      'permitNumber',
      'governor',
      'fiscalYear',
      'registrationNumber',
    ]);
    expect(back).toEqual(['species']);
  });

  it('lays the back out with the columns swapped, so each tag backs onto itself on a long-edge flip', () => {
    const front = getTrapTagLayout({ values: ['山田太郎'], charSizeMm: 10, copies: 4 });
    const back = getTrapTagLayout({ values: ['ニホンジカ'], charSizeMm: 10, copies: 4, mirror: true });
    const centre = (layout: typeof front, index: number) => layout.positions[index]!.x + layout.tag.widthMm / 2;
    // Tag 0 is at the left of the front and the right of the back, mirrored about the page centre.
    expect(centre(front, 0) + centre(back, 0)).toBeCloseTo(210, 10);
    expect(back.positions[0]!.y).toBeCloseTo(back.positions[1]!.y, 10);
  });
});

describe('items left blank', () => {
  it('prints a full line of boxes and does not require the item', () => {
    const fields = { ...permitFields, name: '' };
    const { values, blanks } = sideValues(['address', 'name'], fields, ['name']);
    const layout = getTrapTagLayout({ values, blanks, charSizeMm: 10, copies: 1 });
    expect(layout.blankLines).toEqual([1]);
    expect(Array.from(layout.lines[1]!)).toHaveLength(layout.maxCharsPerLine);
    expect(validateTrapTagFields('permit', fields).valid).toBe(false);
    expect(validateTrapTagFields('permit', fields, ['name']).valid).toBe(true);
  });

  it('still refuses a value that is too long, blank or not', () => {
    const result = validateTrapTagFields('permit', { ...permitFields, name: 'あ'.repeat(121) }, ['name']);
    expect(result.errors).toEqual({ name: 'tooLong' });
  });

  it('prints a tag of blanks only', () => {
    const layout = getTrapTagLayout({ values: [''], blanks: [true], charSizeMm: 10, copies: 1 });
    expect(layout.overflow).toBe('none');
  });
});

describe('tags from a CSV', () => {
  it('reads quoted fields with commas, quotes and line breaks', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n"two\nlines",z\n\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['two\nlines', 'z'],
    ]);
  });

  it('writes a template with the Japanese headers of the purpose', () => {
    expect(trapTagCsvTemplate('hunting')).toBe('﻿住所,氏名,登録の都道府県知事名,登録年度,登録番号\r\n');
  });

  it('finds columns by header, checks each row, and names the ones to fix', () => {
    const headers = ['氏名', '住所', '許可権者名', '許可の有効期間', '許可証の番号', '捕獲等をする鳥獣の種類', '備考'];
    const text = [
      headers.join(','),
      '山田太郎,東京都,東京都知事,令和8年度,第1号,ニホンジカ,メモ',
      ',東京都,東京都知事,令和8年度,第2号,イノシシ,',
    ].join('\n');
    const result = readTrapTagCsv(text, 'permit');
    if (!result.ok) throw new Error('expected rows');
    expect(result.rows[0]).toMatchObject({ line: 2, fields: { name: '山田太郎', address: '東京都' }, errors: {} });
    expect(result.rows[1]).toMatchObject({ line: 3, errors: { name: 'required' } });
  });

  it('reports missing columns, but not those of items left blank', () => {
    const text = `${TRAP_TAG_CSV_HEADERS.address},${TRAP_TAG_CSV_HEADERS.name}\n東京都,山田太郎`;
    const missing = readTrapTagCsv(text, 'hunting');
    expect(missing).toMatchObject({ ok: false, reason: 'missingColumns' });
    expect(readTrapTagCsv(text, 'hunting', ['governor', 'fiscalYear', 'registrationNumber']).ok).toBe(true);
    expect(readTrapTagCsv(`${TRAP_TAG_CSV_HEADERS.address}\n`, 'hunting')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('the real-size PDF', () => {
  it('places each picture over a whole A4 page and indexes every object', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = buildImagePdf(
      [
        { jpeg, widthPx: 2480, heightPx: 3508 },
        { jpeg, widthPx: 2480, heightPx: 3508 },
      ],
      { width: 210, height: 297 },
      'Trap tags',
    );
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-1.7')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text).toContain('/MediaBox [0 0 595.2756 841.8898]');
    expect(text).toContain('/Filter /DCTDecode /Length 4');
    // Every offset in the cross-reference table points at the start of its object.
    const xrefAt = Number(/startxref\n(\d+)/.exec(text)![1]);
    const entries = text
      .slice(xrefAt)
      .split('\n')
      .slice(3, 3 + 9);
    entries.forEach((entry, index) => {
      expect(text.slice(Number(entry.slice(0, 10))).startsWith(`${index + 1} 0 obj`)).toBe(true);
    });
  });
});
