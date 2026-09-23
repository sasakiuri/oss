import type {
  AngleUnit,
  ClickVerificationSettings,
  DistanceUnit,
  LateralSide,
  NominalClick,
  OffsetUnit,
} from './schemas/click-verification';
import {
  MIL_RADIANS,
  MM_PER_INCH,
  MOA_RADIANS,
  angularSizeMm,
  fromMeters,
  toMeters,
  toMillimeters,
} from './sight-adjustment';

export type {
  AngleUnit,
  ClickVerificationSettings,
  DistanceUnit,
  LateralSide,
  NominalClick,
  OffsetUnit,
} from './schemas/click-verification';

/** The size of one click in its own unit, and that unit. */
export const NOMINAL_CLICKS: Record<NominalClick, { value: number; unit: AngleUnit }> = {
  '1/8-moa': { value: 1 / 8, unit: 'moa' },
  '1/4-moa': { value: 1 / 4, unit: 'moa' },
  '1/2-moa': { value: 1 / 2, unit: 'moa' },
  '1-moa': { value: 1, unit: 'moa' },
  '0.05-mil': { value: 0.05, unit: 'mil' },
  '0.1-mil': { value: 0.1, unit: 'mil' },
};

/** The click chosen when the reader switches the dial unit. */
export const DEFAULT_CLICK: Record<AngleUnit, NominalClick> = { moa: '1/4-moa', mil: '0.1-mil' };

export function clickUnit(click: NominalClick): AngleUnit {
  return NOMINAL_CLICKS[click].unit;
}

/** 1 MOA = π/10800 rad and 1 mil = 1/1000 rad, taken from the sight adjustment tool rather than rounded constants. */
export function angleToRadians(value: number, unit: AngleUnit): number {
  return value * (unit === 'moa' ? MOA_RADIANS : MIL_RADIANS);
}

export interface ClickVerificationResult {
  distanceMeters: number;
  unit: AngleUnit;
  /** Travel the label promises: distance × tan(dialled angle). */
  expectedMm: number;
  measuredMm: number;
  /** Expected ÷ measured. Multiply a dial amount by it to get the amount to actually turn. */
  correctionFactor: number;
  /** Measured ÷ expected. The share of the labelled travel the turret actually gives. */
  trackingRatio: number;
  /** (measured − expected) ÷ expected × 100. Positive: the turret moves more than labelled. */
  errorPercent: number;
  /** Nominal click × measured ÷ expected, in the unit of the click. */
  effectiveClick: number;
  nominalClick: number;
  /** Dial ÷ nominal click. Not rounded, so a dial that is not a whole number of clicks shows. */
  clicksDialled: number;
  /** How much the error percentage moves when the measurement is misread by 1 mm. */
  percentPerMm: number;
  /** atan(sideways ÷ measured), in degrees, or null without a sideways offset. */
  tiltDegrees: number | null;
  tiltSide: LateralSide | null;
}

/**
 * Travel the label promises for a dial at a distance: distance × tan(dialled angle).
 *
 * Needs neither a measurement nor a group, so the target can be sized and printed before the first shot.
 */
export function expectedTravelMm(
  distance: ClickVerificationSettings['distance'],
  click: NominalClick,
  dial: number,
): number | null {
  const distanceMeters = toMeters(distance.value, distance.unit);
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;
  if (!Number.isFinite(dial) || dial <= 0) return null;
  const radians = angleToRadians(dial, NOMINAL_CLICKS[click].unit);
  // A dial of a quarter turn of the bore or more has no meaning on a flat target.
  if (radians >= Math.PI / 2) return null;
  return angularSizeMm(radians, distanceMeters);
}

/** Fields may hold NaN while they are being typed; a blank sideways offset only drops the tilt. */
export function calculateClickVerification(settings: ClickVerificationSettings): ClickVerificationResult | null {
  const { distance, click, dial, measureUnit, measured, lateral } = settings;
  const expectedMm = expectedTravelMm(distance, click, dial);
  if (expectedMm === null) return null;
  const measuredMm = toMillimeters(measured, measureUnit);
  if (!Number.isFinite(measuredMm) || measuredMm <= 0) return null;
  const { value: nominalClick, unit } = NOMINAL_CLICKS[click];
  const distanceMeters = toMeters(distance.value, distance.unit);
  const trackingRatio = measuredMm / expectedMm;
  const lateralMm = toMillimeters(lateral.value, measureUnit);
  const hasTilt = Number.isFinite(lateralMm) && lateralMm > 0;
  return {
    distanceMeters,
    unit,
    expectedMm,
    measuredMm,
    correctionFactor: expectedMm / measuredMm,
    trackingRatio,
    errorPercent: (trackingRatio - 1) * 100,
    effectiveClick: nominalClick * trackingRatio,
    nominalClick,
    clicksDialled: dial / nominalClick,
    percentPerMm: 100 / expectedMm,
    tiltDegrees: hasTilt ? (Math.atan(lateralMm / measuredMm) * 180) / Math.PI : null,
    tiltSide: hasTilt ? lateral.side : null,
  };
}

export function mmToInch(mm: number): number {
  return mm / MM_PER_INCH;
}

/** Decimal places a converted value keeps, so the field stays readable while the length barely moves. */
export const CONVERTED_DECIMALS = 4;

function roundConverted(value: number): number {
  const scale = 10 ** CONVERTED_DECIMALS;
  return Math.round(value * scale) / scale;
}

/** The same distance in another unit. A blank field stays blank. */
export function convertDistance(value: number, from: DistanceUnit, to: DistanceUnit): number {
  if (!Number.isFinite(value) || from === to) return value;
  return roundConverted(fromMeters(toMeters(value, from), to));
}

/** The same length on the target in another unit. A blank field stays blank. */
export function convertLength(value: number, from: OffsetUnit, to: OffsetUnit): number {
  if (!Number.isFinite(value) || from === to) return value;
  return roundConverted(toMillimeters(value, from) / toMillimeters(1, to));
}

// ---------------------------------------------------------------------------------------------
// The printed tall target
// ---------------------------------------------------------------------------------------------

export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;
/** New target height each sheet adds. */
export const SEGMENT_MM = 240;
/** Below the aim point on the first sheet, and the gluing strip on every later sheet. */
export const OVERLAP_MM = 15;
/** Paper y of the lowest drawn point of a sheet. The footer with the reference line sits below it. */
export const CONTENT_BOTTOM_MM = 267;
/** Room above the expected position, so a turret that moves more than labelled still lands on paper. */
export const HEADROOM_RATIO = 0.1;
export const HEADROOM_MM = 30;
/** Past this the target is taller than a sheet of A4 tiles sensibly makes (about 2.9 m). */
export const MAX_PAGES = 12;
export const REFERENCE_LINE_MM = 50;

export interface TallTargetPage {
  index: number;
  /** Height above the aim point, in millimetres, at the bottom and top of what this sheet draws. */
  startMm: number;
  endMm: number;
  /** Height of the join line this sheet shares with the sheet below, or null on the first sheet. */
  joinBelowMm: number | null;
  /** Height of the join line this sheet shares with the sheet above, or null on the last sheet. */
  joinAboveMm: number | null;
}

export interface TallTargetLayout {
  expectedMm: number;
  /** Height of the vertical line above the aim point. */
  heightMm: number;
  pageCount: number;
  fits: boolean;
  pages: TallTargetPage[];
}

export function tallTargetLayout(expectedMm: number): TallTargetLayout | null {
  if (!Number.isFinite(expectedMm) || expectedMm <= 0) return null;
  const heightMm = expectedMm * (1 + HEADROOM_RATIO) + HEADROOM_MM;
  const pageCount = Math.max(1, Math.ceil(heightMm / SEGMENT_MM));
  const fits = pageCount <= MAX_PAGES;
  const pages = fits
    ? Array.from({ length: pageCount }, (_, index) => ({
        index,
        startMm: index * SEGMENT_MM - OVERLAP_MM,
        endMm: Math.min((index + 1) * SEGMENT_MM, heightMm),
        joinBelowMm: index === 0 ? null : index * SEGMENT_MM,
        joinAboveMm: index === pageCount - 1 ? null : (index + 1) * SEGMENT_MM,
      }))
    : [];
  return { expectedMm, heightMm, pageCount, fits, pages };
}

/** Paper y, from the top edge of the sheet, of a height above the aim point. */
export function paperY(page: TallTargetPage, heightMm: number): number {
  return CONTENT_BOTTOM_MM - (heightMm - page.startMm);
}

export interface Tick {
  heightMm: number;
  lengthMm: number;
  /** Written beside every 10 mm tick. */
  labelled: boolean;
}

/** One tick per millimetre from the aim point up, longer at every 5 and 10 mm. */
export function tallTargetTicks(page: TallTargetPage): Tick[] {
  const ticks: Tick[] = [];
  for (let mm = Math.max(0, Math.ceil(page.startMm)); mm <= Math.floor(page.endMm); mm += 1) {
    const tenth = mm % 10 === 0;
    ticks.push({ heightMm: mm, lengthMm: tenth ? 10 : mm % 5 === 0 ? 6 : 3, labelled: tenth });
  }
  return ticks;
}
