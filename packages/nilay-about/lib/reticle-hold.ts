/**
 * Where to hold on a reticle for a drop and a drift, instead of dialling them.
 *
 * The reticle is a plain scale of mil or MOA marks, the kind every maker's pattern is built on.
 * No maker's reticle is reproduced: their layouts are their own, and a hold read off a scale is the
 * same hold whatever the marks between the numbers look like.
 *
 * A first focal plane reticle grows with the image, so its marks mean the same angle at every
 * magnification. A second focal plane reticle stays the same size while the image grows, so its
 * marks are only true at the magnification the maker calibrated them at; at any other power one
 * mark covers calibrated / current times its nominal angle. Holding at half the calibrated power
 * therefore needs half as many marks.
 */

import { MIL_RADIANS, MOA_RADIANS } from './sight-adjustment';

export type ReticleUnit = 'mil' | 'moa';
export type FocalPlane = 'ffp' | 'sfp';

export interface ReticleHoldInput {
  /** Drop below the line of sight as an angle, positive when the shot falls low. */
  dropRadians: number;
  /** Drift as an angle, positive when the shot goes right. */
  driftRadians: number;
  unit: ReticleUnit;
  focalPlane: FocalPlane;
  calibratedMagnification: number;
  magnification: number;
}

export interface ReticleHold {
  /** Marks above the centre to put on the target. */
  up: number;
  /** Marks right of the centre to put on the target; negative is left. */
  right: number;
  /** The angle one mark covers at this magnification, in the reticle's own unit. */
  markValue: number;
}

export const RETICLE_UNIT_RADIANS: Record<ReticleUnit, number> = { mil: MIL_RADIANS, moa: MOA_RADIANS };

/**
 * The hold, in reticle marks.
 *
 * The shot falls low by the drop, so the hold goes up by it; the shot is carried right by the
 * drift, so the hold goes left. Both are counted in marks at the current magnification.
 */
export function reticleHold(input: ReticleHoldInput): ReticleHold | null {
  const { dropRadians, driftRadians, unit, focalPlane, calibratedMagnification, magnification } = input;
  if (![dropRadians, driftRadians].every(Number.isFinite)) return null;
  if (!(calibratedMagnification > 0) || !(magnification > 0)) return null;
  const markValue = focalPlane === 'sfp' ? calibratedMagnification / magnification : 1;
  const unitRadians = RETICLE_UNIT_RADIANS[unit];
  return {
    up: dropRadians / unitRadians / markValue,
    right: -driftRadians / unitRadians / markValue,
    markValue,
  };
}

/**
 * The reach of the scale drawn, in marks from the centre, and the spacing of its ticks.
 *
 * Ten mil and thirty MOA are about the same angle and about what the common hunting reticles
 * carry below the centre. A hold beyond the reach is reported rather than drawn off the glass.
 */
export const RETICLE_SCALE: Record<ReticleUnit, { reach: number; minor: number; major: number; label: number }> = {
  mil: { reach: 10, minor: 0.5, major: 1, label: 2 },
  moa: { reach: 30, minor: 1, major: 5, label: 10 },
};

export function holdOnScale(hold: ReticleHold, unit: ReticleUnit): boolean {
  const { reach } = RETICLE_SCALE[unit];
  return Math.abs(hold.up) <= reach && Math.abs(hold.right) <= reach;
}
