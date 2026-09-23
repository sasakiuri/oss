import { describe, expect, it } from 'vitest';

import { groupRecordSchema } from '@/lib/schemas/shot-group';
import {
  angleFromSizeMm,
  buildRecordsCsv,
  distanceBetween,
  fromMillimeters,
  getScale,
  summariseGroup,
  toAimOffset,
  toAngularSize,
  toBulletDiameterMm,
  toImagePoint,
  toImpactMm,
} from '@/lib/shot-group';
import { MOA_RADIANS, angularSizeMm } from '@/lib/sight-adjustment';

describe('shot group geometry', () => {
  it('derives millimetres per pixel from two marked points', () => {
    expect(getScale({ x: 0, y: 0 }, { x: 100, y: 0 }, 50)).toBeCloseTo(0.5);
    expect(distanceBetween({ x: 10, y: 20 }, { x: 310, y: 420 })).toBe(500);
    expect(getScale({ x: 10, y: 20 }, { x: 310, y: 420 }, 250)).toBeCloseTo(0.5);
  });
  it('refuses a scale that cannot be measured', () => {
    for (const reference of [0, -3, Number.NaN, Infinity])
      expect(getScale({ x: 0, y: 0 }, { x: 100, y: 0 }, reference)).toBeNull();
    expect(getScale({ x: 5, y: 5 }, { x: 5, y: 5 }, 100)).toBeNull();
  });
  it('converts between image pixels and millimetres around the aim point', () => {
    const aim = { x: 200, y: 150 };
    expect(toImpactMm({ x: 220, y: 130 }, aim, 0.5)).toEqual({ x: 10, y: 10 });
    expect(toImpactMm({ x: 180, y: 170 }, aim, 0.5)).toEqual({ x: -10, y: -10 });
    expect(toImagePoint({ x: 10, y: 10 }, aim, 0.5)).toEqual({ x: 220, y: 130 });
    expect(toImagePoint(toImpactMm({ x: 311, y: 87 }, aim, 0.127), aim, 0.127)).toEqual({ x: 311, y: 87 });
  });
  it('reads a length back in the unit the reader chose', () => {
    expect(fromMillimeters(25.4, 'inch')).toBeCloseTo(1, 10);
    expect(fromMillimeters(25, 'cm')).toBeCloseTo(2.5, 10);
    expect(fromMillimeters(7.82, 'mm')).toBe(7.82);
    // A calibre is read in either unit: .308 inch is 7.82 mm.
    expect(toBulletDiameterMm(0.308, 'inch')).toBeCloseTo(7.8232, 4);
    expect(toBulletDiameterMm(7.82, 'mm')).toBe(7.82);
  });
});

describe('angular size of a group', () => {
  it('matches the published size of one MOA and one mil', () => {
    // 1 MOA is 2.9089 cm at 100 m, so a group of 29.089 mm at 100 m is one minute of angle.
    expect(toAngularSize(29.089, 100)!.moa).toBeCloseTo(1, 4);
    expect(toAngularSize(100, 100)!.mil).toBeCloseTo(1, 4);
    // 1 MOA at 100 yd is 1.047 inch, which the same conversion has to agree with.
    expect(toAngularSize(25.4 * 1.0472, 91.44)!.moa).toBeCloseTo(1, 4);
  });
  it('closes the round trip through angularSizeMm', () => {
    // What is pinned here is the arithmetic, not the geometry: the size a turret angle moves on the
    // target converts back to that same angle, so a figure shown in MOA can be read back in
    // millimetres without drifting. It is not a claim that this is the exact angle between two holes.
    for (const distanceMeters of [25, 100, 300]) {
      const oneMoa = angularSizeMm(MOA_RADIANS, distanceMeters);
      expect(toAngularSize(oneMoa, distanceMeters)!.moa).toBeCloseTo(1, 10);
      expect(angleFromSizeMm(oneMoa, distanceMeters)).toBeCloseTo(MOA_RADIANS, 12);
    }
    // Scaling with distance: the same group is twice the angle at half the distance.
    expect(toAngularSize(50, 50)!.moa).toBeCloseTo(toAngularSize(100, 100)!.moa, 6);
  });
  it('has no angle without a usable distance or size', () => {
    for (const distanceMeters of [0, -100, Number.NaN, Infinity]) {
      expect(toAngularSize(50, distanceMeters)).toBeNull();
      expect(angleFromSizeMm(50, distanceMeters)).toBeNaN();
    }
    expect(toAngularSize(null, 100)).toBeNull();
    expect(toAngularSize(Number.NaN, 100)).toBeNull();
    // A group has no negative size, so a negative length is refused rather than mirrored into an angle.
    for (const sizeMm of [-0.1, -50, -Infinity]) {
      expect(toAngularSize(sizeMm, 100)).toBeNull();
      expect(angleFromSizeMm(sizeMm, 100)).toBeNaN();
    }
    // Two shots through the same hole are a group of no size, which is a result and not a fault.
    expect(toAngularSize(0, 100)).toEqual({ moa: 0, mil: 0 });
    expect(angleFromSizeMm(0, 100)).toBe(0);
  });
});

describe('group summary', () => {
  it('measures a square of four shots by hand', () => {
    // Corners at (±10, ±10) mm: the extreme spread is a diagonal, 20√2 = 28.2843 mm, and every shot
    // sits 10√2 = 14.1421 mm from the centre, which is also the mean radius.
    const summary = summariseGroup([
      { x: -10, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: -10 },
      { x: -10, y: -10 },
    ]);
    expect(summary.count).toBe(4);
    expect(summary.extremeSpreadMm).toBeCloseTo(28.2843, 4);
    // A diagonal, not a side: the pair is opposite corners.
    expect(summary.extremePair).toEqual([0, 2]);
    expect(summary.mpi).toMatchObject({ rightMm: 0, upMm: 0, offsetMm: 0 });
    expect(summary.meanRadiusMm).toBeCloseTo(14.1421, 4);
    // Sample standard deviation: ±10 about a measured centre is √(400/3) = 11.547 mm on each axis.
    expect(summary.horizontalSdMm).toBeCloseTo(11.547, 3);
    expect(summary.verticalSdMm).toBeCloseTo(11.547, 3);
    expect(summary.extremeSpreadOuterMm).toBeNull();
  });
  it('measures three shots on one line by hand', () => {
    const summary = summariseGroup([
      { x: -30, y: 0 },
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ]);
    expect(summary.extremeSpreadMm).toBeCloseTo(60, 10);
    expect(summary.extremePair).toEqual([0, 2]);
    expect(summary.mpi).toMatchObject({ rightMm: 0, upMm: 0, offsetMm: 0 });
    // Two shots 30 mm out and one on the centre: (30 + 0 + 30) / 3.
    expect(summary.meanRadiusMm).toBeCloseTo(20, 10);
    // √((900 + 0 + 900) / 2) on the axis the shots spread along, and nothing across it.
    expect(summary.horizontalSdMm).toBeCloseTo(30, 10);
    expect(summary.verticalSdMm).toBe(0);
  });
  it('puts the mean point of impact where the group centre is, not where the aim point is', () => {
    const summary = summariseGroup([
      { x: 10, y: 20 },
      { x: 30, y: 20 },
      { x: 10, y: 40 },
      { x: 30, y: 40 },
    ]);
    expect(summary.mpi).toMatchObject({ rightMm: 20, upMm: 30 });
    expect(summary.mpi!.offsetMm).toBeCloseTo(36.0555, 4);
    expect(summary.extremeSpreadMm).toBeCloseTo(28.2843, 4);
    expect(summary.meanRadiusMm).toBeCloseTo(14.1421, 4);
  });
  it('adds one bullet diameter for the outside measure, and only when it is usable', () => {
    const impacts = [
      { x: -25, y: 0 },
      { x: 25, y: 0 },
    ];
    expect(summariseGroup(impacts, { bulletDiameterMm: 7.82 })).toMatchObject({
      extremeSpreadMm: 50,
      extremeSpreadOuterMm: 57.82,
    });
    for (const bulletDiameterMm of [null, 0, -1, Number.NaN, Infinity])
      expect(summariseGroup(impacts, { bulletDiameterMm }).extremeSpreadOuterMm).toBeNull();
  });
  it('leaves the group size open for one shot and for none at all', () => {
    const single = summariseGroup([{ x: 12, y: -8 }], { bulletDiameterMm: 7.82 });
    expect(single).toMatchObject({ count: 1, extremeSpreadMm: null, extremeSpreadOuterMm: null, extremePair: null });
    // The one shot is the whole group, so it is the mean point of impact.
    expect(single.mpi).toMatchObject({ rightMm: 12, upMm: -8 });
    expect(single.mpi!.offsetMm).toBeCloseTo(14.4222, 4);
    // A mean radius and a deviation of zero would claim a precision one shot cannot show.
    expect(single.meanRadiusMm).toBeNull();
    expect(single.horizontalSdMm).toBeNull();
    expect(single.verticalSdMm).toBeNull();

    expect(summariseGroup([])).toEqual({
      count: 0,
      extremeSpreadMm: null,
      extremeSpreadOuterMm: null,
      extremePair: null,
      mpi: null,
      meanRadiusMm: null,
      horizontalSdMm: null,
      verticalSdMm: null,
    });
  });
  it('measures two shots on the same spot as a group of no size', () => {
    const summary = summariseGroup([
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ]);
    expect(summary).toMatchObject({ count: 2, extremeSpreadMm: 0, meanRadiusMm: 0, horizontalSdMm: 0 });
    expect(summary.extremePair).toEqual([0, 1]);
  });
  it('leaves out a coordinate that is not a number, keeping the indexes of the rest', () => {
    const summary = summariseGroup([
      { x: Number.NaN, y: 0 },
      { x: -20, y: 0 },
      { x: 0, y: Infinity },
      { x: 20, y: 0 },
    ]);
    expect(summary.count).toBe(2);
    expect(summary.extremeSpreadMm).toBe(40);
    // The pair points back at the impacts that were passed in, not at the ones that could be measured.
    expect(summary.extremePair).toEqual([1, 3]);
    expect(summary.mpi).toMatchObject({ rightMm: 0, upMm: 0 });
  });
});

describe('the values the sight adjustment tool asks for', () => {
  it('states the mean point of impact as a side and a length that is never negative', () => {
    expect(toAimOffset({ rightMm: 12, upMm: -8, offsetMm: 14.4222 })).toEqual({
      vertical: { direction: 'low', valueMm: 8 },
      horizontal: { direction: 'right', valueMm: 12 },
    });
    expect(toAimOffset({ rightMm: -3.5, upMm: 4.5, offsetMm: 5.7 })).toEqual({
      vertical: { direction: 'high', valueMm: 4.5 },
      horizontal: { direction: 'left', valueMm: 3.5 },
    });
    // A centred axis has no side, so only the length of zero carries any meaning.
    expect(toAimOffset({ rightMm: 0, upMm: 0, offsetMm: 0 })).toEqual({
      vertical: { direction: 'high', valueMm: 0 },
      horizontal: { direction: 'right', valueMm: 0 },
    });
  });
});

describe('shot group records', () => {
  const record = groupRecordSchema.parse({
    id: 'a',
    name: '100 m, load A',
    savedAt: '2026-09-22T01:02:03.000Z',
    distance: { value: 100, unit: 'm' },
    bulletDiameterMm: 7.82,
    note: 'メモ\n"引用"',
    impacts: [
      { x: -10, y: 10 },
      { x: 10, y: -10 },
    ],
  });

  it('rejects a record that carries no measurement', () => {
    expect(groupRecordSchema.safeParse({ ...record, name: '  ' }).success).toBe(false);
    expect(groupRecordSchema.safeParse({ ...record, distance: { value: 0, unit: 'm' } }).success).toBe(false);
    expect(groupRecordSchema.safeParse({ ...record, distance: { value: 100, unit: 'ft' } }).success).toBe(false);
    expect(groupRecordSchema.safeParse({ ...record, bulletDiameterMm: 0 }).success).toBe(false);
    expect(groupRecordSchema.safeParse({ ...record, impacts: [{ x: 1 }] }).success).toBe(false);
    expect(groupRecordSchema.parse({ ...record, bulletDiameterMm: null }).bulletDiameterMm).toBeNull();
  });
  it('writes one CSV row per record with the recalculated results', () => {
    const csv = buildRecordsCsv([record]);
    // Spelled out rather than built from the exported list: the names and their order are what a
    // reader opens the file with, and comparing the output to its own source would pin neither.
    const header =
      'name,savedAt,distance,distanceUnit,bulletDiameterMm,shots,extremeSpreadMm,extremeSpreadOuterMm,extremeSpreadMoa,extremeSpreadMil,mpiRightMm,mpiUpMm,mpiOffsetMm,mpiOffsetMoa,meanRadiusMm,horizontalSdMm,verticalSdMm,note,impactsMm';
    expect(csv.split('\n')[0]).toBe(header);
    // One whole row, worked out by hand against the headings above: two shots 20 mm apart on each
    // axis, so the extreme spread is 20√2 = 28.28 mm centre to centre and 36.10 mm across the outside
    // of the holes, which is 0.97 MOA at 100 m. Their centre is the aim point, so the group is not
    // off at all, and each shot sits 14.14 mm from it. The values are a second list kept by hand, and
    // a column added to one and not the other shows up here as a row that no longer lines up.
    expect(buildRecordsCsv([groupRecordSchema.parse({ ...record, name: 'plain', note: 'simple' })])).toBe(
      `${header}\nplain,2026-09-22T01:02:03.000Z,100,m,7.82,2,28.28,36.1,0.97,0.28,0,0,0,0,14.14,14.14,14.14,simple,"-10,10 10,-10"`,
    );
    expect(csv).toContain('"100 m, load A"');
    // A note with a quote and a line break stays inside a single field.
    expect(csv).toContain('"メモ\n""引用"""');
    expect(buildRecordsCsv([])).toBe(header);
  });
  it('leaves the columns a record cannot fill empty', () => {
    const csv = buildRecordsCsv([
      groupRecordSchema.parse({ ...record, name: 'one', note: '', bulletDiameterMm: null, impacts: [{ x: 3, y: 4 }] }),
    ]);
    const csvRow = csv.split('\n')[1];
    if (!csvRow) throw new Error('Expected a data row in the CSV.');
    const row = csvRow.split(',');
    // No second shot and no bullet diameter: the spread columns stay empty rather than reading zero.
    expect(row.slice(4, 10)).toEqual(['', '1', '', '', '', '']);
    // The one shot is the whole group: 3 mm right and 4 mm up is 5 mm from the aim point, 0.17 MOA at 100 m.
    expect(row.slice(10, 14)).toEqual(['3', '4', '5', '0.17']);
    expect(row.slice(14, 17)).toEqual(['', '', '']);
  });
  it('keeps text a person typed from running as a spreadsheet formula', () => {
    const csv = buildRecordsCsv([groupRecordSchema.parse({ ...record, name: '=1+1', note: '@SUM(A1)\r\n+cmd' })]);
    expect(csv).toContain("'=1+1,");
    expect(csv).toContain('"\'@SUM(A1)\r\n+cmd"');
    // Measured numbers stay numbers, so the file can still be charted.
    expect(csv).toContain(',100,m,7.82,2,28.28,36.1,');
  });
});
