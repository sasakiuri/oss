import { describe, expect, it } from 'vitest';

import { flyPellet } from '@/lib/shot-pellets';
import { MIL_RADIANS, MOA_RADIANS, angularSizeMm } from '@/lib/sight-adjustment';
import { sphereDragCoefficient, sphereFrontalAreaM2, sphereMassKg } from '@/lib/sphere-drag';
import {
  LEAD_TABLE_ANGLES_DEGREES,
  LEAD_TABLE_DISTANCE_FACTORS,
  calculateTargetLead,
  leadLengths,
  leadTable,
  toMetersPerSecond,
  type TargetLeadInput,
  type TargetLeadResult,
} from '@/lib/target-lead';
import { STANDARD_GRAVITY, resolveConditions } from '@/lib/trajectory';

// The shot every case below varies: 40 m of range, a projectile averaging 400 m/s and a target at
// 90 km/h, which is 25 m/s. Crossing square, the meeting takes 40 / sqrt(400² - 25²) seconds.
const RANGE = 40;
const PROJECTILE = 400;
const TARGET = 25;
const RADIANS = Math.PI / 180;

const input = (overrides: Partial<TargetLeadInput> = {}): TargetLeadInput => ({
  targetSpeed: { value: 90, unit: 'km/h' },
  distance: { value: RANGE, unit: 'm' },
  crossingAngleDegrees: 90,
  projectileSpeed: { value: PROJECTILE, unit: 'm/s' },
  delaySeconds: 0,
  ...overrides,
});

/** The figures, or null where there are none: most cases are about the numbers, not the outcome. */
const lead = (overrides: Partial<TargetLeadInput> = {}): TargetLeadResult | null => {
  const outcome = calculateTargetLead(input(overrides));
  return outcome.kind === 'lead' ? outcome.result : null;
};

describe('speed and length units', () => {
  it('matches the defined size of each unit', () => {
    expect(toMetersPerSecond(90, 'km/h')).toBeCloseTo(25, 10);
    expect(toMetersPerSecond(1, 'm/s')).toBe(1);
    // 1 mile is 1760 international yards, so 1 mph is 0.44704 m/s exactly.
    expect(toMetersPerSecond(1, 'mph')).toBeCloseTo(0.44704, 10);
    // 1 international foot is 0.3048 m exactly.
    expect(toMetersPerSecond(1, 'fps')).toBeCloseTo(0.3048, 10);
    expect(toMetersPerSecond(1200, 'fps')).toBeCloseTo(365.76, 8);
    expect(toMetersPerSecond(0, 'mph')).toBe(0);
  });
  it('gives one length in every unit a shooter reads it in', () => {
    const lengths = leadLengths(2.5);
    expect(lengths.meters).toBe(2.5);
    expect(lengths.centimetres).toBeCloseTo(250, 10);
    expect(lengths.inches).toBeCloseTo(98.4252, 4);
    expect(lengths.feet).toBeCloseTo(8.2021, 4);
    expect(leadLengths(0)).toMatchObject({ meters: 0, centimetres: 0, inches: 0, feet: 0 });
  });
});

describe('the meeting of the shot and the target', () => {
  it('solves a crossing shot rather than dividing the range by the speed', () => {
    const result = lead()!;
    // The target opens the range as it crosses, so the flight is longer than 40 / 400 = 0.1 s.
    expect(result.flightSeconds).toBeCloseTo(RANGE / Math.sqrt(PROJECTILE ** 2 - TARGET ** 2), 12);
    expect(result.flightSeconds).toBeGreaterThan(RANGE / PROJECTILE);
    expect(result.totalSeconds).toBe(result.flightSeconds);
    expect(result.lead.meters).toBeCloseTo(TARGET * result.totalSeconds, 12);
    // Crossing square, the whole of the lead is laid across the line of sight.
    expect(result.crossLead.meters).toBeCloseTo(result.lead.meters, 12);
    // The target has moved out to the corner of a right triangle, so the shot flies the hypotenuse.
    expect(result.interceptDistanceMeters).toBeCloseTo(Math.hypot(RANGE, result.lead.meters), 10);
    expect(result.interceptDistanceMeters).toBeGreaterThan(RANGE);
  });
  it('shortens the flight for a closing target and lengthens it for one going away', () => {
    // Head-on the two speeds add, and straight away they subtract; both meet on the line of sight.
    const headOn = lead({ crossingAngleDegrees: 0 })!;
    expect(headOn.totalSeconds).toBeCloseTo(RANGE / (PROJECTILE + TARGET), 12);
    expect(headOn.lead.meters).toBeCloseTo(TARGET * headOn.totalSeconds, 12);
    expect(headOn.crossLead.meters).toBe(0);
    expect(headOn.angleRadians).toBe(0);
    expect(headOn.moa).toBe(0);
    expect(headOn.mil).toBe(0);
    expect(headOn.interceptDistanceMeters).toBeLessThan(RANGE);

    const goingAway = lead({ crossingAngleDegrees: 180 })!;
    expect(goingAway.totalSeconds).toBeCloseTo(RANGE / (PROJECTILE - TARGET), 12);
    expect(goingAway.lead.meters).toBeCloseTo(TARGET * goingAway.totalSeconds, 12);
    expect(goingAway.crossLead.meters).toBeCloseTo(0, 12);
    expect(goingAway.angleRadians).toBeCloseTo(0, 12);
    expect(goingAway.interceptDistanceMeters).toBeGreaterThan(RANGE);
  });
  it('does not fold an angle onto its mirror image', () => {
    const closing = lead({ crossingAngleDegrees: 30 })!;
    const opening = lead({ crossingAngleDegrees: 150 })!;
    // Both share a crossing component of 25 x sin 30, but not the flight it acts over.
    expect(closing.totalSeconds).toBeLessThan(opening.totalSeconds);
    expect(closing.crossLead.meters).toBeCloseTo(1.1864, 4);
    expect(opening.crossLead.meters).toBeCloseTo(1.3222, 4);
    expect(closing.crossLead.meters).not.toBeCloseTo(opening.crossLead.meters, 3);
    // Taking the flight as range over speed would have put both at 25 x 0.1 x sin 30 = 1.25 m.
    const naive = TARGET * (RANGE / PROJECTILE) * Math.sin(30 * RADIANS);
    expect(closing.crossLead.meters).toBeLessThan(naive);
    expect(opening.crossLead.meters).toBeGreaterThan(naive);
    // The flight time rises with the angle all the way from head-on to straight away.
    const times = [0, 30, 60, 90, 120, 150, 180].map((angle) => lead({ crossingAngleDegrees: angle })!.totalSeconds);
    for (let i = 1; i < times.length; i += 1) expect(times[i]).toBeGreaterThan(times[i - 1]!);
  });
  it('satisfies the interception equation it was derived from', () => {
    for (const crossingAngleDegrees of [0, 15, 30, 45, 60, 90, 120, 150, 180])
      for (const delaySeconds of [0, 0.02, 0.25]) {
        const result = lead({ crossingAngleDegrees, delaySeconds })!;
        const travelled = TARGET * result.totalSeconds;
        const along = RANGE - travelled * Math.cos(crossingAngleDegrees * RADIANS);
        const across = travelled * Math.sin(crossingAngleDegrees * RADIANS);
        // |r + v T| = u (T - delay): the shot is where the target is, at the moment it gets there.
        expect(Math.hypot(along, across)).toBeCloseTo(PROJECTILE * result.flightSeconds, 8);
        expect(result.interceptDistanceMeters).toBeCloseTo(Math.hypot(along, across), 8);
        expect(result.lead.meters).toBeCloseTo(travelled, 10);
        expect(result.crossLead.meters).toBeCloseTo(across, 10);
        expect(result.angleRadians).toBeCloseTo(Math.atan2(across, along), 12);
        expect(result.totalSeconds).toBeCloseTo(result.flightSeconds + delaySeconds, 12);
      }
  });
});

describe('the angle to swing', () => {
  it('is exact at every angle, not the lead over the range it started at', () => {
    for (const crossingAngleDegrees of [15, 30, 45, 60, 120, 150]) {
      const result = lead({ crossingAngleDegrees })!;
      // With no delay the swing is asin(|v| sin(angle) / u), which the range never enters.
      const exact = Math.asin((TARGET * Math.sin(crossingAngleDegrees * RADIANS)) / PROJECTILE);
      expect(result.angleRadians).toBeCloseTo(exact, 12);
      // Taking it as the lead over the range the target started at would be a different number.
      expect(result.angleRadians).not.toBeCloseTo(Math.atan(result.crossLead.meters / RANGE), 6);
      // The angle belongs to the range the shot actually flies: the crossing lead is that range
      // times the sine of it, because the shot flies the hypotenuse rather than the near side.
      expect(result.interceptDistanceMeters * Math.sin(result.angleRadians)).toBeCloseTo(result.crossLead.meters, 10);
      expect(result.moa).toBeCloseTo(result.angleRadians / MOA_RADIANS, 10);
      expect(result.mil).toBeCloseTo(result.angleRadians / MIL_RADIANS, 10);
    }
  });
  it('does not depend on the range while there is no delay', () => {
    const angles = [10, 40, 100].map((value) => lead({ distance: { value, unit: 'm' } })!.angleRadians);
    for (const angle of angles) expect(angle).toBeCloseTo(Math.asin(TARGET / PROJECTILE), 12);
    // 1 MOA measures 2.9089 cm at 100 m and 1 mil 10 cm: the published sizes of what the two
    // readings divide by. asin(25 / 400) is 3.5833 degrees, which is 215.00 MOA and 62.54 mil.
    expect(angularSizeMm(MOA_RADIANS, 100) / 10).toBeCloseTo(2.9089, 3);
    expect(angularSizeMm(MIL_RADIANS, 100) / 10).toBeCloseTo(10, 3);
    const result = lead()!;
    expect(result.angleDegrees).toBeCloseTo(3.5833, 4);
    expect(result.moa).toBeCloseTo(214.9993, 4);
    expect(result.mil).toBeCloseTo(62.5408, 4);
  });
});

describe('the delay before the shot leaves', () => {
  it('lets the target move first, which lengthens the flight as well as the lead', () => {
    const immediate = lead()!;
    const delayed = lead({ delaySeconds: 0.02 })!;
    expect(delayed.delaySeconds).toBe(0.02);
    expect(delayed.totalSeconds).toBeCloseTo(delayed.flightSeconds + 0.02, 12);
    expect(delayed.lead.meters).toBeCloseTo(TARGET * delayed.totalSeconds, 12);
    // The target has already opened the range by the time the shot leaves, so the flight is longer too.
    expect(delayed.flightSeconds).toBeGreaterThan(immediate.flightSeconds);
    expect(delayed.interceptDistanceMeters).toBeGreaterThan(immediate.interceptDistanceMeters);
    // Waiting cannot be folded into the crossing geometry: the swing grows with it.
    expect(delayed.angleRadians).toBeGreaterThan(Math.asin(TARGET / PROJECTILE));
    expect(lead({ delaySeconds: 0 })!.lead.meters).toBeCloseTo(immediate.lead.meters, 12);
  });
  it('still reaches a standing target after exactly the delay plus the flight', () => {
    for (const delaySeconds of [0, 0.05]) {
      const still = lead({ targetSpeed: { value: 0, unit: 'km/h' }, delaySeconds })!;
      expect(still.totalSeconds).toBeCloseTo(delaySeconds + RANGE / PROJECTILE, 12);
      expect(still.flightSeconds).toBeCloseTo(RANGE / PROJECTILE, 12);
      expect(still.lead.meters).toBe(0);
      expect(still.crossLead.meters).toBe(0);
      expect(still.angleDegrees).toBe(0);
      expect(still.interceptDistanceMeters).toBeCloseTo(RANGE, 10);
    }
  });
});

describe('shots that have no answer', () => {
  it('reports a target the shot cannot catch rather than a number', () => {
    // Faster than the projectile and opening the range: nothing ever arrives.
    const fast = { value: 500, unit: 'm/s' } as const;
    expect(calculateTargetLead(input({ targetSpeed: fast, crossingAngleDegrees: 180 })).kind).toBe('unreachable');
    expect(calculateTargetLead(input({ targetSpeed: fast, crossingAngleDegrees: 90 })).kind).toBe('unreachable');
    // Matching the projectile exactly is the same story: the gap never closes.
    expect(
      calculateTargetLead(input({ targetSpeed: { value: PROJECTILE, unit: 'm/s' }, crossingAngleDegrees: 180 })).kind,
    ).toBe('unreachable');
    // Coming straight on, a target faster than the shot still runs into it.
    const headOn = lead({ targetSpeed: fast, crossingAngleDegrees: 0 })!;
    expect(headOn.totalSeconds).toBeCloseTo(RANGE / (PROJECTILE + 500), 12);
    // The table asks the same question at 30, 60 and 90 degrees, and only the shallowest of them
    // still has an answer against a target this fast: the other two cells have nothing to show.
    const shallowRow = leadTable(input({ targetSpeed: fast, crossingAngleDegrees: 0 }))[0];
    if (!shallowRow) throw new Error('Expected a lead table row.');
    const cells = shallowRow.cells;
    expect(cells[0]!.crossLeadMeters).toBeCloseTo(6.709, 3);
    expect(cells.slice(1).map((cell) => cell.crossLeadMeters)).toEqual([null, null]);
  });
  it('reports a figure it cannot use as an unfinished form', () => {
    for (const value of [0, -400, NaN, Infinity])
      expect(calculateTargetLead(input({ projectileSpeed: { value, unit: 'm/s' } })).kind).toBe('incomplete');
    for (const value of [0, -40, NaN, Infinity])
      expect(calculateTargetLead(input({ distance: { value, unit: 'm' } })).kind).toBe('incomplete');
    // Zero is a standing target and allowed, so only a negative or missing speed is refused.
    for (const value of [-90, NaN, Infinity])
      expect(calculateTargetLead(input({ targetSpeed: { value, unit: 'km/h' } })).kind).toBe('incomplete');
    for (const crossingAngleDegrees of [-1, 181, NaN, Infinity])
      expect(calculateTargetLead(input({ crossingAngleDegrees })).kind).toBe('incomplete');
    for (const delaySeconds of [-0.01, NaN, Infinity])
      expect(calculateTargetLead(input({ delaySeconds })).kind).toBe('incomplete');
  });
});

describe('mixed units', () => {
  it('takes each figure in the unit it is usually quoted in', () => {
    // 100 yd is 91.44 m and 1200 fps is 365.76 m/s, both exact.
    const result = lead({ distance: { value: 100, unit: 'yd' }, projectileSpeed: { value: 1200, unit: 'fps' } })!;
    expect(result.distanceMeters).toBeCloseTo(91.44, 10);
    expect(result.projectileSpeedMps).toBeCloseTo(365.76, 8);
    expect(result.flightSeconds).toBeCloseTo(91.44 / Math.sqrt(365.76 ** 2 - TARGET ** 2), 10);
    expect(result.lead.meters).toBeCloseTo(TARGET * result.totalSeconds, 10);
    // 40 mph is 17.8816 m/s exactly.
    const mph = lead({ targetSpeed: { value: 40, unit: 'mph' } })!;
    expect(mph.targetSpeedMps).toBeCloseTo(17.8816, 10);
    expect(mph.lead.meters).toBeCloseTo(17.8816 * mph.totalSeconds, 12);
  });
});

describe('lead table', () => {
  it('solves the meeting again in every cell', () => {
    const rows = leadTable(input());
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.distanceMeters)).toEqual([20, 40, 60]);
    expect(rows.map((row) => row.current)).toEqual([false, true, false]);
    expect(rows.map((row) => row.cells.map((cell) => cell.angleDegrees))).toEqual(
      rows.map(() => [...LEAD_TABLE_ANGLES_DEGREES]),
    );
    expect(LEAD_TABLE_DISTANCE_FACTORS).toEqual([0.5, 1, 1.5]);
    // The crossing lead grows with the angle across a row and with the range down a column.
    for (const row of rows) {
      const cells = row.cells.map((cell) => cell.crossLeadMeters!);
      expect(cells).toHaveLength(LEAD_TABLE_ANGLES_DEGREES.length);
      expect(cells[0]!).toBeLessThan(cells[1]!);
      expect(cells[1]!).toBeLessThan(cells[2]!);
    }
    const [nearRow, midRow, farRow] = rows;
    if (!nearRow || !midRow || !farRow) throw new Error('Expected three lead table rows.');
    for (let column = 0; column < LEAD_TABLE_ANGLES_DEGREES.length; column += 1) {
      const near = nearRow.cells[column];
      const mid = midRow.cells[column];
      const far = farRow.cells[column];
      if (!near || !mid || !far) throw new Error('Expected a lead table cell at every column.');
      expect(near.crossLeadMeters!).toBeLessThan(mid.crossLeadMeters!);
      expect(mid.crossLeadMeters!).toBeLessThan(far.crossLeadMeters!);
    }
  });
  it('agrees with the single result on the row and column the form is asking about', () => {
    for (const delaySeconds of [0, 0.03]) {
      const settings = input({ crossingAngleDegrees: 60, targetSpeed: { value: 30, unit: 'mph' }, delaySeconds });
      const outcome = calculateTargetLead(settings);
      const current = leadTable(settings).find((row) => row.current)!;
      expect(outcome.kind).toBe('lead');
      expect(current.distanceMeters).toBeCloseTo(RANGE, 10);
      expect(current.cells.find((cell) => cell.angleDegrees === 60)!.crossLeadMeters).toBeCloseTo(
        outcome.kind === 'lead' ? outcome.result.crossLead.meters : NaN,
        12,
      );
    }
  });
  it('carries the delay into every row instead of scaling it with the range', () => {
    const plain = leadTable(input());
    const delayed = leadTable(input({ delaySeconds: 0.02 }));
    const cellCrossLead = (table: typeof plain, row: number, column: number) => {
      const cell = table[row]?.cells[column];
      if (!cell) throw new Error('Expected a lead table cell.');
      return cell.crossLeadMeters!;
    };
    for (let row = 0; row < plain.length; row += 1)
      for (let column = 0; column < LEAD_TABLE_ANGLES_DEGREES.length; column += 1)
        expect(cellCrossLead(delayed, row, column)).toBeGreaterThan(cellCrossLead(plain, row, column));
    // A delay is a fixed wait, so it counts for proportionally more at the shortest range.
    const share = (table: typeof plain, row: number) => cellCrossLead(table, row, 2);
    expect(share(delayed, 0) / share(plain, 0)).toBeGreaterThan(share(delayed, 2) / share(plain, 2));
  });
  it('has no table to show when the shot has no answer', () => {
    expect(leadTable(input({ distance: { value: 0, unit: 'm' } }))).toEqual([]);
    expect(leadTable(input({ projectileSpeed: { value: 0, unit: 'm/s' } }))).toEqual([]);
    expect(leadTable(input({ delaySeconds: NaN }))).toEqual([]);
    expect(leadTable(input({ targetSpeed: { value: 500, unit: 'm/s' }, crossingAngleDegrees: 90 }))).toEqual([]);
  });
});

describe('a target above the gun, climbing or dropping', () => {
  it('leaves a crossing lead unchanged by the elevation alone', () => {
    const level = lead()!;
    const raised = lead({ elevationDegrees: 30 })!;
    expect(raised.totalSeconds).toBeCloseTo(level.totalSeconds, 12);
    expect(raised.crossLead.meters).toBeCloseTo(level.crossLead.meters, 12);
    expect(raised.verticalLead.meters).toBeCloseTo(0, 12);
    expect(raised.verticalDegrees).toBeCloseTo(0, 10);
  });

  it('splits the lead of a climbing target into sideways and up', () => {
    const level = lead()!;
    const climbing = lead({ climbDegrees: 30 })!;
    // Square across and level with the gun, the climb adds no closing speed, so the flight is the same.
    expect(climbing.totalSeconds).toBeCloseTo(level.totalSeconds, 12);
    expect(climbing.crossLead.meters).toBeCloseTo(level.lead.meters * Math.cos(30 * RADIANS), 10);
    expect(climbing.verticalLead.meters).toBeCloseTo(level.lead.meters * Math.sin(30 * RADIANS), 10);
    expect(climbing.verticalDegrees).toBeGreaterThan(0);
    expect(climbing.angleRadians).toBeCloseTo(level.angleRadians, 10);
    expect(lead({ climbDegrees: -30 })!.verticalLead.meters).toBeLessThan(0);
  });

  it('rejects a line of sight or path steeper than the limit', () => {
    expect(calculateTargetLead(input({ elevationDegrees: 86 })).kind).toBe('incomplete');
    expect(calculateTargetLead(input({ climbDegrees: -86 })).kind).toBe('incomplete');
  });
});

describe('a pellet that slows and falls', () => {
  // No. 7.5 lead (0.095 in) from 400 m/s.
  const pellet = { model: 'drag' as const, diameterMeters: 0.002413, densityKgPerM3: 11300 };
  const conditions = resolveConditions({
    source: 'station',
    temperature: { value: 15, unit: 'c' },
    pressure: { value: 1013.25, unit: 'hpa' },
    altitude: { value: 0, unit: 'm' },
  })!;

  it('meets a standing target when the pellet has flown the range, aiming above by the drop', () => {
    const result = lead({ flight: pellet, targetSpeed: { value: 0, unit: 'm/s' } })!;
    const [row] = flyPellet(
      { diameterMeters: pellet.diameterMeters, densityKgPerM3: pellet.densityKgPerM3, muzzleSpeedMs: PROJECTILE },
      conditions,
      [RANGE],
    )!;
    expect(result.flightSeconds).toBeCloseTo(row!.timeSeconds, 3);
    expect(result.dropMeters).toBeCloseTo(row!.dropMeters, 3);
    expect(result.verticalLead.meters).toBeCloseTo(result.dropMeters, 6);
    expect(result.impactSpeedMps).toBeCloseTo(row!.speedMs, 0);
    expect(result.impactSpeedMps).toBeLessThan(PROJECTILE);
    expect(result.averageSpeedMps).toBeLessThan(PROJECTILE);
    expect(result.averageSpeedMps).toBeGreaterThan(result.impactSpeedMps);
  });

  it('needs more lead than the muzzle velocity taken as the average', () => {
    const steady = lead()!;
    const slowing = lead({ flight: pellet })!;
    expect(slowing.flightSeconds).toBeGreaterThan(steady.flightSeconds);
    expect(slowing.crossLead.meters).toBeGreaterThan(steady.crossLead.meters);
  });

  it('never catches a fast target going away at long range', () => {
    const outcome = calculateTargetLead(
      input({
        flight: pellet,
        distance: { value: 120, unit: 'm' },
        crossingAngleDegrees: 180,
        targetSpeed: { value: 30, unit: 'm/s' },
      }),
    );
    expect(outcome.kind).toBe('unreachable');
  });

  it('flies the pellet along the sloping line it is fired on', () => {
    // A reference flown in world coordinates, x level and z up, with the same sphere table and air,
    // and the launch angle found by bisection so the pellet passes through a standing target 120 m
    // out on an 80° line of sight.
    const range = 120;
    const elevation = 80 * RADIANS;
    const target = [range * Math.cos(elevation), range * Math.sin(elevation)] as const;
    const mass = sphereMassKg(pellet.diameterMeters, pellet.densityKgPerM3);
    const factor = sphereFrontalAreaM2(pellet.diameterMeters) / (2 * mass);
    const fly = (launch: number) => {
      type S = [number, number, number, number];
      const rate = ([, , vx, vz]: S): S => {
        const speed = Math.hypot(vx, vz);
        const k = factor * conditions.densityKgPerM3 * sphereDragCoefficient(speed / conditions.speedOfSoundMs) * speed;
        return [vx, vz, -k * vx, -k * vz - STANDARD_GRAVITY];
      };
      const along = (s: S, r: S, h: number): S => s.map((value, index) => value + r[index]! * h) as S;
      let state: S = [0, 0, PROJECTILE * Math.cos(launch), PROJECTILE * Math.sin(launch)];
      let t = 0;
      const dt = 1e-4;
      // Step until the pellet crosses the line of sight at the target's distance along it.
      const reach = (s: S) => s[0] * Math.cos(elevation) + s[1] * Math.sin(elevation) - range;
      while (reach(state) < 0) {
        const a = rate(state);
        const b = rate(along(state, a, dt / 2));
        const c = rate(along(state, b, dt / 2));
        const d = rate(along(state, c, dt));
        const next = state.map(
          (value, index) => value + (dt / 6) * (a[index]! + 2 * b[index]! + 2 * c[index]! + d[index]!),
        ) as S;
        if (reach(next) >= 0) {
          const f = -reach(state) / (reach(next) - reach(state));
          return { t: t + f * dt, z: state[1] + f * (next[1] - state[1]) };
        }
        state = next;
        t += dt;
      }
      return { t, z: state[1] };
    };
    let low = elevation;
    let high = elevation + 2 * RADIANS;
    for (let step = 0; step < 30; step++) {
      const middle = (low + high) / 2;
      if (fly(middle).z < target[1]) low = middle;
      else high = middle;
    }
    const launch = (low + high) / 2;
    const result = lead({
      flight: pellet,
      targetSpeed: { value: 0, unit: 'm/s' },
      distance: { value: range, unit: 'm' },
      elevationDegrees: 80,
    })!;
    expect(result.flightSeconds / fly(launch).t).toBeCloseTo(1, 3);
    expect(result.verticalDegrees / ((launch - elevation) / RADIANS)).toBeCloseTo(1, 2);
  });

  it('builds the table from the same flight', () => {
    const rows = leadTable(input({ flight: pellet }));
    expect(rows).toHaveLength(LEAD_TABLE_DISTANCE_FACTORS.length);
    const current = rows.find((row) => row.current)!;
    expect(current.cells.find((cell) => cell.angleDegrees === 90)!.crossLeadMeters).toBeCloseTo(
      lead({ flight: pellet })!.crossLead.meters,
      10,
    );
    expect(calculateTargetLead(input({ flight: { ...pellet, diameterMeters: 0 } })).kind).toBe('incomplete');
  });
});
