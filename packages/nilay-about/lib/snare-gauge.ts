import {
  SNARE_PREFECTURE_RULES,
  type SnareGameSpecies,
  type SnareDateRange,
  type SnarePrefectureRule,
  type SnareRelaxationCase,
} from './snare-gauge-data';

/**
 * Enforcement Regulation art. 10(3)(ix) and (x): a snare whose loop is over 12 cm across may not be
 * used for hunting. For wild boar and sika deer the wire must also be 4 mm or thicker, and the
 * snare must carry a swivel; for every mammal it must carry a tightening stopper.
 */
export const STATUTORY_LOOP_LIMIT_MM = 120 as const;
export const STATUTORY_WIRE_MIN_MM = 4;

/** The limits a printed gauge is offered at: the statute, and the relaxed limits prefectures publish. */
export const SNARE_GAUGE_SIZES_MM = [120, 150, 200] as const;
export type SnareGaugeSizeMm = (typeof SNARE_GAUGE_SIZES_MM)[number];

/** Boar and deer fall under item (ix); every other mammal that may be hunted with a snare under (x). */
export type SnareTargetSpecies = SnareGameSpecies | 'other';

export function findSnarePrefecture(code: string): SnarePrefectureRule | undefined {
  return SNARE_PREFECTURE_RULES.find((rule) => rule.code === code);
}

/** `national` shows the statute alone, before a prefecture is chosen. */
export function isSnarePrefectureCode(code: string): boolean {
  return code === 'national' || findSnarePrefecture(code) !== undefined;
}

export function isSnareGaugeSize(value: number): value is SnareGaugeSizeMm {
  return (SNARE_GAUGE_SIZES_MM as readonly number[]).includes(value);
}

/**
 * How a published relaxation stands on a given day. The tool never decides whether a place is in
 * an area or a condition is met, so even a relaxation in force is only one that may apply.
 *
 * - `conditional`: in force; it applies where its area and conditions are met.
 * - `inPeriod` / `outOfPeriod`: the prefecture fixes the period by date, and the day is inside or outside it.
 * - `periodUndetermined`: the period is set anew each year, so the day cannot decide it.
 * - `disputed`: the prefecture's own documents disagree, so it is not applied.
 * - `expired`: the plan it rests on has ended.
 */
export type SnareCaseState = 'conditional' | 'inPeriod' | 'outOfPeriod' | 'periodUndetermined' | 'disputed' | 'expired';

export interface EvaluatedSnareCase {
  relaxation: SnareRelaxationCase;
  state: SnareCaseState;
}

/** The states in which a relaxation may apply today, if its area and conditions are met. */
export function isPossiblyApplicable(state: SnareCaseState): boolean {
  return state === 'conditional' || state === 'inPeriod' || state === 'periodUndetermined';
}

export interface SnareRequirements {
  /**
   * The limit the answer leads with. Always the statute: whether a relaxation applies turns on an
   * area, a period or a condition this tool does not decide.
   */
  statutoryLimitMm: number;
  /** Relaxations the prefecture publishes for this species, in its order, each with its state. Empty for other mammals. */
  cases: readonly EvaluatedSnareCase[];
  /** The limits of the relaxations that may apply today, in the prefecture's order, without repeats. */
  possibleLimits: readonly (number | null)[];
  /** A tightening stopper is required for every mammal; one prefecture accepts a stopping function instead. */
  stopperRequired: true;
  swivelRequired: boolean;
  /** Null when the statute sets no wire thickness for the species. */
  wireMinMm: number | null;
  prefecture: SnarePrefectureRule | undefined;
  /** The prefecture's standing for this species; undefined for the national rule alone. */
  status: SnarePrefectureRule['status'] | undefined;
  /** True when the plan the relaxation rests on has ended before `today`. */
  expired: boolean;
  /** The gauge sizes on offer: the statute, and the limits of relaxations that may apply today. */
  gaugeSizesMm: readonly SnareGaugeSizeMm[];
  /** True when a relaxation that may apply today lifts the loop limit, so that no gauge is needed there. */
  hasNoLimitCase: boolean;
}

/**
 * Today's date in Japan, as an ISO date. The periods and plan ends are Japanese calendar days, so a
 * browser in another time zone must not move them by a day.
 */
export function todayInJapan(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function assertIsoDate(value: string): string {
  // The data holds ISO dates only, so anything else is a fault in the data rather than a date to guess at.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Not an ISO date: ${value}`);
  return value;
}

/** Whether `today` is after `lastDay`. Both are ISO dates, which compare as strings. */
export function isPastDate(lastDay: string, today: string): boolean {
  return assertIsoDate(today) > assertIsoDate(lastDay);
}

/** Whether `today` falls in one of the ranges, both ends included. */
export function isWithinRanges(ranges: readonly SnareDateRange[], today: string): boolean {
  assertIsoDate(today);
  return ranges.some(({ from, to }) => today >= assertIsoDate(from) && today <= assertIsoDate(to));
}

function caseState(relaxation: SnareRelaxationCase, planEnded: boolean, today: string): SnareCaseState {
  if (planEnded) return 'expired';
  if (relaxation.disputed) return 'disputed';
  if (relaxation.periodUndetermined) return 'periodUndetermined';
  if (relaxation.periodRanges) return isWithinRanges(relaxation.periodRanges, today) ? 'inPeriod' : 'outOfPeriod';
  return 'conditional';
}

/**
 * Where the prefecture stands for one species: `none` only where its sources say so for that
 * species. Other mammals are never relaxed, so they follow the prefecture's overall status.
 */
export function prefectureStatusFor(
  rule: SnarePrefectureRule,
  species: SnareTargetSpecies,
  today: string,
): SnarePrefectureRule['status'] {
  if (rule.status !== 'none') return rule.status;
  // Once the document behind 'none' has run out, it no longer speaks for the present.
  if (rule.validUntil && isPastDate(rule.validUntil, today)) return 'unconfirmed';
  if (species === 'other' || !rule.confirmedNoneFor) return rule.status;
  return rule.confirmedNoneFor.includes(species) ? 'none' : 'unconfirmed';
}

/** `today` is an ISO date in Japan; see `todayInJapan`. */
export function getSnareRequirements(
  prefectureCode: string,
  species: SnareTargetSpecies,
  today: string,
): SnareRequirements {
  const prefecture = prefectureCode === 'national' ? undefined : findSnarePrefecture(prefectureCode);
  const game = species !== 'other';
  const planEnded = prefecture?.validUntil ? isPastDate(prefecture.validUntil, today) : false;
  // Relaxations are made only for the designated species of a prefecture's plan: boar and deer.
  const cases: EvaluatedSnareCase[] =
    game && prefecture?.status === 'relaxed'
      ? prefecture.cases
          .filter((relaxation) => relaxation.species.includes(species))
          .map((relaxation) => ({ relaxation, state: caseState(relaxation, planEnded, today) }))
      : [];
  const possibleLimits = [
    ...new Set(cases.filter(({ state }) => isPossiblyApplicable(state)).map(({ relaxation }) => relaxation.limitMm)),
  ];
  return {
    statutoryLimitMm: STATUTORY_LOOP_LIMIT_MM,
    cases,
    possibleLimits,
    stopperRequired: true,
    swivelRequired: game,
    wireMinMm: game ? STATUTORY_WIRE_MIN_MM : null,
    prefecture,
    status: prefecture ? prefectureStatusFor(prefecture, species, today) : undefined,
    expired: cases.length > 0 && planEnded,
    gaugeSizesMm: SNARE_GAUGE_SIZES_MM.filter(
      (size) => size === STATUTORY_LOOP_LIMIT_MM || possibleLimits.includes(size),
    ),
    hasNoLimitCase: possibleLimits.includes(null),
  };
}

/**
 * The gauge size to offer first: the statute's. A relaxed size is one click away, but printing it
 * unasked would assume the reader is inside an area and a period the tool has not checked.
 */
export function defaultSnareGaugeSize(): SnareGaugeSizeMm {
  return STATUTORY_LOOP_LIMIT_MM;
}

/** Keeps the chosen size while it is still on offer for the choice, and falls back to the statute's otherwise. */
export function keepSnareGaugeSize(current: SnareGaugeSizeMm, requirements: SnareRequirements): SnareGaugeSizeMm {
  return requirements.gaugeSizesMm.includes(current) ? current : defaultSnareGaugeSize();
}

export interface SnareGaugeLayout {
  page: { widthMm: number; heightMm: number };
  limitMm: number;
  /** The reference circle, whose stroke centre is the limit across. */
  circle: { cx: number; cy: number; r: number };
  /** The no-go strip, exactly the limit long. */
  strip: { x: number; y: number; lengthMm: number; heightMm: number };
  /** The 4 mm reference slit for the wire. */
  slit: { x: number; y: number; widthMm: number; heightMm: number };
  /** The 100 mm line for checking the print scale. */
  ruler: { x: number; y: number; lengthMm: number };
}

export const SNARE_GAUGE_PAGE = { widthMm: 210, heightMm: 297 } as const;
const TOP_MM = 22;
const GAP_MM = 12;
const STRIP_HEIGHT_MM = 10;
const SLIT_HEIGHT_MM = 30;
const RULER_LENGTH_MM = 100;

/** Every figure in millimetres on A4, so a print at 100% keeps the limit at its real size. */
export function getSnareGaugeLayout(limitMm: SnareGaugeSizeMm): SnareGaugeLayout {
  const { widthMm } = SNARE_GAUGE_PAGE;
  const circle = { cx: widthMm / 2, cy: TOP_MM + limitMm / 2, r: limitMm / 2 };
  const stripY = TOP_MM + limitMm + GAP_MM;
  const strip = { x: (widthMm - limitMm) / 2, y: stripY, lengthMm: limitMm, heightMm: STRIP_HEIGHT_MM };
  const rowY = stripY + STRIP_HEIGHT_MM + GAP_MM;
  return {
    page: SNARE_GAUGE_PAGE,
    limitMm,
    circle,
    strip,
    slit: { x: 160, y: rowY, widthMm: STATUTORY_WIRE_MIN_MM, heightMm: SLIT_HEIGHT_MM },
    ruler: { x: 20, y: rowY + SLIT_HEIGHT_MM / 2, lengthMm: RULER_LENGTH_MM },
  };
}

/** The lowest point any figure reaches, so a test can hold the layout inside the paper. */
export function snareGaugeLayoutBottomMm(layout: SnareGaugeLayout): number {
  return Math.max(
    layout.circle.cy + layout.circle.r,
    layout.strip.y + layout.strip.heightMm,
    layout.slit.y + layout.slit.heightMm,
    layout.ruler.y,
  );
}

export function formatCentimetres(mm: number): string {
  return String(mm / 10);
}
