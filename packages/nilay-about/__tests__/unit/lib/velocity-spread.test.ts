import { describe, expect, it } from 'vitest';

import { PUBLISHED_GROUP_SIZE_LIMIT } from '@/lib/group-statistics';
import { MOA_RADIANS } from '@/lib/sight-adjustment';
import type { ShotDescription } from '@/lib/trajectory';
import {
  SD_PRECISION_SHOT_LIMIT,
  SPREAD_WIDE_SIGMAS,
  VELOCITY_SAMPLE_LIMIT,
  parseVelocities,
  shotsForSdPrecision,
  summariseVelocities,
  verticalSpread,
} from '@/lib/velocity-spread';

const string10 = [800, 805, 795, 802, 798, 807, 793, 801, 799, 804];

const shot = (overrides: Partial<ShotDescription> = {}): ShotDescription => ({
  muzzleSpeed: { value: 800, unit: 'mps' },
  ballisticCoefficient: 0.45,
  dragModel: 'g1',
  sightHeight: { value: 45, unit: 'mm' },
  atmosphere: {
    source: 'station',
    temperature: { value: 15, unit: 'c' },
    pressure: { value: 1013.25, unit: 'hpa' },
    altitude: { value: 0, unit: 'm' },
  },
  ...overrides,
});

describe('what a string of velocities says', () => {
  it('gives the average, the deviation and the extreme spread', () => {
    // Two shots: the mean is between them, the deviation is their difference over root two.
    const pair = summariseVelocities([800, 810]);
    expect(pair?.meanMs).toBeCloseTo(805, 12);
    expect(pair?.sdMs).toBeCloseTo(Math.sqrt(50), 12);
    expect(pair?.extremeSpreadMs).toBe(10);
    expect(pair?.minMs).toBe(800);
    expect(pair?.maxMs).toBe(810);
  });

  it('reads the deviation as a fraction of the speed, so two loads can be compared', () => {
    const slow = summariseVelocities([300, 310]);
    const fast = summariseVelocities([800, 810]);
    // The same 10 m/s spread is a larger share of an air rifle than of a centrefire.
    expect(slow?.coefficientOfVariation ?? 0).toBeGreaterThan(fast?.coefficientOfVariation ?? 1);
    expect(fast?.coefficientOfVariation).toBeCloseTo((fast?.sdMs ?? 0) / 805, 12);
  });

  it('puts the small sample bias back into the deviation', () => {
    const summary = summariseVelocities(string10);
    // Taking the root of an unbiased variance reads low, by about a per cent on ten shots.
    expect(summary?.sdUnbiasedMs ?? 0).toBeGreaterThan(summary?.sdMs ?? 1);
    expect((summary?.sdUnbiasedMs ?? 0) / (summary?.sdMs ?? 1)).toBeCloseTo(1.028, 3);
  });

  it('says where the average of the load lies, and closes in as more is fired', () => {
    const short = summariseVelocities([800, 805, 795]);
    const long = summariseVelocities([...string10, ...string10]);
    const width = (summary: ReturnType<typeof summariseVelocities>) =>
      (summary?.meanInterval.highMs ?? 0) - (summary?.meanInterval.lowMs ?? 0);
    expect(width(short)).toBeGreaterThan(width(long));
    // The interval sits astride the mean it was worked out from.
    expect((short?.meanInterval.lowMs ?? 0) + (short?.meanInterval.highMs ?? 0)).toBeCloseTo(
      2 * (short?.meanMs ?? 0),
      12,
    );
  });

  it('says how little a short string decides the deviation, and leans the way it really leans', () => {
    const summary = summariseVelocities(string10);
    const interval = summary?.sdInterval;
    expect(interval?.lowMs ?? 0).toBeLessThan(summary?.sdMs ?? 0);
    expect(interval?.highMs ?? 0).toBeGreaterThan(summary?.sdMs ?? 0);
    // Ten shots leave the deviation known to something like a factor of two either way, and the
    // interval is not symmetric: a short string understates spread more easily than it overstates it.
    expect(interval?.lowMs).toBeCloseTo(3.01, 2);
    expect(interval?.highMs).toBeCloseTo(7.99, 2);
    expect((interval?.highMs ?? 0) - (summary?.sdMs ?? 0)).toBeGreaterThan(
      (summary?.sdMs ?? 0) - (interval?.lowMs ?? 0),
    );
  });

  it('says what extreme spread a load of that deviation really produces', () => {
    const summary = summariseVelocities(string10);
    // The measured 14 m/s is the low side of what this deviation gives over ten shots.
    expect(summary?.extremeSpreadMs).toBe(14);
    expect(summary?.expectedSpread?.meanMs).toBeCloseTo(16.68, 2);
    expect(summary?.expectedSpread?.p025Ms ?? 0).toBeLessThan(14);
    expect(summary?.expectedSpread?.p975Ms ?? 0).toBeGreaterThan(14);
    expect(summary?.expectedSpread?.count).toBe(10);
  });

  it('scales that expectation with the deviation and stops where the table stops', () => {
    const once = summariseVelocities(string10);
    const twice = summariseVelocities(string10.map((value) => 800 + (value - 800) * 2));
    expect(twice?.expectedSpread?.meanMs ?? 0).toBeCloseTo((once?.expectedSpread?.meanMs ?? 0) * 2, 6);
    const long = summariseVelocities(Array.from({ length: PUBLISHED_GROUP_SIZE_LIMIT + 1 }, (_, i) => 800 + (i % 5)));
    expect(long).not.toBeNull();
    expect(long?.expectedSpread).toBeNull();
  });

  it('refuses what is not a string of shots', () => {
    expect(summariseVelocities([])).toBeNull();
    expect(summariseVelocities([800])).toBeNull();
    expect(summariseVelocities([800, NaN])).toBeNull();
    expect(summariseVelocities([800, 0])).toBeNull();
    expect(summariseVelocities([800, -5])).toBeNull();
    expect(summariseVelocities(Array.from({ length: VELOCITY_SAMPLE_LIMIT + 1 }, () => 800))).toBeNull();
    expect(summariseVelocities([800, 810], 0)).toBeNull();
    expect(summariseVelocities([800, 810], 1)).toBeNull();
  });
});

describe('reading the string as it was written down', () => {
  it('takes a column, a line or a comma separated row', () => {
    expect(parseVelocities('800\n805\n795').values).toEqual([800, 805, 795]);
    expect(parseVelocities('800 805 795').values).toEqual([800, 805, 795]);
    expect(parseVelocities('800, 805, 795').values).toEqual([800, 805, 795]);
    // A list pasted from a Japanese device may carry its punctuation with it.
    expect(parseVelocities('800、805，795').values).toEqual([800, 805, 795]);
  });

  it('keeps decimals and ignores the empty lines around them', () => {
    expect(parseVelocities('\n 802.4 \n\n 799.6 \n').values).toEqual([802.4, 799.6]);
    expect(parseVelocities('   ').values).toEqual([]);
  });

  it('hands back what was not a speed instead of dropping it', () => {
    const parsed = parseVelocities('800 fps 805 -3 0 795');
    expect(parsed.values).toEqual([800, 805, 795]);
    // Naming them is the point: a silently dropped entry moves the average without saying so.
    expect(parsed.invalid).toEqual(['fps', '-3', '0']);
  });
});

describe('how many shots it takes to know the deviation', () => {
  it('asks nothing about the load, only how many were fired', () => {
    // A famous and unwelcome number: pinning the deviation to a tenth of itself takes hundreds.
    expect(shotsForSdPrecision(0.1)).toBe(197);
    expect(shotsForSdPrecision(0.25)).toBe(36);
    expect(shotsForSdPrecision(0.5)).toBe(12);
  });

  it('asks for more as the answer is required more closely', () => {
    const loose = shotsForSdPrecision(0.3) ?? 0;
    const tight = shotsForSdPrecision(0.15) ?? 0;
    expect(tight).toBeGreaterThan(loose);
  });

  it('says nothing rather than print a count nobody will fire', () => {
    expect(shotsForSdPrecision(0.05)).toBeNull();
    expect(shotsForSdPrecision(0)).toBeNull();
    expect(shotsForSdPrecision(NaN)).toBeNull();
    expect(shotsForSdPrecision(0.1, 0)).toBeNull();
    // The limit is a limit, not a wrong answer.
    expect(shotsForSdPrecision(0.5) ?? 0).toBeLessThanOrEqual(SD_PRECISION_SHOT_LIMIT);
  });
});

describe('what the spread costs at distance', () => {
  const distances = [100, 200, 300, 400, 600];

  it('parts the shots at the zero distance too, because the rifle is only sighted in once', () => {
    const rows = verticalSpread(shot(), 100, distances, 4.3767);
    // The round that leaves faster is still climbing differently by the time it reaches the zero.
    expect(rows?.[0]?.spreadMeters ?? 0).toBeGreaterThan(0);
    expect(rows?.[0]?.spreadMeters ?? 1).toBeLessThan(0.005);
  });

  it('grows with distance, faster than the distance does', () => {
    const rows = verticalSpread(shot(), 100, distances, 4.3767) ?? [];
    for (const [index, row] of rows.entries()) {
      if (index === 0) continue;
      expect(row.spreadMeters).toBeGreaterThan(rows[index - 1]?.spreadMeters ?? 0);
      // In angle as well as in length: the velocity spread is not a fixed fraction of the drop.
      expect(row.spreadMoa).toBeGreaterThan(rows[index - 1]?.spreadMoa ?? 0);
    }
    expect(rows.at(-1)?.spreadMeters).toBeCloseTo(0.0978, 3);
  });

  it('reports the angle the same way the drop chart does', () => {
    const [row] = verticalSpread(shot(), 100, [300], 4.3767) ?? [];
    expect(row?.spreadMoa).toBeCloseTo(Math.atan((row?.spreadMeters ?? 0) / 300) / MOA_RADIANS, 12);
    expect(row?.spreadMil).toBeCloseTo((row?.spreadMoa ?? 0) * (MOA_RADIANS / 0.001), 9);
  });

  it('gives a wider band for the rounds that are not the average ones', () => {
    const [row] = verticalSpread(shot(), 100, [400], 4.3767) ?? [];
    expect(row?.spreadWideMeters ?? 0).toBeGreaterThan(row?.spreadMeters ?? 0);
    // Drag is not linear in velocity, so the wide band is close to, but not exactly, the multiple.
    expect((row?.spreadWideMeters ?? 0) / (row?.spreadMeters ?? 1)).toBeCloseTo(SPREAD_WIDE_SIGMAS, 1);
  });

  it('has nothing to spread when every round leaves at the same speed', () => {
    const rows = verticalSpread(shot(), 100, [300, 600], 0);
    for (const row of rows ?? []) expect(row.spreadMeters).toBe(0);
    // The drop itself is still the drop.
    expect(rows?.[0]?.dropMeters).toBeCloseTo(0.4927, 3);
  });

  it('refuses a deviation or a load that is not one', () => {
    expect(verticalSpread(shot(), 100, [300], -1)).toBeNull();
    expect(verticalSpread(shot(), 100, [300], NaN)).toBeNull();
    expect(verticalSpread(shot({ ballisticCoefficient: 0 }), 100, [300], 5)).toBeNull();
    expect(verticalSpread(shot(), 0, [300], 5)).toBeNull();
    // A deviation wider than the muzzle velocity would have rounds leaving backwards.
    expect(verticalSpread(shot(), 100, [300], 900)).toBeNull();
  });
});
