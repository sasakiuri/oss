import { beforeEach, describe, expect, it } from 'vitest';

import {
  defaultMarkerSpacing,
  selectFrame,
  selectPhotoGroups,
  storageKey,
  useShotGroupStore,
} from '@/app/(standalone)/labs/shot-group/_store';
import { useStorageStatus } from '@/lib/browser-storage';
import { applyHomography, type Homography, type Quad } from '@/lib/homography';
import { measureImpact, sheetFrame, type Point } from '@/lib/shot-group';

const store = () => useShotGroupStore.getState();

/** A made-up camera looking at an A4 sheet from low and to one side. Sheet millimetres in, photo pixels out. */
const camera: Homography = [3.1, 0.4, 150, -0.2, 2.6, 120, 0.0011, -0.0004, 1];
const photo = (point: Point) => applyHomography(camera, point)!;
const marks = (): Quad => [
  photo({ x: 0, y: 0 }),
  photo({ x: defaultMarkerSpacing.width, y: 0 }),
  photo({ x: defaultMarkerSpacing.width, y: defaultMarkerSpacing.height }),
  photo({ x: 0, y: defaultMarkerSpacing.height }),
];
const useMarks = () => {
  store().setCalibrationMode('corners');
  marks().forEach((point, index) => store().setCorner(index as 0 | 1 | 2 | 3, point));
};

describe('shot group read through the corner marks', () => {
  beforeEach(() => {
    useShotGroupStore.setState(useShotGroupStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('opens on the A4 mark spacing the practice target maker prints', () => {
    expect(defaultMarkerSpacing).toEqual({ width: 186, height: 273 });
    expect(store().calibrationMode).toBe('two-point');
  });

  it('measures true millimetres on a sheet photographed at an angle', () => {
    useMarks();
    store().setAim(photo({ x: 93, y: 100 }));
    // Holes 20 mm right of and 30 mm below the aim point on the paper, wherever the camera stood.
    store().addImpact(photo({ x: 113, y: 100 }));
    store().addImpact(photo({ x: 93, y: 130 }));
    const frame = selectFrame(store())!;
    expect(frame.kind).toBe('sheet');
    const [right, low] = store().impacts.map((impact) => measureImpact(impact, store().aim, frame)!);
    expect(right!.x).toBeCloseTo(20, 6);
    expect(right!.y).toBeCloseTo(0, 6);
    expect(low!.x).toBeCloseTo(0, 6);
    expect(low!.y).toBeCloseTo(-30, 6);
    // A plain scale from two of the same points would not agree, because the photo is foreshortened.
    const a = photo({ x: 0, y: 0 });
    const b = photo({ x: 186, y: 0 });
    const naive = 186 / Math.hypot(b.x - a.x, b.y - a.y);
    const lowPoint = store().impacts[1]!;
    expect(Math.abs((lowPoint.y - store().aim.y) * naive - 30)).toBeGreaterThan(1);
  });

  it('adds by offset, saves in millimetres and loads back onto the photo', () => {
    useMarks();
    store().setAim(photo({ x: 60, y: 200 }));
    expect(store().addImpactAtOffset({ x: 12, y: 8 })).toBe(true);
    expect(store().saveRecord('ladder 1')).toBe(true);
    const saved = store().records[0]!.impacts[0]!;
    expect(saved.x).toBeCloseTo(12, 6);
    expect(saved.y).toBeCloseTo(8, 6);
    store().clearImpacts();
    expect(store().loadRecord(store().records[0]!.id)).toBe(true);
    const back = store().impacts[0]!;
    const expected = photo({ x: 72, y: 192 });
    expect(back.x).toBeCloseTo(expected.x, 6);
    expect(back.y).toBeCloseTo(expected.y, 6);
  });

  it('reads nothing while the marks are out of order or the spacing is missing', () => {
    const [topLeft, topRight, bottomRight, bottomLeft] = marks();
    expect(sheetFrame([topRight, topLeft, bottomRight, bottomLeft], defaultMarkerSpacing)).toBeNull();
    expect(sheetFrame([topLeft, topRight, bottomRight, bottomLeft], { width: 0, height: 273 })).toBeNull();
    useMarks();
    store().setMarkerSpacing({ width: Number.NaN, height: 273 });
    expect(selectFrame(store())).toBeNull();
    expect(store().addImpactAtOffset({ x: 1, y: 1 })).toBe(false);
    expect(store().saveRecord('none')).toBe(false);
  });

  it('keeps the way the scale is set and the mark spacing, and reads a save from before them', async () => {
    store().setCalibrationMode('corners');
    store().setMarkerSpacing({ width: 191.9, height: 255.4 });
    store().setMarkerSpacing({ width: Number.NaN, height: 255.4 });
    const saved = JSON.parse(window.localStorage.getItem(storageKey)!);
    expect(saved.state.sheet).toEqual({ mode: 'corners', spacing: { width: 191.9, height: 255.4 } });

    useShotGroupStore.setState(useShotGroupStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, JSON.stringify(saved));
    await useShotGroupStore.persist.rehydrate();
    expect(store()).toMatchObject({ calibrationMode: 'corners', markerSpacing: { width: 191.9, height: 255.4 } });

    const older = JSON.parse(JSON.stringify(saved));
    delete older.state.sheet;
    useShotGroupStore.setState(useShotGroupStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, JSON.stringify(older));
    await useShotGroupStore.persist.rehydrate();
    expect(store()).toMatchObject({ calibrationMode: 'two-point', markerSpacing: defaultMarkerSpacing });
    expect(useStorageStatus.getState().discarded).toEqual([]);
  });
});

describe('several groups on one photo', () => {
  beforeEach(() => {
    useShotGroupStore.setState(useShotGroupStore.getInitialState(), true);
    window.localStorage.clear();
  });

  it('keeps a finished group and starts the next one at the same aim point', () => {
    store().setAim({ x: 200, y: 300 });
    store().addImpact({ x: 210, y: 305 });
    store().startNextGroup();
    expect(store().impacts).toEqual([]);
    expect(store().aim).toEqual({ x: 200, y: 300 });
    store().setAim({ x: 800, y: 300 });
    store().addImpact({ x: 790, y: 310 });
    const groups = selectPhotoGroups(store());
    expect(groups.map((group) => [group.current, group.aim.x, group.impacts.length])).toEqual([
      [false, 200, 1],
      [true, 800, 1],
    ]);
  });

  it('switches the group being edited without changing the order', () => {
    store().setAim({ x: 100, y: 100 });
    store().startNextGroup();
    store().setAim({ x: 500, y: 100 });
    store().startNextGroup();
    store().setAim({ x: 900, y: 100 });
    const first = store().otherGroups[0]!;
    store().selectGroup(first.id);
    expect(store().aim).toEqual({ x: 100, y: 100 });
    expect(selectPhotoGroups(store()).map((group) => [group.current, group.aim.x])).toEqual([
      [true, 100],
      [false, 500],
      [false, 900],
    ]);
    const last = store().otherGroups[1]!;
    store().removeGroup(last.id);
    expect(selectPhotoGroups(store()).map((group) => group.aim.x)).toEqual([100, 500]);
  });

  it('gives each detected hole to the group whose aim point is nearest', () => {
    store().setAim({ x: 100, y: 100 });
    store().startNextGroup();
    store().setAim({ x: 500, y: 100 });
    store().replaceImpacts([
      { x: 110, y: 90 },
      { x: 480, y: 120 },
      { x: 520, y: 95 },
      { x: Number.NaN, y: 1 },
    ]);
    const groups = selectPhotoGroups(store());
    expect(groups[0]!.impacts.map((impact) => impact.x)).toEqual([110]);
    expect(groups[1]!.impacts.map((impact) => impact.x)).toEqual([480, 520]);
  });

  it('clears every group with a new photo or a reset', () => {
    store().startNextGroup();
    store().setImage({ width: 800, height: 600 });
    expect(store().otherGroups).toEqual([]);
    store().startNextGroup();
    store().reset();
    expect(store().otherGroups).toEqual([]);
    expect(store().groupIndex).toBe(0);
  });
});
