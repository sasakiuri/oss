import { describe, expect, it } from 'vitest';

import {
  STEP_SHOT_LIMIT,
  analyseCentres,
  analyseSeries,
  classifyInterval,
  classifyRectangle,
  displayInterval,
  displayRectangle,
  hasDuplicateValues,
  parseImpacts,
  parseOffsets,
  pooledDeviation,
  readStep,
} from '@/lib/load-development';

/*
 * Critical values from the published tables (NIST/SEMATECH e-Handbook 1.3.6.7.2):
 *   t(0.975, 2) = 4.303, t(0.975, 3) = 3.182.
 * The Bonferroni value for two comparisons at 95 %, t(0.9875, 3), is 4.177 in the published
 * Bonferroni t tables. The expected intervals below are worked by hand from these.
 */
const T975_DF3 = 3.182446;
const T975_DF2 = 4.302653;
const T9875_DF3 = 4.176535;

describe('reading what was typed', () => {
  it('keeps offsets either side of the aim point and names the rest', () => {
    expect(parseOffsets('12, -3\n0 foo')).toEqual({ values: [12, -3, 0], invalid: ['foo'] });
  });

  it('reads one "right up" pair per line and hands back lines that are not a pair', () => {
    expect(parseImpacts('1 2\n3,4\n\nfoo\n5\n1 2 3')).toEqual({
      impacts: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
      invalid: ['foo', '5', '1 2 3'],
    });
  });

  it('reads a step in the chosen mode and cuts it to the limit', () => {
    const many = Array.from({ length: STEP_SHOT_LIMIT + 1 }, () => '800').join('\n');
    const step = readStep({ id: 's1', value: 40, velocities: many, impacts: '1\n-2\nx' }, 'vertical');
    expect(step.velocities).toHaveLength(STEP_SHOT_LIMIT);
    expect(step.truncated).toBe(true);
    expect(step.heights).toEqual([1, -2]);
    expect(step.impactInvalid).toEqual(['x']);
    expect(step.impacts).toEqual([]);
    const both = readStep({ id: 's1', value: 40, velocities: '800 0', impacts: '1 2' }, 'both');
    // A velocity of zero is not a reading.
    expect(both.velocityInvalid).toEqual(['0']);
    expect(both.impacts).toEqual([{ x: 1, y: 2 }]);
    expect(both.heights).toEqual([]);
  });

  it('finds two steps with the same value', () => {
    expect(hasDuplicateValues([40, 40.3, 40])).toBe(true);
    expect(hasDuplicateValues([40, 40.3])).toBe(false);
  });
});

describe('what counts as small, large or undecided', () => {
  it('counts an interval inside the threshold, ends included, as small', () => {
    expect(classifyInterval({ low: -10, high: 10 }, 10)).toBe('small');
    expect(classifyInterval({ low: 10.0001, high: 20 }, 10)).toBe('large');
    expect(classifyInterval({ low: -20, high: -10.0001 }, 10)).toBe('large');
    // Touching the threshold from outside is not clear of it.
    expect(classifyInterval({ low: 10, high: 20 }, 10)).toBe('undecided');
    expect(classifyInterval(null, 10)).toBe('no-interval');
  });

  it('sets the rectangle of per-axis intervals against a circle', () => {
    // Farthest corner (2, 2) is 2.83 from the origin.
    expect(classifyRectangle({ low: 1, high: 2 }, { low: 1, high: 2 }, 3)).toBe('small');
    // Nearest corner (3, 3) is 4.24 away.
    expect(classifyRectangle({ low: 3, high: 4 }, { low: 3, high: 4 }, 4)).toBe('large');
    // Straddling zero across, the nearest point is (0, 3) and the farthest (1, 5), 5.10 away.
    expect(classifyRectangle({ low: -1, high: 1 }, { low: 3, high: 5 }, 4)).toBe('undecided');
    expect(classifyRectangle({ low: -1, high: 1 }, { low: 3, high: 5 }, 2.9)).toBe('large');
    expect(classifyRectangle({ low: -1, high: 1 }, { low: 3, high: 5 }, 5.1)).toBe('small');
    expect(classifyRectangle(null, { low: 0, high: 1 }, 5)).toBe('no-interval');
  });
});

describe('the pooled scatter within steps', () => {
  it('pools the sums of squares over every step with two shots or more', () => {
    // Sums of squares 0.5, 0.5 and 8 over 1 + 1 + 2 degrees of freedom; the single shot adds nothing.
    const pooled = pooledDeviation([[800, 801], [802, 803], [810, 812, 814], [900]]);
    expect(pooled?.degreesOfFreedom).toBe(4);
    expect(pooled?.sd).toBeCloseTo(Math.sqrt(9 / 4), 12);
  });

  it('has nothing to pool when every step is a single shot', () => {
    expect(pooledDeviation([[800], [805]])).toBeNull();
  });
});

describe('a ladder read one dimension at a time', () => {
  it('separates a change that is small from one that is large', () => {
    // Means 800.5, 802.5, 830.5; pooled SD √0.5 on 3 degrees of freedom.
    const analysis = analyseSeries(
      [
        { value: 3, samples: [830, 831] },
        { value: 1, samples: [800, 801] },
        { value: 2, samples: [802, 803] },
      ],
      10,
    );
    expect(analysis).not.toBeNull();
    if (!analysis) return;
    // Sorted by value, whatever order they were entered in.
    expect(analysis.steps.map((step) => step.value)).toEqual([1, 2, 3]);
    expect(analysis.pooled?.degreesOfFreedom).toBe(3);
    expect(analysis.pooled?.sd).toBeCloseTo(Math.sqrt(0.5), 12);

    // Step mean: 800.5 ± 3.182 × 0.7071 / √2 = ± 1.5912.
    expect(analysis.steps[0]?.interval?.low).toBeCloseTo(800.5 - (T975_DF3 * Math.sqrt(0.5)) / Math.sqrt(2), 3);

    // A change of 2 with half width 3.182 × 0.7071 × √(1/2 + 1/2) = 2.2504: −0.25 to 4.25.
    const [first, second] = analysis.pairs;
    expect(first?.difference).toBeCloseTo(2, 12);
    expect(first?.interval?.low).toBeCloseTo(-0.2504, 3);
    expect(first?.interval?.high).toBeCloseTo(4.2504, 3);
    expect(first?.verdict).toBe('small');
    // A change of 28: 25.75 to 30.25, clear of ±10.
    expect(second?.interval?.low).toBeCloseTo(28 - T975_DF3 * Math.sqrt(0.5), 3);
    expect(second?.verdict).toBe('large');

    expect(analysis.flatRun).toEqual({ first: 0, last: 1, supported: true });
  });

  it('calls a flat stretch unsupported when the noise reaches past the threshold', () => {
    // Pooled SD √50 on 2 degrees of freedom; a change of 6 carries ± 4.303 × 7.071 = ± 30.42.
    const analysis = analyseSeries(
      [
        { value: 1, samples: [800, 810] },
        { value: 2, samples: [806, 816] },
      ],
      10,
    );
    expect(analysis?.pairs[0]?.interval?.high).toBeCloseTo(6 + T975_DF2 * Math.sqrt(50), 3);
    expect(analysis?.pairs[0]?.verdict).toBe('undecided');
    expect(analysis?.flatRun).toEqual({ first: 0, last: 1, supported: false });
  });

  it('compares a one-shot step through the scatter of the others, and none without any', () => {
    const mixed = analyseSeries(
      [
        { value: 1, samples: [800, 801] },
        { value: 2, samples: [803] },
      ],
      10,
    );
    // Pooled SD √0.5 on 1 degree of freedom; t(0.975, 1) = 12.706; √(1/2 + 1) for the counts.
    expect(mixed?.pairs[0]?.interval?.high).toBeCloseTo(2.5 + 12.706205 * Math.sqrt(0.5) * Math.sqrt(1.5), 3);

    const single = analyseSeries(
      [
        { value: 1, samples: [800] },
        { value: 2, samples: [803] },
        { value: 3, samples: [830] },
      ],
      5,
    );
    expect(single?.pooled).toBeNull();
    expect(single?.pairs.map((pair) => pair.verdict)).toEqual(['no-interval', 'no-interval']);
    expect(single?.flatRun).toEqual({ first: 0, last: 1, supported: false });
  });

  it('takes the longest flat stretch, and the earliest of two equal ones', () => {
    // Changes 1, 20, 1, 1, 20, 1, 1.
    const values = [0, 1, 21, 22, 23, 43, 44, 45];
    const analysis = analyseSeries(
      values.map((mean, index) => ({ value: index, samples: [mean] })),
      5,
    );
    expect(analysis?.flatRun).toMatchObject({ first: 2, last: 4 });
    const none = analyseSeries(
      [
        { value: 1, samples: [0] },
        { value: 2, samples: [20] },
      ],
      5,
    );
    expect(none?.flatRun).toBeNull();
  });

  it('skips steps without shots and refuses too little to compare', () => {
    expect(
      analyseSeries(
        [
          { value: 1, samples: [800] },
          { value: 2, samples: [] },
        ],
        5,
      ),
    ).toBeNull();
    expect(
      analyseSeries(
        [
          { value: 1, samples: [800] },
          { value: 2, samples: [805] },
        ],
        -1,
      ),
    ).toBeNull();
  });
});

describe('group centres compared in the plane', () => {
  const pairAt = (value: number, y: number) => ({
    value,
    impacts: [
      { x: 0, y },
      { x: 2, y: y + 2 },
    ],
  });
  // Centres (1, 1), (1, 21), (1, 23); each group scatters by the same amount on both axes.
  const series = [pairAt(1, 0), pairAt(2, 20), pairAt(3, 22)];

  it('puts a Bonferroni interval on each axis and reads the rectangle against the radius', () => {
    const analysis = analyseCentres(series, 5);
    expect(analysis).not.toBeNull();
    if (!analysis) return;
    expect(analysis.axisLevel).toBeCloseTo(0.975, 12);
    // Sums of squares 2 + 2 + 2 over 3 degrees of freedom on each axis, so √2.
    expect(analysis.pooledX?.sd).toBeCloseTo(Math.SQRT2, 12);
    expect(analysis.pooledY?.sd).toBeCloseTo(Math.SQRT2, 12);
    expect(analysis.steps.map((step) => [step.x, step.y])).toEqual([
      [1, 1],
      [1, 21],
      [1, 23],
    ]);

    const [first, second] = analysis.pairs;
    // Each axis carries 4.177 × √2 × √(1/2 + 1/2) = 5.9065.
    const half = T9875_DF3 * Math.SQRT2;
    expect(first?.xInterval?.high).toBeCloseTo(half, 3);
    expect(first?.yInterval?.low).toBeCloseTo(20 - half, 3);
    expect(first?.distance).toBeCloseTo(20, 12);
    // Nearest point of the rectangle is (0, 14.09), outside a radius of 5.
    expect(first?.verdict).toBe('large');
    // Moving 2 up: the rectangle holds the origin, and its far corner (5.91, 7.91) is 9.87 away.
    expect(second?.verdict).toBe('undecided');
    expect(analysis.flatRun).toEqual({ first: 1, last: 2, supported: false });

    const wider = analyseCentres(series, 10);
    expect(wider?.pairs.map((pair) => pair.verdict)).toEqual(['large', 'small']);
    expect(wider?.flatRun).toEqual({ first: 1, last: 2, supported: true });
  });

  it('refuses a verdict when every repeated shot agreed on an axis', () => {
    const flat = [0, 10, 12].map((y, index) => ({
      value: index,
      impacts: [
        { x: 0, y },
        { x: 2, y },
      ],
    }));
    const analysis = analyseCentres(flat, 5);
    expect(analysis?.pooledY?.sd).toBe(0);
    expect(analysis?.pairs.map((pair) => pair.verdict)).toEqual(['no-dispersion', 'no-dispersion']);
    expect(analysis?.pairs[0]?.yInterval).toBeNull();
    expect(analysis?.flatRun).toEqual({ first: 1, last: 2, supported: false });
  });
});

describe('a series whose repeated shots all agreed', () => {
  it('does not read readings that happen to match as a scatter of zero', () => {
    const analysis = analyseSeries(
      [
        { value: 1, samples: [800, 800] },
        { value: 2, samples: [803, 803] },
        { value: 3, samples: [823, 823] },
      ],
      5,
    );
    expect(analysis?.pooled?.sd).toBe(0);
    expect(analysis?.steps[0]?.interval).toBeNull();
    expect(analysis?.pairs.map((pair) => pair.verdict)).toEqual(['no-dispersion', 'no-dispersion']);
    expect(analysis?.pairs[0]?.interval).toBeNull();
    expect(analysis?.flatRun).toEqual({ first: 0, last: 1, supported: false });
  });
});

describe('interval ends as they are written', () => {
  it('rounds outward, so an undecided interval is not drawn inside the threshold', () => {
    // −1.042 to 5.042 against 5: to the nearest it would read −1.0 to 5.0.
    expect(displayInterval({ low: -1.042, high: 5.042 }, 5, 'undecided')).toEqual({ low: -1.1, high: 5.1, digits: 1 });
  });

  it('adds decimals until the written interval reads as it was judged', () => {
    // 5.04 to 9 is clear of 5, but 5.0 would touch it.
    expect(displayInterval({ low: 5.04, high: 9 }, 5, 'large')).toEqual({ low: 5.04, high: 9, digits: 2 });
    expect(displayInterval({ low: -4.96, high: 4.96 }, 5, 'small')).toEqual({ low: -5, high: 5, digits: 1 });
  });

  it('does the same for the rectangle of a centre movement', () => {
    // Far corner (0.04, 3.04) is 3.0403 from the origin, inside 3.05; at one decimal it would be 3.10.
    const shown = displayRectangle({ low: -0.04, high: 0.04 }, { low: 2.96, high: 3.04 }, 3.05, 'small');
    expect(shown).toEqual({ x: { low: -0.04, high: 0.04 }, y: { low: 2.96, high: 3.04 }, digits: 2 });
  });
});
