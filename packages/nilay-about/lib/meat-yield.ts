import type { MeatYieldCost, MeatYieldPart, MeatYieldSpecies, WeighedStage, YieldRatios } from './schemas/meat-yield';

export type {
  MeatYieldCost,
  MeatYieldPart,
  MeatYieldSettings,
  MeatYieldSpecies,
  WeighedStage,
  YieldRatios,
} from './schemas/meat-yield';

/** The three shares of the whole body weight the tool works with. */
export type YieldStage = keyof YieldRatios;

export type YieldSourceId = 'processing-manual' | 'general-manual';

export interface YieldSource {
  id: YieldSourceId;
  publisher: string;
  title: string;
  issued: string;
  url: string;
  /** Where in the document the figure is printed. */
  location: string;
  /** The words the figure is taken from, as printed. */
  quote: string;
}

/** The day the figures below were read against the published documents. */
export const SOURCES_CHECKED_ON = '2026-09-23';

export const YIELD_SOURCES: Record<YieldSourceId, YieldSource> = {
  'processing-manual': {
    id: 'processing-manual',
    publisher: '農林水産省',
    title: '【改訂版】野生鳥獣被害防止マニュアル（捕獲鳥獣の食肉等利活用（処理）の手法）',
    issued: '令和4年8月',
    url: 'https://www.maff.go.jp/j/nousin/gibier/attach/pdf/manual-45.pdf',
    location: '第2章 計画編「3 事業計画の立て方」10 ページ（ニホンジカの収支計算例の注2）',
    quote: '頭部、内臓、皮を除いた枝肉歩留の割合を 50％としています。',
  },
  'general-manual': {
    id: 'general-manual',
    publisher: '農林水産省',
    title: '野生鳥獣被害防止マニュアル【総合対策編】',
    issued: '令和5年3月',
    url: 'https://www.maff.go.jp/j/seisan/tyozyu/higai/manyuaru/attach/pdf/manual-49.pdf',
    location: '第6章 安全対策 77 ページ（第3章 48 ページにも同じ記述）',
    quote: '歩留まり（食肉可能な部位の割合）がイノシシでは30％程度、シカでは20％程度と低く',
  },
};

export interface ReferenceRatio {
  percent: number;
  source: YieldSourceId;
}

/**
 * Only the shares a public document prints. A gap is left empty for the reader to fill in: no
 * share of the weight with the viscera out was found for either species, nor a carcass share for
 * wild boar.
 */
export const REFERENCE_RATIOS: Record<MeatYieldSpecies, Record<YieldStage, ReferenceRatio | null>> = {
  deer: {
    dressed: null,
    // An assumption for planning a processing plant's accounts, not a measurement.
    carcass: { percent: 50, source: 'processing-manual' },
    meat: { percent: 20, source: 'general-manual' },
  },
  boar: {
    dressed: null,
    carcass: null,
    meat: { percent: 30, source: 'general-manual' },
  },
  other: { dressed: null, carcass: null, meat: null },
};

export function referenceRatios(species: MeatYieldSpecies): YieldRatios {
  const reference = REFERENCE_RATIOS[species];
  return {
    dressed: reference.dressed?.percent ?? null,
    carcass: reference.carcass?.percent ?? null,
    meat: reference.meat?.percent ?? null,
  };
}

/** A share has to leave something and cannot exceed the whole animal. */
export function isValidShare(percent: number | null): boolean {
  return percent !== null && Number.isFinite(percent) && percent > 0 && percent <= 100;
}

const STAGE_ORDER: readonly YieldStage[] = ['dressed', 'carcass', 'meat'];

/**
 * A later stage cannot weigh more than an earlier one: the carcass is what is left of the dressed
 * body, and the meat is cut from the carcass. Returns the first pair of given shares that breaks
 * this, earlier stage first.
 */
export function ratioOrderProblem(ratios: YieldRatios): [YieldStage, YieldStage] | null {
  const given = STAGE_ORDER.flatMap((stage) => {
    const percent = ratios[stage];
    return percent === null ? [] : [{ stage, percent }];
  });
  for (const [index, earlier] of given.entries()) {
    const later = given.slice(index + 1).find((entry) => entry.percent > earlier.percent);
    if (later) return [earlier.stage, later.stage];
  }
  return null;
}

export interface MeatYieldInput {
  stage: WeighedStage;
  weightKg: number;
  ratios: YieldRatios;
}

export interface MeatYieldResult {
  /** `null` when the share that leads back from the weighed stage has not been given. */
  wholeKg: number | null;
  dressedKg: number | null;
  carcassKg: number | null;
  meatKg: number | null;
}

export type MeatYieldOutcome =
  | ({ ok: true } & MeatYieldResult)
  | { ok: false; reason: 'weight' }
  | { ok: false; reason: 'ratio'; stage: YieldStage }
  | { ok: false; reason: 'order'; stages: [YieldStage, YieldStage] };

/**
 * Every stage is worked through the whole body weight: the weighed stage is divided by its share
 * to get back to the whole animal, and each other stage is that weight times its own share.
 */
export function calculateMeatYield({ stage, weightKg, ratios }: MeatYieldInput): MeatYieldOutcome {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return { ok: false, reason: 'weight' };
  const outOfRange = STAGE_ORDER.find((target) => ratios[target] !== null && !isValidShare(ratios[target]));
  if (outOfRange) return { ok: false, reason: 'ratio', stage: outOfRange };
  const order = ratioOrderProblem(ratios);
  if (order) return { ok: false, reason: 'order', stages: order };

  const weighedShare = stage === 'whole' ? 100 : ratios[stage];
  const wholeKg = weighedShare === null ? null : (weightKg * 100) / weighedShare;
  const at = (target: YieldStage) => {
    if (target === stage) return weightKg;
    const share = ratios[target];
    return wholeKg === null || share === null ? null : (wholeKg * share) / 100;
  };
  return { ok: true, wholeKg, dressedKg: at('dressed'), carcassKg: at('carcass'), meatKg: at('meat') };
}

/**
 * Shares worked out in floating point can land a hair either side of a whole number of packs. The
 * weight goes through at most six roundings (back to the whole animal, on to the stage, into grams and
 * into packs), each within half a unit in the last place, so eight units in the last place absorb them
 * and nothing more: meat over a 1,000 g pack by more than 2 pg takes another pack.
 */
const RELATIVE_TOLERANCE = 8 * Number.EPSILON;

export interface PackCount {
  packs: number;
  /** What goes into the last pack, which is a full pack when the meat divides evenly. */
  lastPackGrams: number;
}

export function packCount(meatKg: number, packGrams: number): PackCount | null {
  if (!(meatKg > 0) || !(packGrams > 0) || !Number.isFinite(meatKg) || !Number.isFinite(packGrams)) return null;
  const grams = meatKg * 1000;
  const packs = Math.ceil((grams / packGrams) * (1 - RELATIVE_TOLERANCE));
  return { packs, lastPackGrams: grams - (packs - 1) * packGrams };
}

export interface FreezerFit {
  /** How much of the freezer one animal's meat takes, in percent. Over 100 does not fit. */
  percent: number;
  /** How many animals of this size the freezer holds. */
  animals: number;
  /**
   * The percentage to print, as a whole number that agrees with `animals`: meat that does not fit
   * never reads 100 %, and meat that fits never reads more than 100 %.
   */
  shownPercent: number;
}

export function freezerFit(meatKg: number, freezerKg: number): FreezerFit | null {
  if (!(meatKg > 0) || !(freezerKg > 0) || !Number.isFinite(meatKg) || !Number.isFinite(freezerKg)) return null;
  const percent = (meatKg / freezerKg) * 100;
  const animals = Math.floor((freezerKg / meatKg) * (1 + RELATIVE_TOLERANCE));
  const rounded = Math.round(percent);
  return { percent, animals, shownPercent: animals === 0 ? Math.max(101, rounded) : Math.min(100, rounded) };
}

export interface PartLine {
  id: string;
  kg: number | null;
  sales: number | null;
}

export interface PartsBreakdown {
  lines: PartLine[];
  /** The shares entered, added up. */
  assignedPercent: number;
  /** Over 100 % of the usable meat cannot be cut from it. */
  overAssigned: boolean;
  /** Sales of the lines that have both a share and a price. */
  sales: number;
  /** Lines with a share but no price, left out of the sales. */
  unpriced: number;
}

const validPercent = (percent: number | null): percent is number =>
  percent !== null && Number.isFinite(percent) && percent >= 0 && percent <= 100;
const validYen = (yen: number | null): yen is number => yen !== null && Number.isFinite(yen) && yen >= 0;

/** Each cut's weight as its share of the usable meat, and what it sells for at its price per kilogram. */
export function partsBreakdown(meatKg: number | null, parts: readonly MeatYieldPart[]): PartsBreakdown {
  const lines = parts.map((part) => {
    const kg = meatKg !== null && validPercent(part.percent) ? (meatKg * part.percent) / 100 : null;
    return { id: part.id, kg, sales: kg !== null && validYen(part.pricePerKg) ? kg * part.pricePerKg : null };
  });
  const assignedPercent = parts.reduce((sum, part) => sum + (validPercent(part.percent) ? part.percent : 0), 0);
  return {
    lines,
    assignedPercent,
    overAssigned: assignedPercent > 100 * (1 + RELATIVE_TOLERANCE),
    sales: lines.reduce((sum, line) => sum + (line.sales ?? 0), 0),
    unpriced: lines.filter((line) => line.kg !== null && line.sales === null).length,
  };
}

export interface AnimalBalance {
  sales: number;
  subsidy: number;
  costs: number;
  net: number;
}

/** Sales and any subsidy, less the costs: what one animal brings in. */
export function animalBalance(
  sales: number,
  costs: readonly MeatYieldCost[],
  subsidyYen: number | null,
): AnimalBalance {
  const costTotal = costs.reduce((sum, cost) => sum + (validYen(cost.yen) ? cost.yen : 0), 0);
  const subsidy = validYen(subsidyYen) ? subsidyYen : 0;
  return { sales, subsidy, costs: costTotal, net: sales + subsidy - costTotal };
}
