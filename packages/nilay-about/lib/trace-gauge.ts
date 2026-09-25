/**
 * Real-size gauges of footprints and droppings, from the dimensions public sources give, laid out on
 * A4 pages to print. Only sizes with a source are drawn; a species with none is listed as such.
 */

type Text = { ja: string; en: string };

export const TRACE_SOURCES_CHECKED_ON = '2026-09-24';

export const TRACE_SOURCES = {
  maffMeso: {
    label: '農林水産省 野生鳥獣被害防止マニュアル 中型獣類編（平成30年3月）pp.19–20',
    url: 'https://www.maff.go.jp/j/seisan/tyozyu/higai/manyuaru/manual_tyuugata_jyuurui/180330-1.pdf',
  },
  yamaguchi: {
    label: '山口県 ツキノワグマの痕跡の見分け方マニュアル ver.1.1（令和7年11月）p.2（144 頭の計測）',
    url: 'https://www.pref.yamaguchi.lg.jp/uploaded/attachment/226646.pdf',
  },
  toyota: {
    label: '豊田市 ツキノワグマ痕跡識別ガイド（令和4年2月）',
    url: 'https://www.city.toyota.aichi.jp/_res/projects/default_project/_page_/001/003/859/r0404/03.pdf',
  },
  hakusan37: {
    label: '石川県白山自然保護センター 白山の自然誌37「ニホンジカの生態」p.3',
    url: 'https://www.pref.ishikawa.lg.jp/hakusan/publish/sizen/documents/sizen37.pdf',
  },
  hakusan42: {
    label: '石川県白山自然保護センター 白山の自然誌42「動物たちのフィールドサイン」p.13',
    url: 'https://www.pref.ishikawa.lg.jp/hakusan/publish/sizen/documents/sizenshi42web.pdf',
  },
  tsukuba: {
    label: '筑波大学山岳科学センター菅平高原実験所「アニマルトラッキング」（大学の教材）',
    url: 'https://msc.tsukuba.ac.jp/wp/wp-content/uploads/2020/04/SRS_animal_tracking_28p.pdf',
  },
} as const;
export type TraceSourceId = keyof typeof TRACE_SOURCES;

export type GaugeKind = 'print' | 'scat';

export interface Gauge {
  id: string;
  species: Text;
  kind: GaugeKind;
  part: Text;
  /** Length along the direction of travel (prints) or of the dropping, in cm; null when not given. */
  lengthCm: number | null;
  /** Width of a print, or the diameter of a dropping, in cm; null when not given. */
  widthCm: number | null;
  /** How the source gives it. */
  quote: string;
  source: TraceSourceId;
}

export const GAUGES: readonly Gauge[] = [
  {
    id: 'bear-front',
    species: { ja: 'ツキノワグマ', en: 'Asian black bear' },
    kind: 'print',
    part: { ja: '前足（平均）', en: 'Fore foot (mean)' },
    lengthCm: 13.5,
    widthCm: 9.2,
    quote: '前足 長さ 13.5（9.0〜20.0）cm・幅 9.2（7.0〜13.0）cm',
    source: 'yamaguchi',
  },
  {
    id: 'bear-hind',
    species: { ja: 'ツキノワグマ', en: 'Asian black bear' },
    kind: 'print',
    part: { ja: '後足（平均）', en: 'Hind foot (mean)' },
    lengthCm: 15.1,
    widthCm: 8.5,
    quote: '後足 長さ 15.1（10.0〜20.0）cm・幅 8.5（6.0〜14.0）cm',
    source: 'yamaguchi',
  },
  {
    id: 'raccoon-front',
    species: { ja: 'アライグマ', en: 'Raccoon' },
    kind: 'print',
    part: { ja: '前足', en: 'Fore foot' },
    lengthCm: 5.5,
    widthCm: 6,
    quote: '前足 長さ5.5cm・幅6cm程度',
    source: 'maffMeso',
  },
  {
    id: 'raccoon-hind',
    species: { ja: 'アライグマ', en: 'Raccoon' },
    kind: 'print',
    part: { ja: '後足（範囲の上限）', en: 'Hind foot (upper end)' },
    lengthCm: 8,
    widthCm: 6.5,
    quote: '後足 長さ6.5〜8cm・幅5〜6.5cm程度',
    source: 'maffMeso',
  },
  {
    id: 'civet-front',
    species: { ja: 'ハクビシン', en: 'Masked palm civet' },
    kind: 'print',
    part: { ja: '前足', en: 'Fore foot' },
    lengthCm: 5,
    widthCm: 4.5,
    quote: '前足 長さ5cm・幅4.5cm程度',
    source: 'maffMeso',
  },
  {
    id: 'civet-hind',
    species: { ja: 'ハクビシン', en: 'Masked palm civet' },
    kind: 'print',
    part: { ja: '後足', en: 'Hind foot' },
    lengthCm: 10,
    widthCm: 4,
    quote: '後足 長さ10cm・幅4cm程度',
    source: 'maffMeso',
  },
  {
    id: 'raccoon-dog',
    species: { ja: 'タヌキ', en: 'Raccoon dog' },
    kind: 'print',
    part: { ja: '前後とも', en: 'Fore and hind' },
    lengthCm: 4,
    widthCm: 3,
    quote: '前後とも 長さ4cm・幅3cm程度',
    source: 'maffMeso',
  },
  {
    id: 'badger-front',
    species: { ja: 'アナグマ', en: 'Japanese badger' },
    kind: 'print',
    part: { ja: '前足', en: 'Fore foot' },
    lengthCm: 7.5,
    widthCm: 4,
    quote: '前足 長さ7.5cm・幅4cm程度',
    source: 'maffMeso',
  },
  {
    id: 'badger-hind',
    species: { ja: 'アナグマ', en: 'Japanese badger' },
    kind: 'print',
    part: { ja: '後足', en: 'Hind foot' },
    lengthCm: 9,
    widthCm: 4,
    quote: '後足 長さ9cm・幅4cm程度',
    source: 'maffMeso',
  },
  {
    id: 'fox',
    species: { ja: 'キツネ', en: 'Red fox' },
    kind: 'print',
    part: { ja: '足跡（長さのみ）', en: 'Print (length only)' },
    lengthCm: 5,
    widthCm: null,
    quote: '足痕 4〜5cm',
    source: 'tsukuba',
  },
  {
    id: 'hare-hind',
    species: { ja: 'ノウサギ', en: 'Japanese hare' },
    kind: 'print',
    part: { ja: '後足（長さのみ）', en: 'Hind foot (length only)' },
    lengthCm: 15,
    widthCm: null,
    quote: '後足痕 約15cm（前足痕 約5cm）',
    source: 'tsukuba',
  },
  {
    id: 'boar',
    species: { ja: 'イノシシ', en: 'Wild boar' },
    kind: 'print',
    part: { ja: '成獣のひづめ（長さのみ）', en: 'Adult hoof (length only)' },
    lengthCm: 5,
    widthCm: null,
    quote: '成獣で長さ5cm',
    source: 'tsukuba',
  },
  {
    id: 'bear-scat',
    species: { ja: 'ツキノワグマ', en: 'Asian black bear' },
    kind: 'scat',
    part: { ja: '糞の太さ（太いもの）', en: 'Dropping width (thick)' },
    lengthCm: null,
    widthCm: 5,
    quote: '太いものでは直径 5㎝ほどの大きな糞も見られます（豊田市は太さ約 3〜4cm）',
    source: 'hakusan42',
  },
  {
    id: 'raccoon-dog-scat',
    species: { ja: 'タヌキ', en: 'Raccoon dog' },
    kind: 'scat',
    part: { ja: '糞の太さ', en: 'Dropping width' },
    lengthCm: null,
    widthCm: 2,
    quote: 'タヌキの糞は直径(太さ)が1.5〜２cmほど',
    source: 'toyota',
  },
  {
    id: 'deer-scat',
    species: { ja: 'ニホンジカ', en: 'Sika deer' },
    kind: 'scat',
    part: { ja: '糞粒（俵型）', en: 'Pellet (barrel-shaped)' },
    lengthCm: 1.5,
    widthCm: 1,
    quote: '直径１cm、長さ 1.5 cm くらいの大きさ',
    source: 'hakusan37',
  },
  {
    id: 'hare-scat',
    species: { ja: 'ノウサギ', en: 'Japanese hare' },
    kind: 'scat',
    part: { ja: '糞粒', en: 'Pellet' },
    lengthCm: null,
    widthCm: 1,
    quote: '直径１㎝前後の押しつぶされた球形',
    source: 'tsukuba',
  },
  {
    id: 'boar-scat',
    species: { ja: 'イノシシ', en: 'Wild boar' },
    kind: 'scat',
    part: { ja: '糞の粒（範囲の上限）', en: 'Dropping lumps (upper end)' },
    lengthCm: null,
    widthCm: 3,
    quote: '径2〜3cmの丸い糞が塊',
    source: 'tsukuba',
  },
];

// ---------------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------------

export const PAGE_MM = { width: 210, height: 297 } as const;
const MARGIN_MM = 12;
const GAP_MM = 8;
/** Room under each gauge for its name. */
const LABEL_MM = 12;
/** The check line at the foot of every page. */
export const CHECK_LINE_MM = 100;
const FOOTER_MM = 18;
/** A gauge given by length alone is drawn as a bar this wide. */
const BAR_WIDTH_MM = 8;

export interface PlacedGauge {
  gauge: Gauge;
  /** Top left of the drawn shape, in mm on the page. */
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
}

/** The size a gauge is drawn at: a print is length (up the page) by width; a dropping is its width across. */
export function gaugeSizeMm(gauge: Gauge): { widthMm: number; heightMm: number } {
  const width = gauge.widthCm === null ? BAR_WIDTH_MM : gauge.widthCm * 10;
  const height = gauge.lengthCm === null ? width : gauge.lengthCm * 10;
  return { widthMm: width, heightMm: height };
}

/**
 * Lays the gauges out in rows, left to right, starting a new row when one is full and a new page
 * when the page is. Every gauge fits a page: the tallest is 151 mm.
 */
export function layoutGauges(gauges: readonly Gauge[]): PlacedGauge[][] {
  const pages: PlacedGauge[][] = [];
  let page: PlacedGauge[] = [];
  let x = MARGIN_MM;
  let y = MARGIN_MM;
  let rowHeight = 0;
  const bottom = PAGE_MM.height - MARGIN_MM - FOOTER_MM;
  for (const gauge of gauges) {
    const { widthMm, heightMm } = gaugeSizeMm(gauge);
    // A cell is at least wide enough for its name.
    const cellWidth = Math.max(widthMm, 34);
    if (x + cellWidth > PAGE_MM.width - MARGIN_MM) {
      x = MARGIN_MM;
      y += rowHeight + LABEL_MM + GAP_MM;
      rowHeight = 0;
    }
    if (y + heightMm + LABEL_MM > bottom && page.length > 0) {
      pages.push(page);
      page = [];
      x = MARGIN_MM;
      y = MARGIN_MM;
      rowHeight = 0;
    }
    page.push({ gauge, x: x + (cellWidth - widthMm) / 2, y, widthMm, heightMm });
    x += cellWidth + GAP_MM;
    rowHeight = Math.max(rowHeight, heightMm);
  }
  if (page.length > 0) pages.push(page);
  return pages;
}
