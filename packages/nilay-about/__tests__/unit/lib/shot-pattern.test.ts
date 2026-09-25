import { describe, expect, it } from 'vitest';

import { patternRecordSchema } from '@/lib/schemas/shot-pattern';
import {
  PATTERN_DIAMETER_CM,
  buildRecordsCsv,
  chokePlan,
  densityGrid,
  distanceBetween,
  gapAnalysis,
  getInnerDiameterCm,
  getScale,
  summarisePattern,
  toImagePoint,
  toOffsetCm,
} from '@/lib/shot-pattern';

describe('shot pattern geometry', () => {
  it('derives centimetres per pixel from two marked points', () => {
    expect(getScale({ x: 0, y: 0 }, { x: 100, y: 0 }, PATTERN_DIAMETER_CM)).toBeCloseTo(0.762);
    expect(distanceBetween({ x: 10, y: 20 }, { x: 310, y: 420 })).toBe(500);
    expect(getScale({ x: 10, y: 20 }, { x: 310, y: 420 }, 50)).toBeCloseTo(0.1);
  });
  it('refuses a scale that cannot be measured', () => {
    for (const reference of [0, -3, Number.NaN, Infinity])
      expect(getScale({ x: 0, y: 0 }, { x: 100, y: 0 }, reference)).toBeNull();
    expect(getScale({ x: 5, y: 5 }, { x: 5, y: 5 }, PATTERN_DIAMETER_CM)).toBeNull();
  });
  it('converts between image pixels and centimetres around the circle centre', () => {
    const centre = { x: 200, y: 150 };
    expect(toOffsetCm({ x: 220, y: 130 }, centre, 0.5)).toEqual({ x: 10, y: 10 });
    expect(toOffsetCm({ x: 180, y: 170 }, centre, 0.5)).toEqual({ x: -10, y: -10 });
    expect(toImagePoint({ x: 10, y: 10 }, centre, 0.5)).toEqual({ x: 220, y: 130 });
    expect(toImagePoint(toOffsetCm({ x: 311, y: 87 }, centre, 0.127), centre, 0.127)).toEqual({ x: 311, y: 87 });
  });
  it('halves the circle area with the inner circle', () => {
    const inner = getInnerDiameterCm(PATTERN_DIAMETER_CM);
    expect(inner).toBeCloseTo(53.88, 2);
    expect(inner / 2).toBeCloseTo(26.94, 2);
    expect(Math.PI * (inner / 2) ** 2).toBeCloseTo((Math.PI * (PATTERN_DIAMETER_CM / 2) ** 2) / 2, 6);
  });
  it('counts the circle edge as a hit and the inner circle edge as the inner half', () => {
    const radius = PATTERN_DIAMETER_CM / 2;
    const innerRadius = getInnerDiameterCm(PATTERN_DIAMETER_CM) / 2;
    const summary = summarisePattern(
      [
        { x: radius, y: 0 },
        { x: 0, y: -radius },
        { x: radius + 0.01, y: 0 },
        { x: innerRadius, y: 0 },
        { x: innerRadius + 0.01, y: 0 },
      ],
      { diameterCm: PATTERN_DIAMETER_CM },
    );
    expect(summary).toMatchObject({ total: 5, inside: 4, outside: 1, inner: 1, outer: 3 });
  });
  it('reports the centroid, the quadrants and the pattern percentage', () => {
    const summary = summarisePattern(
      [
        { x: 3, y: 4 },
        { x: -3, y: 4 },
        { x: -3, y: -4 },
        { x: 3, y: -4 },
        { x: 0, y: 0 },
        { x: 9, y: 0 },
        { x: 20, y: 0 },
      ],
      { diameterCm: 20, pellets: 12 },
    );
    expect(summary).toMatchObject({ total: 7, inside: 6, outside: 1, inner: 5, outer: 1 });
    expect(summary.innerShare).toBeCloseTo(5 / 6);
    expect(summary.centroid).toMatchObject({ x: 1.5, y: 0, distance: 1.5 });
    // Shots on an axis, including the exact centre, are counted once towards the upper right.
    expect(summary.quadrants).toEqual({ upperLeft: 1, upperRight: 3, lowerLeft: 1, lowerRight: 1 });
    expect(summary.patternPercentage).toBeCloseTo(50);
  });
  it('leaves the pattern percentage out without a usable pellet count', () => {
    const shots = [{ x: 0, y: 0 }];
    expect(summarisePattern(shots, { diameterCm: PATTERN_DIAMETER_CM }).patternPercentage).toBeNull();
    expect(summarisePattern(shots, { diameterCm: PATTERN_DIAMETER_CM, pellets: null }).patternPercentage).toBeNull();
    expect(summarisePattern(shots, { diameterCm: PATTERN_DIAMETER_CM, pellets: 0 }).patternPercentage).toBeNull();
    expect(summarisePattern(shots, { diameterCm: PATTERN_DIAMETER_CM, pellets: 250 }).patternPercentage).toBeCloseTo(
      0.4,
    );
  });
  it('never divides by zero without shots or with an unusable circle', () => {
    const empty = summarisePattern([], { diameterCm: PATTERN_DIAMETER_CM, pellets: 250 });
    expect(empty).toMatchObject({ total: 0, inside: 0, outside: 0, inner: 0, outer: 0, centroid: null });
    expect(empty.innerShare).toBeNull();
    expect(empty.patternPercentage).toBe(0);
    expect(empty.quadrants).toEqual({ upperLeft: 0, upperRight: 0, lowerLeft: 0, lowerRight: 0 });
    for (const diameterCm of [-10, Number.NaN]) {
      const broken = summarisePattern([{ x: 0, y: 0 }], { diameterCm });
      expect(broken).toMatchObject({ total: 1, inside: 0, outside: 1, centroid: null });
      expect(broken.innerShare).toBeNull();
    }
  });
});

describe('shot pattern records', () => {
  const record = patternRecordSchema.parse({
    id: 'a',
    name: '35 m, full choke',
    savedAt: '2026-09-22T01:02:03.000Z',
    diameterCm: PATTERN_DIAMETER_CM,
    pellets: 250,
    note: 'メモ\n"引用"',
    shots: [
      { x: 1.234, y: -5.678 },
      { x: 60, y: 0 },
    ],
  });

  it('rejects a record that carries no measurement', () => {
    expect(patternRecordSchema.safeParse({ ...record, name: '  ' }).success).toBe(false);
    expect(patternRecordSchema.safeParse({ ...record, diameterCm: 0 }).success).toBe(false);
    expect(patternRecordSchema.safeParse({ ...record, pellets: 1.5 }).success).toBe(false);
    expect(patternRecordSchema.safeParse({ ...record, shots: [{ x: 1 }] }).success).toBe(false);
    expect(patternRecordSchema.parse({ ...record, pellets: null }).pellets).toBeNull();
  });
  it('writes one CSV row per record with the recalculated results', () => {
    const csv = buildRecordsCsv([record]);
    // Spelled out rather than built from the exported list: the names and their order are what a
    // reader opens the file with, and comparing the output to its own source would pin neither.
    const header =
      'name,savedAt,diameterCm,innerDiameterCm,pellets,total,inside,outside,inner,outer,innerShare,patternPercent,centroidRightCm,centroidUpCm,centroidOffsetCm,upperLeft,upperRight,lowerLeft,lowerRight,setup,distanceM,note,shotsCm';
    expect(csv.split('\n')[0]).toBe(header);
    // One whole row, worked out by hand against the headings above: two shots, one of them inside
    // the circle and in its inner half, so 1 of 250 pellets is 0.4% and the centroid of what
    // landed inside sits 5.81 cm below right of centre. The values are a second list kept by hand,
    // and a column added to one and not the other shows up here as a row that no longer lines up.
    expect(buildRecordsCsv([patternRecordSchema.parse({ ...record, name: 'plain', note: 'simple' })])).toBe(
      `${header}\nplain,2026-09-22T01:02:03.000Z,76.2,53.88,250,2,1,1,1,0,1,0.4,1.23,-5.68,5.81,0,0,0,1,,,simple,"1.23,-5.68 60,0"`,
    );
    // The setup and distance, when the record has them.
    expect(
      buildRecordsCsv([
        patternRecordSchema.parse({ ...record, name: 'plain', note: 'simple', setup: 'O/U（IC）', distanceM: 35 }),
      ]).split('\n')[1],
    ).toContain(',0,0,0,1,O/U（IC）,35,simple,');
    expect(csv).toContain('"35 m, full choke"');
    expect(csv).toContain('76.2,53.88,250,2,1,1,1,0,1,0.4,1.23,-5.68');
    // A note with a quote and a line break stays inside a single field.
    expect(csv).toContain('"メモ\n""引用"""');
    expect(csv).toContain('"1.23,-5.68 60,0"');
    expect(buildRecordsCsv([])).toBe(header);
  });
  it('keeps text a person typed from running as a spreadsheet formula', () => {
    const csv = buildRecordsCsv([patternRecordSchema.parse({ ...record, name: '=1+1', note: '@SUM(A1)\r\n+cmd' })]);
    expect(csv).toContain("'=1+1,");
    expect(csv).toContain('"\'@SUM(A1)\r\n+cmd"');
    // Measured numbers stay numbers, so the file can still be charted.
    expect(csv).toContain('76.2,53.88,250,2,1,1,1,0,1,0.4,1.23,-5.68');
    expect(csv).toContain('"1.23,-5.68 60,0"');
  });
});

describe('density, gaps and the choke plan', () => {
  it('counts shots in square cells centred on the circle', () => {
    const grid = densityGrid(
      [
        { x: 0, y: 0 },
        { x: 1, y: -1 },
        { x: 10, y: 0 },
        { x: 100, y: 100 },
      ],
      30,
      10,
    )!;
    // A 30 cm circle in 10 cm cells centred on it: three by three cells, from -15 to 15 cm.
    expect(grid.cells).toHaveLength(9);
    const at = (x: number, y: number) => grid.cells.find((cell) => cell.x === x && cell.y === y)!;
    expect(at(0, 0).count).toBe(2);
    expect(at(10, 0).count).toBe(1);
    // The corner cells' centres are 14.1 cm out, inside the 15 cm radius; the shot far outside is not counted.
    expect(at(10, 10).inCircle).toBe(true);
    expect(grid.cells.reduce((sum, cell) => sum + cell.count, 0)).toBe(3);
    expect(grid.max).toBe(2);
    expect(grid.cellsInCircle).toBe(grid.cells.filter((cell) => cell.inCircle).length);
    expect(grid.emptyCells).toBe(grid.cellsInCircle - 2);
    expect(densityGrid([], 30, 0)).toBeNull();
  });

  it('finds no gap in a dense pattern and a whole-circle gap in an empty one', () => {
    const dense = Array.from({ length: 41 * 41 }, (_, index) => ({
      x: (index % 41) - 20,
      y: Math.floor(index / 41) - 20,
    }));
    const full = gapAnalysis(dense, 30, 4)!;
    expect(full.gapShare).toBe(0);
    expect(full.largest!.diameterCm).toBeLessThanOrEqual(Math.SQRT2 + 1e-9);
    const empty = gapAnalysis([], 30, 10)!;
    expect(empty.gapShare).toBe(1);
    expect(empty.largest).toEqual({ x: 0, y: 0, diameterCm: 30 });
  });

  it('measures the gap left by a pattern thrown to one side', () => {
    // Every shot in the right half: a 10 cm disc fits in most of the left half.
    const right = Array.from({ length: 16 * 31 }, (_, index) => ({ x: index % 16, y: Math.floor(index / 16) - 15 }));
    const gaps = gapAnalysis(right, 30, 10)!;
    // Discs wholly inside sit within 10 cm of the centre, and are empty left of x = -5: a segment of
    // about a fifth of that 10 cm circle, less a little on the sampling grid.
    expect(gaps.gapShare).toBeGreaterThan(0.15);
    expect(gaps.gapShare).toBeLessThan(0.21);
    expect(gaps.gaps.every((gap) => gap.x < -4)).toBe(true);
    expect(gaps.largest!.x).toBeLessThan(0);
  });

  it('averages the measured pattern of each setup near each planned distance, and nothing else', () => {
    const shots = (count: number) => Array.from({ length: count }, () => ({ x: 0, y: 0 }));
    const make = (name: string, setup: string | undefined, distanceM: number | undefined, inside: number) =>
      patternRecordSchema.parse({
        id: name,
        name,
        savedAt: '2026-09-24T00:00:00.000Z',
        diameterCm: PATTERN_DIAMETER_CM,
        note: '',
        setup,
        distanceM,
        pellets: 200,
        shots: shots(inside),
      });
    const records = [
      make('a', 'IC', 25, 150),
      make('b', 'IC', 26, 130),
      make('c', 'Full', 35, 140),
      make('d', undefined, 35, 200),
      make('e', 'Full', undefined, 200),
    ];
    const plan = chokePlan(records, [25, 35]);
    expect(plan.map((row) => row.setup)).toEqual(['Full', 'IC']);
    expect(plan[1]!.cells).toEqual([
      { distanceM: 25, percent: 70, records: 2 },
      { distanceM: 35, percent: null, records: 0 },
    ]);
    expect(plan[0]!.cells[1]).toEqual({ distanceM: 35, percent: 70, records: 1 });
  });
});
