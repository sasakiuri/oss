import { describe, expect, it } from 'vitest';

import { RETICLE_SCALE, holdOnScale, reticleHold } from '@/lib/reticle-hold';
import { MIL_RADIANS, MOA_RADIANS } from '@/lib/sight-adjustment';
import { MAX_TAPE_LENGTH_MM, layoutTurretTape } from '@/lib/turret-tape';

const hold = (overrides: Partial<Parameters<typeof reticleHold>[0]> = {}) =>
  reticleHold({
    dropRadians: 2 * MIL_RADIANS,
    driftRadians: 0.5 * MIL_RADIANS,
    unit: 'mil',
    focalPlane: 'ffp',
    calibratedMagnification: 10,
    magnification: 10,
    ...overrides,
  })!;

describe('the hold on a reticle', () => {
  it('holds up by the drop and into the drift', () => {
    const result = hold();
    expect(result.up).toBeCloseTo(2, 12);
    // Drift to the right is held off to the left.
    expect(result.right).toBeCloseTo(-0.5, 12);
    expect(result.markValue).toBe(1);
  });

  it('reads a mil as 3.4377 MOA', () => {
    // 1 mil = 0.001 rad; 1 MOA = π/10800 rad, so 1 mil = 10.8/π = 3.43775 MOA.
    expect(hold({ unit: 'moa' }).up).toBeCloseTo((2 * 10.8) / Math.PI, 9);
    expect(hold({ unit: 'moa', dropRadians: MOA_RADIANS }).up).toBeCloseTo(1, 12);
  });

  it('needs fewer marks at low power on a second focal plane reticle, and the same on a first', () => {
    // At half the calibrated power each mark covers twice its nominal angle.
    expect(hold({ focalPlane: 'sfp', magnification: 5 }).up).toBeCloseTo(1, 12);
    expect(hold({ focalPlane: 'sfp', magnification: 5 }).markValue).toBe(2);
    expect(hold({ focalPlane: 'ffp', magnification: 5 }).up).toBeCloseTo(2, 12);
  });

  it('says when the hold runs off the scale', () => {
    expect(holdOnScale(hold(), 'mil')).toBe(true);
    expect(holdOnScale(hold({ dropRadians: (RETICLE_SCALE.mil.reach + 1) * MIL_RADIANS }), 'mil')).toBe(false);
    expect(
      reticleHold({
        ...hold(),
        dropRadians: NaN,
        driftRadians: 0,
        unit: 'mil',
        focalPlane: 'ffp',
        calibratedMagnification: 10,
        magnification: 0,
      }),
    ).toBeNull();
  });
});

describe('the turret tape', () => {
  const marks = [
    { distanceLabel: '100', clicks: 0 },
    { distanceLabel: '200', clicks: 12 },
    { distanceLabel: '500', clicks: 75 },
  ];

  it('places each distance at its clicks round the circumference', () => {
    const layout = layoutTurretTape({
      circumferenceMm: 120,
      clicksPerRevolution: 60,
      direction: 'left-to-right',
      marks,
    })!;
    expect(layout.clickSpacingMm).toBe(2);
    expect(layout.marks.map((mark) => mark.positionMm)).toEqual([0, 24, 30]);
    // 75 clicks is one full turn of 60 and 15 more.
    expect(layout.marks.map((mark) => mark.turn)).toEqual([0, 0, 1]);
    expect(layout.ticks).toHaveLength(60);
    expect(layout.ticks.filter((tick) => tick.major).map((tick) => tick.clicks)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(layout.overflow).toBeNull();
  });

  it('runs the other way for a turret numbered the other way', () => {
    const layout = layoutTurretTape({
      circumferenceMm: 120,
      clicksPerRevolution: 60,
      direction: 'right-to-left',
      marks,
    })!;
    expect(layout.marks.map((mark) => mark.positionMm)).toEqual([120, 96, 90]);
  });

  it('thins the ticks that would print closer than half a millimetre, and reports what cannot print', () => {
    const fine = layoutTurretTape({
      circumferenceMm: 100,
      clicksPerRevolution: 400,
      direction: 'left-to-right',
      marks,
    })!;
    expect(fine.tickEvery).toBe(2);
    expect(fine.overflow).toBeNull();
    const tooFine = layoutTurretTape({
      circumferenceMm: 10,
      clicksPerRevolution: 400,
      direction: 'left-to-right',
      marks,
    })!;
    expect(tooFine.overflow).toBe('spacing');
    const tooLong = layoutTurretTape({
      circumferenceMm: MAX_TAPE_LENGTH_MM + 1,
      clicksPerRevolution: 60,
      direction: 'left-to-right',
      marks,
    })!;
    expect(tooLong.overflow).toBe('length');
    // Distances short of the zero need a turn the other way and are not on an elevation tape.
    const below = layoutTurretTape({
      circumferenceMm: 120,
      clicksPerRevolution: 60,
      direction: 'left-to-right',
      marks: [{ distanceLabel: '50', clicks: -2 }],
    })!;
    expect(below.marks).toHaveLength(0);
    expect(
      layoutTurretTape({ circumferenceMm: 120, clicksPerRevolution: 0.5, direction: 'left-to-right', marks }),
    ).toBeNull();
  });
});
