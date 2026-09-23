import { TRAP_TAG_FIELDS, type TrapTagPurpose } from './schemas/trap-tag';

// 施行規則第 70 条第 2 項・第 7 条第 18 項: every character is at least 10 mm tall and wide.
export const TRAP_TAG_MIN_CHAR_SIZE_MM = 10;
export const TRAP_TAG_CHAR_SIZES_MM = [10, 12, 15] as const;
export type TrapTagCharSizeMm = (typeof TRAP_TAG_CHAR_SIZES_MM)[number];

export const TRAP_TAG_COPIES = [1, 2, 4, 6] as const;
export type TrapTagCopies = (typeof TRAP_TAG_COPIES)[number];

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const RULER_LENGTH_MM = 50;

const PAGE_MARGIN_MM = 10;
const GUTTER_MM = 6;
// Bottom band of the sheet: the 50 mm reference line and the printing notice.
const FOOTER_MM = 20;
const TAG_PADDING_MM = 4;
const LINE_HEIGHT_RATIO = 1.4;

const GRID: Record<TrapTagCopies, { columns: number; rows: number }> = {
  1: { columns: 1, rows: 1 },
  2: { columns: 1, rows: 2 },
  4: { columns: 2, rows: 2 },
  6: { columns: 2, rows: 3 },
};

export type TrapTagOverflow = 'none' | 'empty' | 'width' | 'height';

export interface TrapTagLayout {
  charSizeMm: TrapTagCharSizeMm;
  copies: TrapTagCopies;
  columns: number;
  rows: number;
  page: { widthMm: number; heightMm: number };
  cell: { widthMm: number; heightMm: number };
  maxCharsPerLine: number;
  lines: string[];
  lineHeightMm: number;
  paddingMm: number;
  tag: { widthMm: number; heightMm: number };
  positions: { x: number; y: number }[];
  ruler: { x: number; y: number; lengthMm: number };
  fits: boolean;
  overflow: TrapTagOverflow;
}

export function normalizeCharSizeMm(value: unknown): TrapTagCharSizeMm {
  return TRAP_TAG_CHAR_SIZES_MM.find((size) => size === value) ?? TRAP_TAG_MIN_CHAR_SIZE_MM;
}

export function normalizeCopies(value: unknown): TrapTagCopies {
  return TRAP_TAG_COPIES.find((copies) => copies === value) ?? 1;
}

/** Values are printed in the statutory order, one item per line. */
export function getTrapTagPrintValues(purpose: TrapTagPurpose, fields: Record<string, string>): string[] {
  return TRAP_TAG_FIELDS[purpose].map((key) => (fields[key] ?? '').trim());
}

/** Japanese text wraps by character, and code points keep surrogate pairs in one cell. */
export function wrapTagLines(values: readonly string[], maxCharsPerLine: number): string[] {
  if (!Number.isFinite(maxCharsPerLine) || maxCharsPerLine < 1) return [];
  const lines: string[] = [];
  for (const value of values) {
    const characters = Array.from(value.trim());
    for (let index = 0; index < characters.length; index += maxCharsPerLine) {
      lines.push(characters.slice(index, index + maxCharsPerLine).join(''));
    }
  }
  return lines;
}

export function countCharacters(value: string): number {
  return Array.from(value).length;
}

export function getTrapTagLayout({
  values,
  charSizeMm,
  copies,
}: {
  values: readonly string[];
  charSizeMm: unknown;
  copies: unknown;
}): TrapTagLayout {
  const charSize = normalizeCharSizeMm(charSizeMm);
  const count = normalizeCopies(copies);
  const { columns, rows } = GRID[count];
  const cellWidthMm = (A4_WIDTH_MM - PAGE_MARGIN_MM * 2 - GUTTER_MM * (columns - 1)) / columns;
  const cellHeightMm = (A4_HEIGHT_MM - PAGE_MARGIN_MM * 2 - FOOTER_MM - GUTTER_MM * (rows - 1)) / rows;
  const maxCharsPerLine = Math.floor((cellWidthMm - TAG_PADDING_MM * 2) / charSize);
  const lines = wrapTagLines(values, maxCharsPerLine);
  const lineHeightMm = charSize * LINE_HEIGHT_RATIO;
  const longestLine = lines.reduce((longest, line) => Math.max(longest, countCharacters(line)), 0);
  const tagWidthMm = longestLine * charSize + TAG_PADDING_MM * 2;
  const tagHeightMm = lines.length * lineHeightMm + TAG_PADDING_MM * 2;
  // 'width' needs a cell too narrow for a single character. The present grid and
  // sizes cannot reach it, because the narrowest cell is 92 mm and the largest
  // character 15 mm, but a denser grid or a larger size would.
  const overflow: TrapTagOverflow = !values.some((value) => value.trim())
    ? 'empty'
    : maxCharsPerLine < 1
      ? 'width'
      : tagHeightMm > cellHeightMm
        ? 'height'
        : 'none';
  const positions = Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: PAGE_MARGIN_MM + column * (cellWidthMm + GUTTER_MM) + (cellWidthMm - tagWidthMm) / 2,
      y: PAGE_MARGIN_MM + row * (cellHeightMm + GUTTER_MM) + (cellHeightMm - tagHeightMm) / 2,
    };
  });
  return {
    charSizeMm: charSize,
    copies: count,
    columns,
    rows,
    page: { widthMm: A4_WIDTH_MM, heightMm: A4_HEIGHT_MM },
    cell: { widthMm: cellWidthMm, heightMm: cellHeightMm },
    maxCharsPerLine: Math.max(maxCharsPerLine, 0),
    lines,
    lineHeightMm,
    paddingMm: TAG_PADDING_MM,
    tag: { widthMm: tagWidthMm, heightMm: tagHeightMm },
    positions,
    ruler: { x: (A4_WIDTH_MM - RULER_LENGTH_MM) / 2, y: A4_HEIGHT_MM - PAGE_MARGIN_MM - 8, lengthMm: RULER_LENGTH_MM },
    fits: overflow === 'none',
    overflow,
  };
}

export function formatMillimetres(value: number): number {
  return Math.round(value * 10) / 10;
}
