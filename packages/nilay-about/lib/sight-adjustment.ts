import type {
  ClickPreset,
  ClickSetting,
  DistanceUnit,
  HorizontalImpact,
  ImpactDirection,
  OffsetUnit,
  VerticalImpact,
} from './schemas/sight-adjustment';

export type {
  ClickPreset,
  ClickSetting,
  DistanceUnit,
  HorizontalImpact,
  ImpactDirection,
  OffsetUnit,
  SightAdjustmentSettings,
  VerticalImpact,
} from './schemas/sight-adjustment';

export const MM_PER_INCH = 25.4;
export const METERS_PER_YARD = 0.9144;
/** One minute of angle: 1/60 of a degree. */
export const MOA_RADIANS = Math.PI / (180 * 60);
/** One milliradian: 1/1000 radian. This is not the NATO mil, which divides the circle into 6400. */
export const MIL_RADIANS = 0.001;

const CLICK_ANGLES: Record<Exclude<ClickPreset, 'custom'>, number> = {
  '1/8-moa': MOA_RADIANS / 8,
  '1/4-moa': MOA_RADIANS / 4,
  '1/2-moa': MOA_RADIANS / 2,
  '1-moa': MOA_RADIANS,
  '0.05-mil': MIL_RADIANS * 0.05,
  '0.1-mil': MIL_RADIANS * 0.1,
};

export type TurretDirection = 'up' | 'down' | 'left' | 'right';

// Turning the turret moves the group toward the opposite side of the current impact.
const TURN: Record<ImpactDirection, TurretDirection> = { high: 'down', low: 'up', right: 'left', left: 'right' };
const OPPOSITE: Record<ImpactDirection, ImpactDirection> = { high: 'low', low: 'high', right: 'left', left: 'right' };
// The residual is shown to two decimal places in millimetres, so anything smaller reads as "about 0 mm".
export const NEGLIGIBLE_RESIDUAL_MM = 0.005;

export function toMeters(value: number, unit: DistanceUnit): number {
  return unit === 'yd' ? value * METERS_PER_YARD : value;
}

export function fromMeters(meters: number, unit: DistanceUnit): number {
  return unit === 'yd' ? meters / METERS_PER_YARD : meters;
}

export function toMillimeters(value: number, unit: OffsetUnit): number {
  return value * { mm: 1, cm: 10, inch: MM_PER_INCH }[unit];
}

/** Travel on the target for an angle, as distance × tan(angle) rather than a small-angle shortcut. */
export function angularSizeMm(angleRadians: number, distanceMeters: number): number {
  return distanceMeters * Math.tan(angleRadians) * 1000;
}

export function clickSizeMm(click: ClickSetting, distanceMeters: number): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return NaN;
  if (click.preset === 'custom') {
    const { customMmPer100m } = click;
    if (!Number.isFinite(customMmPer100m) || customMmPer100m <= 0) return NaN;
    return (customMmPer100m * distanceMeters) / 100;
  }
  return angularSizeMm(CLICK_ANGLES[click.preset], distanceMeters);
}

export interface AxisAdjustment {
  impact: ImpactDirection;
  offsetMm: number;
  turn: TurretDirection;
  clicks: number;
  exactClicks: number;
  /** Exact and signed. Positive: the group stays short of centre. Negative: the rounded clicks carry it past centre. */
  residualMm: number;
  /** The side the residual leaves the group on, or null once it is too small to show. */
  residualImpact: ImpactDirection | null;
}

/** Only the fields the click calculation needs, so the incline inputs stay out of it. */
export interface SightAdjustmentInput {
  distance: { value: number; unit: DistanceUnit };
  offsetUnit: OffsetUnit;
  vertical: { direction: VerticalImpact; value: number };
  horizontal: { direction: HorizontalImpact; value: number };
  click: ClickSetting;
}

export interface SightAdjustmentResult {
  distanceMeters: number;
  clickSizeMm: number;
  clickSizeInch: number;
  vertical: AxisAdjustment | null;
  horizontal: AxisAdjustment | null;
}

function adjustAxis(impact: ImpactDirection, value: number, unit: OffsetUnit, sizeMm: number): AxisAdjustment | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const offsetMm = toMillimeters(value, unit);
  const exactClicks = offsetMm / sizeMm;
  const clicks = Math.round(exactClicks);
  const residualMm = offsetMm - clicks * sizeMm;
  return {
    impact,
    offsetMm,
    turn: TURN[impact],
    clicks,
    exactClicks,
    residualMm,
    residualImpact: Math.abs(residualMm) < NEGLIGIBLE_RESIDUAL_MM ? null : residualMm > 0 ? impact : OPPOSITE[impact],
  };
}

export function calculateSightAdjustment(settings: SightAdjustmentInput): SightAdjustmentResult | null {
  const distanceMeters = toMeters(settings.distance.value, settings.distance.unit);
  const sizeMm = clickSizeMm(settings.click, distanceMeters);
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 || !Number.isFinite(sizeMm) || sizeMm <= 0) return null;
  return {
    distanceMeters,
    clickSizeMm: sizeMm,
    clickSizeInch: sizeMm / MM_PER_INCH,
    // Each axis is independent so a blank field does not hide the other result.
    vertical: adjustAxis(settings.vertical.direction, settings.vertical.value, settings.offsetUnit, sizeMm),
    horizontal: adjustAxis(settings.horizontal.direction, settings.horizontal.value, settings.offsetUnit, sizeMm),
  };
}

export interface SlantResult {
  horizontalMeters: number;
  cosine: number;
  reductionMeters: number;
}

export function calculateSlant(value: number, unit: DistanceUnit, angleDegrees: number): SlantResult | null {
  const slantMeters = toMeters(value, unit);
  if (!Number.isFinite(slantMeters) || slantMeters <= 0) return null;
  if (!Number.isFinite(angleDegrees) || Math.abs(angleDegrees) > 90) return null;
  // Uphill and downhill shots shorten the ballistic distance by the same cosine.
  const cosine = Math.cos((Math.abs(angleDegrees) * Math.PI) / 180);
  return { horizontalMeters: slantMeters * cosine, cosine, reductionMeters: slantMeters * (1 - cosine) };
}

export interface ConversionRow {
  key: 'moa' | 'mil' | 'click';
  mm: number;
  inch: number;
}

export function conversionTable(click: ClickSetting, distanceMeters: number): ConversionRow[] {
  const sizes: Record<ConversionRow['key'], number> = {
    moa: angularSizeMm(MOA_RADIANS, distanceMeters),
    mil: angularSizeMm(MIL_RADIANS, distanceMeters),
    click: clickSizeMm(click, distanceMeters),
  };
  return (Object.keys(sizes) as ConversionRow['key'][]).map((key) => ({
    key,
    mm: sizes[key],
    inch: sizes[key] / MM_PER_INCH,
  }));
}
