import { describe, expect, it } from 'vitest';

import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  RULER_LENGTH_MM,
  TRAJECTORY_CARD_COPIES,
  TRAJECTORY_CARD_SIZES_MM,
  formatMillimetres,
  getTrajectoryCardLayout,
  normalizeCardCopies,
  normalizeCardSize,
  orderCardExtras,
  textWidthMm,
  type TrajectoryCardContent,
} from '@/lib/trajectory-card';

const content = (overrides: Partial<TrajectoryCardContent> = {}): TrajectoryCardContent => ({
  title: 'Tikka T3x / 168 gr',
  conditions: ['初速 800 m/s・BC 0.45 G1・ゼロイン 100 m', '15 °C・1013 hPa・風 4 m/s 9 時'],
  headers: ['距離 m', '落差 cm', '風偏 cm'],
  rows: Array.from({ length: 6 }, (_, index) => [String((index + 1) * 50), '-12.3', '4.5']),
  ...overrides,
});

describe('measuring text for a card', () => {
  it('counts a full width character as a whole em and the rest as 0.6', () => {
    expect(textWidthMm('落差', 2.6)).toBeCloseTo(5.2, 10);
    expect(textWidthMm('123', 2.6)).toBeCloseTo(4.68, 10);
    // A surrogate pair is one character, not two.
    expect(textWidthMm('𠮷', 2.6)).toBeCloseTo(2.6, 10);
  });

  it('measures nothing at a type size that is not a size', () => {
    expect(textWidthMm('落差', 0)).toBe(0);
    expect(textWidthMm('落差', Number.NaN)).toBe(0);
  });
});

describe('the columns a card carries', () => {
  it('prints the extra columns in one order, whichever order they were picked in', () => {
    expect(orderCardExtras(['energy', 'time'])).toEqual(['time', 'energy']);
    expect(orderCardExtras(['speed', 'speed'])).toEqual(['speed']);
    expect(orderCardExtras([])).toEqual([]);
  });
});

describe('falling back to an offered card', () => {
  it('keeps a size and a count that are offered, and replaces ones that are not', () => {
    expect(normalizeCardSize('a7')).toBe('a7');
    expect(normalizeCardSize('poster')).toBe('business');
    expect(normalizeCardSize(undefined)).toBe('business');
    expect(normalizeCardCopies(6)).toBe(6);
    expect(normalizeCardCopies(3)).toBe(1);
    expect(normalizeCardCopies(Number.NaN)).toBe(1);
  });
});

describe('laying the cards out on an A4 sheet', () => {
  it('fits an ordinary card of six distances and spreads its columns to the card width', () => {
    const layout = getTrajectoryCardLayout({ content: content(), size: 'business', copies: 2 });
    expect(layout.overflow).toBe('none');
    expect(layout.fits).toBe(true);
    expect(layout.positions).toHaveLength(2);
    expect(layout.card).toEqual(TRAJECTORY_CARD_SIZES_MM.business);
    // The columns are widened to meet the card's edge, so the printed table has no ragged right.
    const printedWidth = layout.columnWidthsMm.reduce((total, width) => total + width, 0);
    expect(printedWidth).toBeCloseTo(layout.card.widthMm - layout.paddingMm * 2, 10);
    expect(layout.naturalWidthMm).toBeLessThan(printedWidth);
    // The offsets run from the padding to the right edge, one more than there are columns.
    expect(layout.columnOffsetsMm).toHaveLength(layout.columnWidthsMm.length + 1);
    expect(layout.columnOffsetsMm[0]).toBe(layout.paddingMm);
    expect(layout.columnOffsetsMm[layout.columnOffsetsMm.length - 1]).toBeCloseTo(
      layout.card.widthMm - layout.paddingMm,
      10,
    );
  });

  it('keeps every card inside the sheet, above the reference line', () => {
    const layout = getTrajectoryCardLayout({ content: content(), size: 'business', copies: 6 });
    expect(layout.page).toEqual({ widthMm: A4_WIDTH_MM, heightMm: A4_HEIGHT_MM });
    expect(layout.ruler.lengthMm).toBe(RULER_LENGTH_MM);
    for (const position of layout.positions) {
      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeGreaterThanOrEqual(0);
      expect(position.x + layout.card.widthMm).toBeLessThanOrEqual(A4_WIDTH_MM);
      // Nothing may reach the reference line, or the line stops proving the scale.
      expect(position.y + layout.card.heightMm).toBeLessThanOrEqual(layout.ruler.y - 2);
    }
  });

  it('says how many of this size a sheet holds rather than printing them on top of each other', () => {
    // A7 is wider than half the usable width, so a sheet takes one column of three.
    const layout = getTrajectoryCardLayout({ content: content(), size: 'a7', copies: 6 });
    expect(layout.columnsPerSheet).toBe(1);
    expect(layout.capacity).toBe(3);
    expect(layout.overflow).toBe('copies');
    expect(layout.fits).toBe(false);
    const fitting = getTrajectoryCardLayout({ content: content(), size: 'a7', copies: 2 });
    expect(fitting.overflow).toBe('none');
  });

  it('refuses more rows than the card has room for, and says how many that is', () => {
    const tall = content({ rows: Array.from({ length: 30 }, (_, index) => [String(index), '-1', '1']) });
    const layout = getTrajectoryCardLayout({ content: tall, size: 'stock', copies: 1 });
    expect(layout.overflow).toBe('height');
    expect(layout.maxRows).toBeGreaterThan(0);
    expect(layout.maxRows).toBeLessThan(tall.rows.length);
    // The same rows on the largest card are what it is for.
    const room = getTrajectoryCardLayout({
      content: content({ rows: tall.rows.slice(0, 10) }),
      size: 'a7',
      copies: 1,
    });
    expect(room.overflow).toBe('none');
  });

  it('gives the conditions and the title their space before the rows get any', () => {
    const rows = Array.from({ length: 10 }, (_, index) => [String(index), '-1', '1']);
    const withTitle = getTrajectoryCardLayout({ content: content({ rows }), size: 'business', copies: 1 });
    const withoutTitle = getTrajectoryCardLayout({
      content: content({ rows, title: '' }),
      size: 'business',
      copies: 1,
    });
    // Nothing is printed over the conditions: a card without a heading simply holds one row more.
    expect(withoutTitle.title).toBeNull();
    expect(withoutTitle.maxRows).toBeGreaterThan(withTitle.maxRows);
    // The conditions are never the part that gives way; the rows are.
    const longConditions = getTrajectoryCardLayout({
      content: content({ rows, conditions: ['初速 800 m/s', '15 °C', '風 4 m/s', '2026-09-22'] }),
      size: 'business',
      copies: 1,
    });
    expect(longConditions.maxRows).toBeLessThan(withTitle.maxRows);
  });

  it('fits every column the tool can put on the narrowest card', () => {
    // Six columns of the widest figures this tool produces, on the narrowest card it offers.
    const wide = content({
      headers: ['距離 m', '落差 cm', '風偏 cm', '時間 s', '速度 m/s', 'エネルギー J'],
      rows: [['1000', '-123.4', '-123.4', '1.234', '1234', '12345']],
    });
    expect(getTrajectoryCardLayout({ content: wide, size: 'stock', copies: 1 }).overflow).toBe('none');
  });

  it('refuses a card too narrow for its columns instead of squeezing them', () => {
    // No column the tool builds is this wide, so this is the guard itself being exercised
    // rather than a card a reader can arrive at through the form.
    const wide = content({
      headers: ['距離 m', '落差 cm'],
      rows: [['1000', '一二三四五六七八九十'.repeat(5)]],
    });
    const layout = getTrajectoryCardLayout({ content: wide, size: 'stock', copies: 1 });
    expect(layout.overflow).toBe('width');
    // A card that overflows keeps its natural widths, so the preview shows how far over it is.
    expect(layout.naturalWidthMm).toBeGreaterThan(layout.card.widthMm - layout.paddingMm * 2);
    expect(layout.columnWidthsMm.reduce((total, width) => total + width, 0)).toBeCloseTo(layout.naturalWidthMm, 10);
  });

  it('has nothing to print without rows', () => {
    const layout = getTrajectoryCardLayout({ content: content({ rows: [] }), size: 'business', copies: 1 });
    expect(layout.overflow).toBe('empty');
    expect(layout.fits).toBe(false);
  });

  it('offers only counts that at least one card size can hold', () => {
    for (const copies of TRAJECTORY_CARD_COPIES) {
      const layout = getTrajectoryCardLayout({ content: content(), size: 'business', copies });
      expect(layout.overflow).toBe('none');
      expect(layout.positions).toHaveLength(copies);
    }
  });
});

describe('reading a millimetre back', () => {
  it('keeps one decimal, which is finer than a printer places an edge', () => {
    expect(formatMillimetres(90.96)).toBe(91);
    expect(formatMillimetres(54.55)).toBe(54.6);
  });
});
