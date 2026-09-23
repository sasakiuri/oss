import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initialTruingSettings, storageKey, useTruingStore } from '@/app/(standalone)/labs/trajectory-truing/_store';
import { reportDiscardedSave, useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { TRUING_MEASUREMENT_LIMIT } from '@/lib/schemas/trajectory-truing';

const reopen = async () => {
  const saved = window.localStorage.getItem(storageKey)!;
  useTruingStore.setState(useTruingStore.getInitialState(), true);
  window.localStorage.setItem(storageKey, saved);
  await useTruingStore.persist.rehydrate();
};

describe('truing settings', () => {
  beforeEach(() => {
    // Resetting the store persists it, so the clear has to come last for a test to start with nothing saved.
    useTruingStore.setState(useTruingStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('restores the load and the groups after a fresh session', async () => {
    const store = useTruingStore.getState();
    store.setSpeedUnit('fps');
    store.setMuzzleSpeed(2750);
    store.setBallisticCoefficient(0.31);
    store.setDragModel('g7');
    store.setDistanceUnit('yd');
    store.setZeroDistance(200);
    store.setReading('mil');
    store.setTarget('muzzle-speed');
    store.setTolerance(2);
    await reopen();
    expect(useTruingStore.getState()).toMatchObject({
      muzzleSpeed: { value: 2750, unit: 'fps' },
      ballisticCoefficient: 0.31,
      dragModel: 'g7',
      distanceUnit: 'yd',
      zeroDistance: 200,
      reading: 'mil',
      target: 'muzzle-speed',
      tolerance: 2,
      measurements: initialTruingSettings.measurements,
    });
  });

  it('ignores saved data of the wrong shape or out of range', async () => {
    const invalidSettings: unknown[] = [
      { measurements: null },
      { ...initialTruingSettings, ballisticCoefficient: 3 },
      { ...initialTruingSettings, ballisticCoefficient: 0 },
      { ...initialTruingSettings, muzzleSpeed: { value: 0, unit: 'mps' } },
      { ...initialTruingSettings, zeroDistance: 0 },
      { ...initialTruingSettings, tolerance: 0 },
      // Finer than the solve itself resolves, so it would be decided by the arithmetic.
      { ...initialTruingSettings, tolerance: 0.05, dropUnit: 'cm' },
      { ...initialTruingSettings, tolerance: 0.03, dropUnit: 'inch' },
      { ...initialTruingSettings, reading: 'clicks' },
      { ...initialTruingSettings, target: 'both' },
      { ...initialTruingSettings, measurements: [{ id: 'a', distance: 0, drop: 10 }] },
      { ...initialTruingSettings, measurements: [{ id: '', distance: 100, drop: 10 }] },
      {
        ...initialTruingSettings,
        measurements: Array.from({ length: TRUING_MEASUREMENT_LIMIT + 1 }, (_, index) => ({
          id: `row-${index}`,
          distance: 100,
          drop: 10,
        })),
      },
    ];
    for (const settings of invalidSettings) {
      useTruingStore.setState(useTruingStore.getInitialState(), true);
      window.localStorage.setItem(storageKey, JSON.stringify({ state: { language: 'en', settings }, version: 0 }));
      await useTruingStore.persist.rehydrate();
      expect(useTruingStore.getState()).toMatchObject({ ...initialTruingSettings });
      // Starting over has to be visible to the user, not silent.
      expect(useStorageStatus.getState().discarded).toEqual([storageKey]);
      useStorageStatus.setState({ discarded: [] });
    }
  });

  it('says nothing about discarded data on a first visit', async () => {
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    await useTruingStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    expect(useTruingStore.getState()).toMatchObject(initialTruingSettings);
  });

  it('stays quiet when another tool discards its own saved data', () => {
    reportDiscardedSave('nilay-labs-other-tool-v1');
    const { result } = renderHook(() => useDiscardedSave(storageKey));
    expect(result.current).toBe(false);
    expect(useStorageStatus.getState().discarded).toEqual(['nilay-labs-other-tool-v1']);
  });

  it('rewrites a velocity when its unit changes, so the load stays the same load', () => {
    useTruingStore.getState().setSpeedUnit('fps');
    expect(useTruingStore.getState().muzzleSpeed.value).toBeCloseTo(2624.7, 1);
    useTruingStore.getState().setSpeedUnit('mps');
    expect(useTruingStore.getState().muzzleSpeed.value).toBeCloseTo(800, 6);
  });

  it('rewrites the sight height when its unit changes', () => {
    useTruingStore.getState().setSightHeightUnit('inch');
    expect(useTruingStore.getState().sightHeight.value).toBeCloseTo(1.772, 3);
    useTruingStore.getState().setSightHeightUnit('mm');
    expect(useTruingStore.getState().sightHeight.value).toBeCloseTo(45, 6);
  });

  it('leaves a unit alone when it is set to the one already in use', () => {
    const store = useTruingStore.getState();
    store.setMuzzleSpeed(800.00000001);
    store.setSpeedUnit('mps');
    // Reselecting the same unit must not put the value through a rounding step.
    expect(useTruingStore.getState().muzzleSpeed.value).toBe(800.00000001);
  });

  it('leaves the measurements alone when the distance unit changes', () => {
    // The unit names what the numbers in the table mean, and the shooter retypes them: rewriting
    // 300 m into 328 yd would claim a measurement that was never made at that distance.
    useTruingStore.getState().setDistanceUnit('yd');
    expect(useTruingStore.getState().measurements).toEqual(initialTruingSettings.measurements);
    expect(useTruingStore.getState().zeroDistance).toBe(initialTruingSettings.zeroDistance);
  });

  it('adds, edits and removes rows', () => {
    const store = useTruingStore.getState();
    store.addMeasurement();
    const added = useTruingStore.getState().measurements.at(-1)!;
    expect(added.distance).toBeNaN();
    store.updateMeasurement(added.id, { distance: 500, drop: 210 });
    expect(useTruingStore.getState().measurements.at(-1)).toMatchObject({ distance: 500, drop: 210 });
    store.removeMeasurement(added.id);
    expect(useTruingStore.getState().measurements).toEqual(initialTruingSettings.measurements);
  });

  it('edits the row it was asked for and leaves the others alone', () => {
    const store = useTruingStore.getState();
    const [first, second] = useTruingStore.getState().measurements;
    store.updateMeasurement(second!.id, { drop: 140 });
    expect(useTruingStore.getState().measurements[0]).toEqual(first);
    expect(useTruingStore.getState().measurements[1]).toMatchObject({ id: second!.id, drop: 140 });
  });

  it('stops adding rows at the limit', () => {
    const store = useTruingStore.getState();
    for (let count = 0; count < TRUING_MEASUREMENT_LIMIT + 3; count += 1) store.addMeasurement();
    expect(useTruingStore.getState().measurements).toHaveLength(TRUING_MEASUREMENT_LIMIT);
  });

  it('keeps the last complete settings while a row is half typed', async () => {
    const store = useTruingStore.getState();
    store.setTolerance(3);
    store.addMeasurement();
    expect(useTruingStore.getState().measurements).toHaveLength(3);
    await reopen();
    // The blank row was never a measurement, so it is not what comes back.
    expect(useTruingStore.getState()).toMatchObject({
      tolerance: 3,
      measurements: initialTruingSettings.measurements,
    });
  });

  it('writes a solved value back into the load as given, in the unit the form is in', () => {
    const store = useTruingStore.getState();
    store.applyFitted('ballistic-coefficient', 0.322);
    expect(useTruingStore.getState().ballisticCoefficient).toBe(0.322);
    store.applyFitted('muzzle-speed', 780);
    expect(useTruingStore.getState().muzzleSpeed).toEqual({ value: 780, unit: 'mps' });
    store.setSpeedUnit('fps');
    store.applyFitted('muzzle-speed', 2560);
    // No conversion on the way in: the screen showed feet per second, so that is what it writes.
    expect(useTruingStore.getState().muzzleSpeed).toEqual({ value: 2560, unit: 'fps' });
  });

  it('survives drafts that no solve can use', () => {
    const store = useTruingStore.getState();
    expect(() => {
      store.setMuzzleSpeed(NaN);
      store.setZeroDistance(NaN);
      store.setTolerance(NaN);
    }).not.toThrow();
    expect(useTruingStore.getState().lastValidSettings).toEqual(initialTruingSettings);
    store.setMuzzleSpeed(820);
    store.setZeroDistance(100);
    store.setTolerance(1);
    expect(useTruingStore.getState().lastValidSettings.muzzleSpeed.value).toBe(820);
  });

  it('remains usable when browser storage rejects writes', () => {
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => useTruingStore.getState().setZeroDistance(150)).not.toThrow();
    expect(useTruingStore.getState().zeroDistance).toBe(150);
    expect(useStorageStatus.getState().available).toBe(false);
  });
});
