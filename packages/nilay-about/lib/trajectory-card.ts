/**
 * Layout of the printed ballistics card.
 *
 * The card is printed by the browser rather than through `lib/home-target-pdf.ts`, for the
 * reason set out at the top of `app/(standalone)/labs/trap-tag/trap-tag-print.module.css`:
 * that PDF writer carries Helvetica alone, and these cards are headed and footed in
 * Japanese. Everything here is therefore in millimetres on an SVG sheet, which the print
 * stylesheet pins to the paper at its real size.
 *
 * Nothing in this file knows either language. It is given the text already formatted and
 * answers two questions about it: where each piece goes on the sheet, and whether it fits.
 * A card that does not fit is reported rather than shrunk, because a card is read at arm's
 * length in bad light, and type that was quietly reduced to make room is a card that cannot
 * be read when it is wanted.
 */

import {
  TRAJECTORY_CARD_EXTRAS,
  trajectoryCardCopiesSchema,
  trajectoryCardSizeSchema,
  type TrajectoryCardCopies,
  type TrajectoryCardExtra,
  type TrajectoryCardSize,
} from './schemas/trajectory';

export { TRAJECTORY_CARD_EXTRAS, TRAJECTORY_CARD_NAME_MAX } from './schemas/trajectory';
export type {
  TrajectoryCardCopies,
  TrajectoryCardDrift,
  TrajectoryCardDrop,
  TrajectoryCardExtra,
  TrajectoryCardSetting,
  TrajectoryCardSize,
} from './schemas/trajectory';

/**
 * Real sizes of the card, in millimetres.
 *
 * `stock` is a strip to tape to a stock or a scope cover, `business` is the Japanese business
 * card the JIS-sized card cases and laminating pouches are made for, and `a7` is the ISO 216
 * A7 sheet, a quarter of A6. A larger card is not offered: past A7 it stops being something
 * that is carried and becomes the table that is already on the screen.
 */
export const TRAJECTORY_CARD_SIZES_MM: Record<TrajectoryCardSize, { widthMm: number; heightMm: number }> = {
  stock: { widthMm: 100, heightMm: 45 },
  business: { widthMm: 91, heightMm: 55 },
  a7: { widthMm: 105, heightMm: 74 },
};

export const TRAJECTORY_CARD_COPIES = [1, 2, 4, 6] as const;

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const RULER_LENGTH_MM = 50;

const PAGE_MARGIN_MM = 10;
const GUTTER_MM = 6;
/** Bottom band of the sheet: the 50 mm reference line and the printing notice. */
const FOOTER_MM = 20;

const CARD_PADDING_MM = 3;
/** Left and right of the text in a cell, so two columns of digits never run together. */
const CELL_PADDING_MM = 0.8;

/**
 * Type sizes on the card, in millimetres of em.
 *
 * A figure of 2.6 mm is roughly 7.4 pt, which is small but holds up in print and is the size
 * the published drop charts on a rifle stock are set in. The head and the conditions are
 * smaller because they are read once, at the desk, rather than looked up in the field.
 */
const TITLE_FONT_MM = 3.2;
const TITLE_LINE_MM = 4.4;
const HEAD_FONT_MM = 2.1;
const HEAD_ROW_MM = 3.6;
const VALUE_FONT_MM = 2.6;
const VALUE_ROW_MM = 4;
const CONDITION_FONT_MM = 1.9;
const CONDITION_LINE_MM = 2.5;

/** No column is narrower than this, so even a one-character heading keeps its own space. */
const MIN_COLUMN_WIDTH_MM = 7;

/**
 * Width of a character as a fraction of the type size.
 *
 * A full width character occupies one em by definition, which is what makes Japanese text
 * measurable without a font. Everything else - the digits the card is mostly made of, the
 * unit letters, the punctuation - is taken at 0.6 em. Proportional digits in the faces this
 * is printed with run between 0.5 and 0.56 em, so 0.6 leaves the estimate on the generous
 * side: the fit check errs towards saying a card is full before the printer disagrees.
 */
const FULL_WIDTH_EM = 1;
const HALF_WIDTH_EM = 0.6;

/**
 * Ranges that are full width in the fonts a browser prints Japanese with: kana and kanji,
 * their punctuation and brackets, Hangul, the full width forms of the ASCII range, and the
 * planes beyond the basic one, where the rarer kanji of a personal name are written.
 */
const FULL_WIDTH_PATTERN =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6\u{20000}-\u{3FFFF}]/u;

/** Width of a string at a type size, in millimetres. Code points, so a surrogate pair is one character. */
export function textWidthMm(text: string, fontMm: number): number {
  if (!Number.isFinite(fontMm) || fontMm <= 0) return 0;
  return Array.from(text).reduce(
    (width, character) => width + fontMm * (FULL_WIDTH_PATTERN.test(character) ? FULL_WIDTH_EM : HALF_WIDTH_EM),
    0,
  );
}

export function normalizeCardSize(value: unknown): TrajectoryCardSize {
  const parsed = trajectoryCardSizeSchema.safeParse(value);
  return parsed.success ? parsed.data : 'business';
}

export function normalizeCardCopies(value: unknown): TrajectoryCardCopies {
  const parsed = trajectoryCardCopiesSchema.safeParse(value);
  return parsed.success ? parsed.data : 1;
}

/** The chosen columns in the printed order, with anything repeated counted once. */
export function orderCardExtras(extras: readonly TrajectoryCardExtra[]): TrajectoryCardExtra[] {
  return TRAJECTORY_CARD_EXTRAS.filter((extra) => extras.includes(extra));
}

/**
 * What goes on one card, already written in the reader's language.
 *
 * `conditions` is what the figures were worked out from. It has no switch to turn it off:
 * a card of bare numbers is indistinguishable from a card for another load, another zero or
 * another day, and the one that is read is the one taped to the rifle.
 */
export interface TrajectoryCardContent {
  /** The rifle and the load, or an empty string when neither was named. */
  title: string;
  conditions: readonly string[];
  /** Column headings, the first of which is the distance. */
  headers: readonly string[];
  /** One row per distance, in the same order as the headings. */
  rows: readonly (readonly string[])[];
}

export type TrajectoryCardOverflow = 'none' | 'empty' | 'copies' | 'width' | 'height';

export interface TrajectoryCardLayout {
  size: TrajectoryCardSize;
  copies: TrajectoryCardCopies;
  /** Cards across and down the sheet at this size, and how many that comes to. */
  columnsPerSheet: number;
  rowsPerSheet: number;
  capacity: number;
  page: { widthMm: number; heightMm: number };
  card: { widthMm: number; heightMm: number };
  /** Top left corner of each card on the sheet. */
  positions: { x: number; y: number }[];
  paddingMm: number;
  cellPaddingMm: number;
  title: { fontMm: number; lineMm: number } | null;
  head: { fontMm: number; heightMm: number };
  body: { fontMm: number; rowHeightMm: number };
  condition: { fontMm: number; lineMm: number };
  /** Column widths as printed, spread to fill the card once the content is known to fit. */
  columnWidthsMm: number[];
  /** Distance from the card's left edge to each column, the first at the padding. */
  columnOffsetsMm: number[];
  /** Widths the text alone asks for, which is what the fit is judged on. */
  naturalWidthMm: number;
  /** Rows of distances there is room for under the heading. */
  maxRows: number;
  ruler: { x: number; y: number; lengthMm: number };
  fits: boolean;
  overflow: TrajectoryCardOverflow;
}

/**
 * Where the cards sit on an A4 sheet.
 *
 * The cards are set as one block in the middle of the sheet rather than spread to its
 * corners, so that a printer's unprintable margin takes the paper's edge and not a card's.
 */
function placeCards(
  count: number,
  card: { widthMm: number; heightMm: number },
): { positions: { x: number; y: number }[]; columnsPerSheet: number; rowsPerSheet: number } {
  const usableWidthMm = A4_WIDTH_MM - PAGE_MARGIN_MM * 2;
  const usableHeightMm = A4_HEIGHT_MM - PAGE_MARGIN_MM * 2 - FOOTER_MM;
  const columnsPerSheet = Math.max(Math.floor((usableWidthMm + GUTTER_MM) / (card.widthMm + GUTTER_MM)), 0);
  const rowsPerSheet = Math.max(Math.floor((usableHeightMm + GUTTER_MM) / (card.heightMm + GUTTER_MM)), 0);
  if (columnsPerSheet < 1 || rowsPerSheet < 1) return { positions: [], columnsPerSheet, rowsPerSheet };
  const columns = Math.min(columnsPerSheet, count);
  const rows = Math.min(Math.ceil(count / columns), rowsPerSheet);
  const blockWidthMm = columns * card.widthMm + (columns - 1) * GUTTER_MM;
  const blockHeightMm = rows * card.heightMm + (rows - 1) * GUTTER_MM;
  const startX = (A4_WIDTH_MM - blockWidthMm) / 2;
  const startY = PAGE_MARGIN_MM + (usableHeightMm - blockHeightMm) / 2;
  const positions = Array.from({ length: Math.min(count, columns * rows) }, (_, index) => ({
    x: startX + (index % columns) * (card.widthMm + GUTTER_MM),
    y: startY + Math.floor(index / columns) * (card.heightMm + GUTTER_MM),
  }));
  return { positions, columnsPerSheet, rowsPerSheet };
}

export function getTrajectoryCardLayout({
  content,
  size,
  copies,
}: {
  content: TrajectoryCardContent;
  size: unknown;
  copies: unknown;
}): TrajectoryCardLayout {
  const cardSize = normalizeCardSize(size);
  const count = normalizeCardCopies(copies);
  const card = TRAJECTORY_CARD_SIZES_MM[cardSize];
  const { positions, columnsPerSheet, rowsPerSheet } = placeCards(count, card);
  const capacity = columnsPerSheet * rowsPerSheet;

  const hasTitle = content.title.trim().length > 0;
  const title = hasTitle ? { fontMm: TITLE_FONT_MM, lineMm: TITLE_LINE_MM } : null;
  const conditionsHeightMm = content.conditions.length * CONDITION_LINE_MM;
  const innerWidthMm = card.widthMm - CARD_PADDING_MM * 2;
  const innerHeightMm = card.heightMm - CARD_PADDING_MM * 2;
  const tableHeightMm = innerHeightMm - (title?.lineMm ?? 0) - conditionsHeightMm - HEAD_ROW_MM;
  const maxRows = Math.max(Math.floor(tableHeightMm / VALUE_ROW_MM), 0);

  // Each column is as wide as the widest thing in it, heading included, and never narrower
  // than a column has to be to read as one.
  const naturalWidths = content.headers.map((header, column) =>
    Math.max(
      MIN_COLUMN_WIDTH_MM,
      content.rows.reduce(
        (widest, row) => Math.max(widest, textWidthMm(row[column] ?? '', VALUE_FONT_MM)),
        textWidthMm(header, HEAD_FONT_MM),
      ) +
        CELL_PADDING_MM * 2,
    ),
  );
  const naturalWidthMm = naturalWidths.reduce((total, width) => total + width, 0);

  const overflow: TrajectoryCardOverflow =
    content.rows.length === 0 || content.headers.length === 0
      ? 'empty'
      : count > capacity
        ? 'copies'
        : naturalWidthMm > innerWidthMm
          ? 'width'
          : content.rows.length > maxRows
            ? 'height'
            : 'none';

  // Only a card that fits is spread across its width: widening the columns of a card that
  // already overflows would hide by how much.
  const slackMm = overflow === 'none' ? (innerWidthMm - naturalWidthMm) / naturalWidths.length : 0;
  const columnWidthsMm = naturalWidths.map((width) => width + slackMm);
  const columnOffsetsMm = columnWidthsMm.reduce<number[]>(
    (offsets, width, index) => [...offsets, (offsets[index] ?? CARD_PADDING_MM) + width],
    [CARD_PADDING_MM],
  );

  return {
    size: cardSize,
    copies: count,
    columnsPerSheet,
    rowsPerSheet,
    capacity,
    page: { widthMm: A4_WIDTH_MM, heightMm: A4_HEIGHT_MM },
    card,
    positions,
    paddingMm: CARD_PADDING_MM,
    cellPaddingMm: CELL_PADDING_MM,
    title,
    head: { fontMm: HEAD_FONT_MM, heightMm: HEAD_ROW_MM },
    body: { fontMm: VALUE_FONT_MM, rowHeightMm: VALUE_ROW_MM },
    condition: { fontMm: CONDITION_FONT_MM, lineMm: CONDITION_LINE_MM },
    columnWidthsMm,
    // The last offset is the right edge of the table, which the drawing uses for its rules.
    columnOffsetsMm,
    naturalWidthMm,
    maxRows,
    ruler: {
      x: (A4_WIDTH_MM - RULER_LENGTH_MM) / 2,
      y: A4_HEIGHT_MM - PAGE_MARGIN_MM - 8,
      lengthMm: RULER_LENGTH_MM,
    },
    fits: overflow === 'none',
    overflow,
  };
}

export function formatMillimetres(value: number): number {
  return Math.round(value * 10) / 10;
}
