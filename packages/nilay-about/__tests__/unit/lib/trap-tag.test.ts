import { describe, expect, it } from 'vitest';

import {
  TRAP_TAG_MAX_FIELD_LENGTH,
  validateTrapTagFields,
  emptyTrapTagDraft,
  type TrapTagDraft,
} from '@/lib/schemas/trap-tag';
import {
  TRAP_TAG_CHAR_SIZES_MM,
  TRAP_TAG_MIN_CHAR_SIZE_MM,
  getTrapTagLayout,
  getTrapTagPrintValues,
  normalizeCharSizeMm,
  normalizeCopies,
  wrapTagLines,
} from '@/lib/trap-tag';

const draft = (values: Partial<TrapTagDraft>): TrapTagDraft => ({ ...emptyTrapTagDraft, ...values });

describe('trap tag character sizes', () => {
  it('never offers a character box below 10 mm', () => {
    expect(TRAP_TAG_MIN_CHAR_SIZE_MM).toBe(10);
    expect(TRAP_TAG_CHAR_SIZES_MM.every((size) => size >= TRAP_TAG_MIN_CHAR_SIZE_MM)).toBe(true);
    expect([...TRAP_TAG_CHAR_SIZES_MM]).toEqual([10, 12, 15]);
  });

  it('falls back to 10 mm for sizes that are not offered', () => {
    expect(normalizeCharSizeMm(12)).toBe(12);
    expect(normalizeCharSizeMm(15)).toBe(15);
    expect(normalizeCharSizeMm(9.9)).toBe(10);
    expect(normalizeCharSizeMm(8)).toBe(10);
    expect(normalizeCharSizeMm(0)).toBe(10);
    expect(normalizeCharSizeMm(Number.NaN)).toBe(10);
    expect(normalizeCharSizeMm('12')).toBe(10);
  });

  it('falls back to a single tag for unsupported sheet counts', () => {
    expect(normalizeCopies(6)).toBe(6);
    expect(normalizeCopies(3)).toBe(1);
    expect(normalizeCopies(Number.NaN)).toBe(1);
  });
});

describe('wrapping the items onto tag lines', () => {
  it('starts a new line per item and wraps by character', () => {
    expect(wrapTagLines(['東京都千代田区', '山田太郎'], 4)).toEqual(['東京都千', '代田区', '山田太郎']);
  });

  it('skips empty items and keeps surrogate pairs in one cell', () => {
    expect(wrapTagLines(['', '  ', '𠮷田'], 1)).toEqual(['𠮷', '田']);
  });

  it('produces no lines when a character cannot fit', () => {
    expect(wrapTagLines(['東京都'], 0)).toEqual([]);
    expect(wrapTagLines(['東京都'], Number.NaN)).toEqual([]);
  });
});

describe('tag and A4 sheet layout', () => {
  it('sizes one tag from the longest line and the character size', () => {
    const layout = getTrapTagLayout({ values: ['東京都', '山田太郎'], charSizeMm: 10, copies: 1 });
    expect(layout.maxCharsPerLine).toBe(18);
    expect(layout.lines).toEqual(['東京都', '山田太郎']);
    // 4 characters plus 4 mm padding on both sides, two 14 mm lines plus padding.
    expect(layout.tag).toEqual({ widthMm: 48, heightMm: 36 });
    expect(layout.fits).toBe(true);
    expect(layout.overflow).toBe('none');
    expect(layout.positions).toEqual([{ x: 81, y: 120.5 }]);
  });

  it('grows the tag with the character size', () => {
    const layout = getTrapTagLayout({ values: ['山田太郎'], charSizeMm: 15, copies: 1 });
    expect(layout.maxCharsPerLine).toBe(12);
    expect(layout.tag).toEqual({ widthMm: 68, heightMm: 29 });
  });

  it('places several tags on one sheet and narrows the lines', () => {
    const layout = getTrapTagLayout({ values: ['東京都千代田区霞が関1-2-2'], charSizeMm: 10, copies: 6 });
    expect({ columns: layout.columns, rows: layout.rows }).toEqual({ columns: 2, rows: 3 });
    expect(layout.positions).toHaveLength(6);
    expect(layout.maxCharsPerLine).toBe(8);
    expect(layout.lines).toEqual(['東京都千代田区霞', 'が関1-2-2']);
    expect(layout.fits).toBe(true);
  });

  it('reports an overflow instead of shrinking below the legal size', () => {
    const layout = getTrapTagLayout({ values: ['あ'.repeat(30), 'いいい'], charSizeMm: 15, copies: 6 });
    expect(layout.charSizeMm).toBe(15);
    expect(layout.lines).toHaveLength(7);
    expect(layout.tag.heightMm).toBeGreaterThan(layout.cell.heightMm);
    expect(layout.fits).toBe(false);
    expect(layout.overflow).toBe('height');
  });

  it('fits the same items once the sheet holds fewer tags', () => {
    const values = ['あ'.repeat(30), 'いいい'];
    expect(getTrapTagLayout({ values, charSizeMm: 15, copies: 1 }).fits).toBe(true);
  });

  it('has nothing to print without items', () => {
    const layout = getTrapTagLayout({ values: ['', '   '], charSizeMm: 10, copies: 1 });
    expect(layout.lines).toEqual([]);
    expect(layout.fits).toBe(false);
    expect(layout.overflow).toBe('empty');
  });

  it('keeps the A4 page and the 50 mm reference line inside the sheet', () => {
    const layout = getTrapTagLayout({ values: ['山田太郎'], charSizeMm: 10, copies: 4 });
    expect(layout.page).toEqual({ widthMm: 210, heightMm: 297 });
    expect(layout.ruler).toEqual({ x: 80, y: 279, lengthMm: 50 });
    expect(layout.positions.at(-1)!.y + layout.tag.heightMm).toBeLessThan(layout.ruler.y - 2);
  });
});

describe('printed items', () => {
  it('follows the statutory order of each purpose and trims the values', () => {
    const fields = draft({
      address: ' 東京都千代田区霞が関1-2-2 ',
      name: '山田太郎',
      governor: '東京都知事',
      fiscalYear: '令和7年度',
      registrationNumber: '第12345号',
      authority: '環境大臣',
      validPeriod: '令和7年4月1日〜令和8年3月31日',
      permitNumber: '第123号',
      species: 'ニホンジカ',
    });
    expect(getTrapTagPrintValues('hunting', fields)).toEqual([
      '東京都千代田区霞が関1-2-2',
      '山田太郎',
      '東京都知事',
      '令和7年度',
      '第12345号',
    ]);
    expect(getTrapTagPrintValues('permit', fields)).toEqual([
      '東京都千代田区霞が関1-2-2',
      '山田太郎',
      '環境大臣',
      '令和7年4月1日〜令和8年3月31日',
      '第123号',
      'ニホンジカ',
    ]);
  });
});

describe('validating the items', () => {
  const hunting = {
    address: '東京都千代田区霞が関1-2-2',
    name: '山田太郎',
    governor: '東京都知事',
    fiscalYear: '令和7年度',
    registrationNumber: '第12345号',
  };
  const permit = {
    address: '東京都千代田区霞が関1-2-2',
    name: '株式会社山田',
    authority: '環境大臣',
    validPeriod: '令和7年4月1日〜令和8年3月31日',
    permitNumber: '第123号',
    species: 'ニホンジカ',
  };

  it('accepts the items of each purpose and returns them trimmed', () => {
    const result = validateTrapTagFields('hunting', { ...hunting, address: ' 東京都千代田区霞が関1-2-2 ' });
    expect(result.valid).toBe(true);
    expect(result.values).toEqual(hunting);
    expect(validateTrapTagFields('permit', permit).valid).toBe(true);
  });

  it('requires only the items of the selected purpose', () => {
    expect(validateTrapTagFields('hunting', draft(hunting)).valid).toBe(true);
    const asPermit = validateTrapTagFields('permit', draft(hunting));
    expect(asPermit.valid).toBe(false);
    expect(asPermit.errors).toEqual({
      authority: 'required',
      validPeriod: 'required',
      permitNumber: 'required',
      species: 'required',
    });
  });

  it('treats whitespace-only input as missing', () => {
    const result = validateTrapTagFields('hunting', { ...hunting, address: '   ', name: '\t' });
    expect(result.valid).toBe(false);
    expect(result.values).toBeNull();
    expect(result.errors).toEqual({ address: 'required', name: 'required' });
  });

  it('rejects values that are far too long for a tag', () => {
    const result = validateTrapTagFields('hunting', {
      ...hunting,
      address: 'あ'.repeat(TRAP_TAG_MAX_FIELD_LENGTH + 1),
    });
    expect(result.errors).toEqual({ address: 'tooLong' });
    expect(
      validateTrapTagFields('hunting', { ...hunting, address: 'あ'.repeat(TRAP_TAG_MAX_FIELD_LENGTH) }).valid,
    ).toBe(true);
  });
});
