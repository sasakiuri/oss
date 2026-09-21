export type LengthUnit = 'mm' | 'cm' | 'm';

export interface Length {
  number: number;
  unit: LengthUnit;
}

export interface Discipline {
  name: string;
  key: string;
  distance: Length;
  heightOfTarget: Length;
  blackAreaSize: Length;
}

export type Language = 'ja' | 'en';

export interface TargetMeasurements {
  heightOfEye: Length;
  distanceToTarget: Length;
  discipline: Discipline;
}

export interface TargetCalculation {
  heightCm: number;
  diameterCm: number;
}

export const MAX_TARGET_DIAMETER_CM = 100;

const centimetersPerUnit: Record<LengthUnit, number> = { mm: 0.1, cm: 1, m: 100 };

export function toCentimeters(length: Length): number {
  return length.number * centimetersPerUnit[length.unit];
}

/** Project the target along the line of sight, with all results expressed in cm. */
export function calculateTarget({
  heightOfEye,
  distanceToTarget,
  discipline,
}: TargetMeasurements): TargetCalculation | null {
  const eyeCm = toCentimeters(heightOfEye);
  const distanceCm = toCentimeters(distanceToTarget);
  const fullDistanceCm = toCentimeters(discipline.distance);
  const fullHeightCm = toCentimeters(discipline.heightOfTarget);
  const fullDiameterCm = toCentimeters(discipline.blackAreaSize);

  if (
    ![eyeCm, distanceCm, fullDistanceCm, fullHeightCm, fullDiameterCm].every(Number.isFinite) ||
    eyeCm < 0 ||
    distanceCm < 0 ||
    fullDistanceCm <= 0 ||
    fullHeightCm < 0 ||
    fullDiameterCm <= 0
  ) {
    return null;
  }

  const ratio = distanceCm / fullDistanceCm;
  const heightCm = eyeCm + (fullHeightCm - eyeCm) * ratio;
  const diameterCm = fullDiameterCm * ratio;
  if (!Number.isFinite(heightCm) || !Number.isFinite(diameterCm)) return null;
  return { heightCm, diameterCm };
}
