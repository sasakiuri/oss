import {
  captureSpeciesRows,
  captureYearlyRows,
  emergencyShootingRows,
  injuryMonthlyRows,
  injurySpeciesRows,
  injuryYearlyRows,
  sightingMonthlyRows,
} from './bear-stats-data';
import {
  FIRST_FISCAL_YEAR,
  LAST_FISCAL_YEAR,
  PREFECTURE_IDS,
  type BearArea,
  type BearDataset,
  type CaptureMetric,
  type InjuryMetric,
  type PrefectureId,
} from './schemas/bear-stats';

export {
  PREFECTURE_IDS,
  type BearArea,
  type BearDataset,
  type CaptureMetric,
  type InjuryMetric,
  type PrefectureId,
} from './schemas/bear-stats';

/** The day every figure below was read from the ministry's site. */
export const BEAR_STATS_CHECKED_ON = '2026-09-23';

const EFFORT12 = 'https://www.env.go.jp/nature/choju/effort/effort12';

/** Where each table comes from, with the date the ministry printed on it. */
export const BEAR_STATS_SOURCES = {
  page: {
    title: 'クマに関する各種情報・取組等（環境省）',
    url: `${EFFORT12}/effort12.html`,
    published: null,
  },
  injuries: {
    title: 'クマ類による人身被害について［速報値］',
    url: `${EFFORT12}/injury-qe.pdf`,
    published: '令和8年9月9日',
  },
  // One PDF per year. The bear page shows the latest ten years (平成29〜令和8年度) as links; the
  // 平成26〜28年度 files are still served at the same path but are not linked there, so they are listed here.
  injuriesMonthly: {
    title: '各年度におけるクマの人身被害件数［速報値］（平成29年度〜令和8年度の年度別資料、掲載ページ）',
    url: `${EFFORT12}/effort12.html`,
    published: null,
  },
  injuriesMonthly2016: {
    title: '平成28年度におけるクマの人身被害件数',
    url: `${EFFORT12}/h28injury-qe.pdf`,
    published: null,
  },
  injuriesMonthly2015: {
    title: '平成27年度におけるクマの人身被害件数',
    url: `${EFFORT12}/h27injury-qe.pdf`,
    published: null,
  },
  injuriesMonthly2014: {
    title: '平成26年度におけるクマの人身被害件数',
    url: `${EFFORT12}/h26injury-qe.pdf`,
    published: null,
  },
  sightings: {
    title: 'クマ類の出没情報について［速報値］（直近5カ年）',
    url: `${EFFORT12}/syutubotu.pdf`,
    published: '令和8年9月9日',
  },
  captures: {
    title: 'クマ類の捕獲数（許可捕獲数）について［速報値］',
    url: `${EFFORT12}/capture-qe.pdf`,
    published: '令和8年9月9日',
  },
  emergency2025: {
    title: '令和7年度の緊急銃猟実施状況',
    url: `${EFFORT12}/r07kinkyu-jishi.pdf`,
    published: '令和8年3月27日更新',
  },
  emergency2026: {
    title: '令和8年度の緊急銃猟実施状況',
    url: `${EFFORT12}/r08kinkyu-jishi.pdf`,
    published: '令和8年9月7日更新',
  },
  finalStatistics: {
    title: '鳥獣関係統計（環境省）',
    url: 'https://www.env.go.jp/nature/choju/docs/docs2.html',
    published: null,
  },
} as const;

export const PREFECTURES: Readonly<Record<PrefectureId, { ja: string; en: string }>> = {
  hokkaido: { ja: '北海道', en: 'Hokkaido' },
  aomori: { ja: '青森県', en: 'Aomori' },
  iwate: { ja: '岩手県', en: 'Iwate' },
  miyagi: { ja: '宮城県', en: 'Miyagi' },
  akita: { ja: '秋田県', en: 'Akita' },
  yamagata: { ja: '山形県', en: 'Yamagata' },
  fukushima: { ja: '福島県', en: 'Fukushima' },
  ibaraki: { ja: '茨城県', en: 'Ibaraki' },
  tochigi: { ja: '栃木県', en: 'Tochigi' },
  gunma: { ja: '群馬県', en: 'Gunma' },
  saitama: { ja: '埼玉県', en: 'Saitama' },
  chiba: { ja: '千葉県', en: 'Chiba' },
  tokyo: { ja: '東京都', en: 'Tokyo' },
  kanagawa: { ja: '神奈川県', en: 'Kanagawa' },
  niigata: { ja: '新潟県', en: 'Niigata' },
  toyama: { ja: '富山県', en: 'Toyama' },
  ishikawa: { ja: '石川県', en: 'Ishikawa' },
  fukui: { ja: '福井県', en: 'Fukui' },
  yamanashi: { ja: '山梨県', en: 'Yamanashi' },
  nagano: { ja: '長野県', en: 'Nagano' },
  gifu: { ja: '岐阜県', en: 'Gifu' },
  shizuoka: { ja: '静岡県', en: 'Shizuoka' },
  aichi: { ja: '愛知県', en: 'Aichi' },
  mie: { ja: '三重県', en: 'Mie' },
  shiga: { ja: '滋賀県', en: 'Shiga' },
  kyoto: { ja: '京都府', en: 'Kyoto' },
  osaka: { ja: '大阪府', en: 'Osaka' },
  hyogo: { ja: '兵庫県', en: 'Hyogo' },
  nara: { ja: '奈良県', en: 'Nara' },
  wakayama: { ja: '和歌山県', en: 'Wakayama' },
  tottori: { ja: '鳥取県', en: 'Tottori' },
  shimane: { ja: '島根県', en: 'Shimane' },
  okayama: { ja: '岡山県', en: 'Okayama' },
  hiroshima: { ja: '広島県', en: 'Hiroshima' },
  yamaguchi: { ja: '山口県', en: 'Yamaguchi' },
  tokushima: { ja: '徳島県', en: 'Tokushima' },
  kagawa: { ja: '香川県', en: 'Kagawa' },
  ehime: { ja: '愛媛県', en: 'Ehime' },
  kochi: { ja: '高知県', en: 'Kochi' },
};

/**
 * One figure in a table. Besides a count, a cell can be a figure the prefecture does not publish,
 * a month the ministry has not compiled yet, or a period before the count existed. Each is shown
 * differently: none of them is a zero.
 */
export type Cell = number | 'unpublished' | 'pending' | 'notApplicable';

export type BearMetric = InjuryMetric | CaptureMetric | 'count';

/** Fiscal months in the order the ministry's tables run them. */
export const FISCAL_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3] as const;

const range = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, index) => first + index);

export const DATASET_YEARS: Readonly<Record<BearDataset, readonly number[]>> = {
  injuries: range(FIRST_FISCAL_YEAR, LAST_FISCAL_YEAR),
  sightings: range(2022, LAST_FISCAL_YEAR),
  captures: range(FIRST_FISCAL_YEAR, LAST_FISCAL_YEAR),
  emergency: range(2025, LAST_FISCAL_YEAR),
};

/** Years with a month-by-month table. Captures are published by year only. */
export const MONTHLY_YEARS: Readonly<Record<BearDataset, readonly number[]>> = {
  injuries: range(2014, LAST_FISCAL_YEAR),
  sightings: range(2022, LAST_FISCAL_YEAR),
  captures: [],
  emergency: range(2025, LAST_FISCAL_YEAR),
};

/** The fiscal year still under way when the tables were read: its figures cover part of the year. */
export const CURRENT_FISCAL_YEAR = LAST_FISCAL_YEAR;

/** A year the dataset has, or the nearest one it does have. */
export function resolveYear(dataset: BearDataset, year: number): number {
  const years = DATASET_YEARS[dataset];
  if (years.includes(year)) return year;
  const first = years[0] ?? FIRST_FISCAL_YEAR;
  return year < first ? first : (years.at(-1) ?? LAST_FISCAL_YEAR);
}

// ---- Reading the tables -------------------------------------------------------------------------

type Triple = readonly [number, number, number];

// The tables are data written into this repository, so a malformed entry is a bug to stop on, not to guess at.
const parseTriple = (entry: string): Triple => {
  const match = /^(\d+)\/(\d+)\/(\d+)$/.exec(entry);
  if (!match) throw new Error(`Malformed bear statistics entry: ${entry}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const parseYearRow = (row: string): Map<number, Triple> =>
  new Map(row.split(' ').map((entry, index) => [FIRST_FISCAL_YEAR + index, parseTriple(entry)]));

const parseMonthRow = <T>(row: string, read: (entry: string) => T): (T | 'pending' | 'unpublished')[] =>
  row.split(' ').map((entry) => (entry === '.' ? 'pending' : entry === '-' ? 'unpublished' : read(entry)));

const byPrefecture = <T>(rows: Partial<Record<PrefectureId, string>>, read: (row: string) => T) =>
  new Map(
    (Object.entries(rows) as [PrefectureId, string][]).map(([prefecture, row]) => [prefecture, read(row)] as const),
  );

const injuryYearly = byPrefecture(injuryYearlyRows, parseYearRow);
const captureYearly = byPrefecture(captureYearlyRows as Partial<Record<PrefectureId, string>>, parseYearRow);
const injurySpecies = { black: parseYearRow(injurySpeciesRows.black), brown: parseYearRow(injurySpeciesRows.brown) };
const captureSpecies = { black: parseYearRow(captureSpeciesRows.black), brown: parseYearRow(captureSpeciesRows.brown) };

const injuryMonthly = new Map(
  Object.entries(injuryMonthlyRows).map(([year, rows]) => [
    Number(year),
    byPrefecture(rows, (row) => parseMonthRow(row, parseTriple)),
  ]),
);
const sightingMonthly = new Map(
  Object.entries(sightingMonthlyRows).map(([year, rows]) => [
    Number(year),
    byPrefecture(rows, (row) => parseMonthRow(row, Number)),
  ]),
);

export type BearSpecies = 'black' | 'brown' | 'boar';

export interface EmergencyShooting {
  year: number;
  month: number;
  day: number;
  prefecture: PrefectureId;
  /** As the ministry writes it, in Japanese. */
  municipality: string;
  species: BearSpecies;
}

export const EMERGENCY_SHOOTINGS: readonly EmergencyShooting[] = Object.entries(emergencyShootingRows).flatMap(
  ([year, rows]) =>
    rows.map((row) => {
      const match = /^(\d+)-(\d+) (\S+) (\S+) (black|brown|boar)$/.exec(row);
      if (!match) throw new Error(`Malformed emergency shooting entry: ${row}`);
      return {
        year: Number(year),
        month: Number(match[1]),
        day: Number(match[2]),
        prefecture: match[3] as PrefectureId,
        municipality: match[4] as string,
        species: match[5] as BearSpecies,
      };
    }),
);

/** The emergency-shooting lists begin in September 2025, when the first cases under the scheme appear. */
const EMERGENCY_FIRST = { year: 2025, month: 9 };
/** The last update of the current year's list was made on 7 September, so later months are still open. */
const EMERGENCY_THROUGH = { year: 2026, month: 9 };

const isBear = (species: BearSpecies) => species !== 'boar';

// ---- Figures ------------------------------------------------------------------------------------

const injuryIndex: Record<InjuryMetric, 0 | 1 | 2> = { cases: 0, victims: 1, deaths: 2 };
const captureIndex: Record<CaptureMetric, 0 | 1 | 2> = { total: 0, killed: 1, released: 2 };

const pick = (triple: Triple, dataset: BearDataset, metric: BearMetric) =>
  triple[dataset === 'captures' ? captureIndex[metric as CaptureMetric] : injuryIndex[metric as InjuryMetric]];

/**
 * Adds the counts and leaves out what is not a count. With no count at all, a month still to be
 * compiled anywhere is `pending` (a figure is coming), ahead of `unpublished` and `notApplicable`.
 */
export function sumCells(cells: readonly Cell[]): Cell {
  const counts = cells.filter((cell): cell is number => typeof cell === 'number');
  if (counts.length) return counts.reduce((total, value) => total + value, 0);
  if (cells.includes('pending')) return 'pending';
  if (cells.includes('unpublished')) return 'unpublished';
  return 'notApplicable';
}

const fiscalMonthIndex = (month: number) => FISCAL_MONTHS.indexOf(month as (typeof FISCAL_MONTHS)[number]);

function emergencyMonth(year: number, month: number, prefecture: PrefectureId | null): Cell {
  // Cases in fiscal year Y fall in calendar year Y from April and Y + 1 from January.
  const calendarYear = month >= 4 ? year : year + 1;
  const first = EMERGENCY_FIRST.year * 12 + EMERGENCY_FIRST.month;
  const through = EMERGENCY_THROUGH.year * 12 + EMERGENCY_THROUGH.month;
  const at = calendarYear * 12 + month;
  if (at < first) return 'notApplicable';
  if (at > through) return 'pending';
  return EMERGENCY_SHOOTINGS.filter(
    (entry) =>
      entry.year === year &&
      entry.month === month &&
      isBear(entry.species) &&
      (prefecture === null || entry.prefecture === prefecture),
  ).length;
}

/** One prefecture's figures by fiscal month, April to March, or null where there is no monthly table. */
function prefectureMonths(
  dataset: BearDataset,
  year: number,
  prefecture: PrefectureId,
  metric: BearMetric,
): Cell[] | null {
  if (!MONTHLY_YEARS[dataset].includes(year)) return null;
  if (dataset === 'injuries') {
    const months = injuryMonthly.get(year)?.get(prefecture);
    return months ? months.map((cell) => (typeof cell === 'string' ? cell : pick(cell, dataset, metric))) : null;
  }
  if (dataset === 'sightings') return sightingMonthly.get(year)?.get(prefecture) ?? null;
  if (dataset === 'emergency') return FISCAL_MONTHS.map((month) => emergencyMonth(year, month, prefecture));
  return null;
}

/** A prefecture's figure for a whole fiscal year. */
function prefectureYear(dataset: BearDataset, year: number, prefecture: PrefectureId, metric: BearMetric): Cell {
  if (!DATASET_YEARS[dataset].includes(year)) return 'notApplicable';
  if (dataset === 'injuries') {
    const triple = injuryYearly.get(prefecture)?.get(year);
    return triple ? pick(triple, dataset, metric) : 'unpublished';
  }
  if (dataset === 'captures') {
    // Kagawa, Ehime and Kochi are left out of the capture table: no recent sightings or captures.
    const triple = captureYearly.get(prefecture)?.get(year);
    return triple ? pick(triple, dataset, metric) : 'unpublished';
  }
  return sumCells(prefectureMonths(dataset, year, prefecture, metric) ?? []);
}

/** The figure for a year and an area. The national figure is the sum of the prefectures that publish one. */
export function yearValue(dataset: BearDataset, year: number, area: BearArea, metric: BearMetric): Cell {
  if (area !== 'national') return prefectureYear(dataset, year, area, metric);
  return sumCells(PREFECTURE_IDS.map((prefecture) => prefectureYear(dataset, year, prefecture, metric)));
}

export interface YearPoint {
  year: number;
  value: Cell;
  /** The year was still under way when the table was published. */
  partial: boolean;
}

export function yearlySeries(dataset: BearDataset, area: BearArea, metric: BearMetric): YearPoint[] {
  return DATASET_YEARS[dataset].map((year) => ({
    year,
    value: yearValue(dataset, year, area, metric),
    partial: year === CURRENT_FISCAL_YEAR,
  }));
}

export interface MonthPoint {
  month: number;
  value: Cell;
}

/** Figures by fiscal month, April to March, or null where the dataset has no monthly table for the year. */
export function monthlySeries(
  dataset: BearDataset,
  year: number,
  area: BearArea,
  metric: BearMetric,
): MonthPoint[] | null {
  if (!MONTHLY_YEARS[dataset].includes(year)) return null;
  const prefectures = area === 'national' ? PREFECTURE_IDS : [area];
  const rows = prefectures.map((prefecture) => prefectureMonths(dataset, year, prefecture, metric) ?? []);
  return FISCAL_MONTHS.map((month, index) => ({
    month,
    value:
      area === 'national' && dataset === 'emergency'
        ? emergencyMonth(year, month, null)
        : sumCells(rows.map((row) => row[index] ?? 'unpublished')),
  }));
}

export interface PrefecturePoint {
  prefecture: PrefectureId;
  value: Cell;
}

/** Every prefecture's figure for the year, in the ministry's order. */
export function prefectureValues(dataset: BearDataset, year: number, metric: BearMetric): PrefecturePoint[] {
  return PREFECTURE_IDS.map((prefecture) => ({ prefecture, value: prefectureYear(dataset, year, prefecture, metric) }));
}

/** Prefectures with a count above zero, largest first; ties keep the ministry's order. */
export function rankPrefectures(points: readonly PrefecturePoint[]): { prefecture: PrefectureId; value: number }[] {
  return points
    .filter((point): point is { prefecture: PrefectureId; value: number } => typeof point.value === 'number')
    .filter((point) => point.value > 0)
    .map((point, order) => ({ ...point, order }))
    .sort((a, b) => b.value - a.value || a.order - b.order)
    .map(({ prefecture, value }) => ({ prefecture, value }));
}

/** The national figure split between Asian black bears and brown bears, where the ministry prints it. */
export function nationalBySpecies(
  dataset: BearDataset,
  year: number,
  metric: BearMetric,
): { black: number; brown: number } | null {
  if (dataset === 'injuries' || dataset === 'captures') {
    const table = dataset === 'injuries' ? injurySpecies : captureSpecies;
    const black = table.black.get(year);
    const brown = table.brown.get(year);
    return black && brown ? { black: pick(black, dataset, metric), brown: pick(brown, dataset, metric) } : null;
  }
  if (dataset === 'emergency') {
    const cases = EMERGENCY_SHOOTINGS.filter((entry) => entry.year === year);
    return {
      black: cases.filter((entry) => entry.species === 'black').length,
      brown: cases.filter((entry) => entry.species === 'brown').length,
    };
  }
  return null;
}

/** Emergency shootings of wild boar in the same lists. They are not counted as bear cases. */
export function emergencyBoarCount(year: number, area: BearArea): number {
  return EMERGENCY_SHOOTINGS.filter(
    (entry) => entry.year === year && entry.species === 'boar' && (area === 'national' || entry.prefecture === area),
  ).length;
}

/** The last fiscal month with a compiled figure, for a year still under way; null for a finished year. */
export function compiledThroughMonth(dataset: BearDataset, year: number): number | null {
  if (year !== CURRENT_FISCAL_YEAR) return null;
  if (dataset === 'captures') return 7; // The table is headed 「R08年7月末暫定値」.
  const months = monthlySeries(dataset, year, 'national', dataset === 'injuries' ? 'cases' : 'count');
  const compiled = months?.filter((point) => point.value !== 'pending') ?? [];
  return compiled.at(-1)?.month ?? null;
}

export interface SamePeriod {
  months: number[];
  current: Cell;
  previous: Cell;
}

/**
 * For a year still under way, the same months of the year before, so that a part year is not set
 * against a whole one. Null where there is no monthly table for both years.
 */
export function samePeriodLastYear(
  dataset: BearDataset,
  year: number,
  area: BearArea,
  metric: BearMetric,
): SamePeriod | null {
  const through = compiledThroughMonth(dataset, year);
  if (through === null) return null;
  const current = monthlySeries(dataset, year, area, metric);
  const previous = monthlySeries(dataset, year - 1, area, metric);
  if (!current || !previous) return null;
  const count = fiscalMonthIndex(through) + 1;
  const previousCells = previous.slice(0, count).map((point) => point.value);
  // A comparison with months before the count existed would set a real figure against nothing.
  if (previousCells.includes('notApplicable')) return null;
  return {
    months: FISCAL_MONTHS.slice(0, count),
    current: sumCells(current.slice(0, count).map((point) => point.value)),
    previous: sumCells(previousCells),
  };
}

// ---- Labels -------------------------------------------------------------------------------------

/** 平成 ran to fiscal 2018 (平成30年度); fiscal 2019 is 令和元年度. */
export function fiscalYearLabel(year: number, language: 'ja' | 'en'): string {
  if (language === 'en') return `FY${year}`;
  if (year >= 2019) return year === 2019 ? '令和元年度' : `令和${year - 2018}年度`;
  return `平成${year - 1988}年度`;
}

/** A label short enough for a chart axis. */
export function fiscalYearShortLabel(year: number, language: 'ja' | 'en'): string {
  if (language === 'en') return String(year);
  return year >= 2019 ? `R${year - 2018}` : `H${year - 1988}`;
}

export function monthLabel(month: number, language: 'ja' | 'en'): string {
  if (language === 'ja') return `${month}月`;
  return new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(Date.UTC(2000, month - 1, 1));
}

export function prefectureName(prefecture: PrefectureId, language: 'ja' | 'en'): string {
  return PREFECTURES[prefecture][language];
}
