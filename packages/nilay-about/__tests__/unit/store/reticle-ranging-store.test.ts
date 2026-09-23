import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  initialReticleRangingSettings,
  storageKey,
  useReticleRangingStore,
} from '@/app/(standalone)/labs/reticle-ranging/_store';
import { reportDiscardedSave, useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { calculateReticleRanging } from '@/lib/reticle-ranging';

const settings = () => {
  const { solveFor, targetSize, apparent, distance, focalPlane, magnification } = useReticleRangingStore.getState();
  return { solveFor, targetSize, apparent, distance, focalPlane, magnification };
};

describe('reticle ranging settings', () => {
  beforeEach(() => {
    // Resetting the store persists it, so the clear has to come last for a test to start with nothing saved.
    useReticleRangingStore.setState(useReticleRangingStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('restores the direction, the values and the units after a fresh session', async () => {
    const store = useReticleRangingStore.getState();
    store.setSolveFor('size');
    store.setTargetSize({ value: 18, unit: 'inch' });
    store.setApparent({ value: 3.5, unit: 'moa' });
    store.setDistance({ value: 250, unit: 'yd' });
    store.setFocalPlane('sfp');
    store.setMagnification({ calibration: 12, used: 6 });
    const saved = window.localStorage.getItem(storageKey)!;
    useReticleRangingStore.setState(useReticleRangingStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useReticleRangingStore.persist.rehydrate();
    expect(useReticleRangingStore.getState()).toMatchObject({
      solveFor: 'size',
      targetSize: { value: 18, unit: 'inch' },
      apparent: { value: 3.5, unit: 'moa' },
      distance: { value: 250, unit: 'yd' },
      focalPlane: 'sfp',
      magnification: { calibration: 12, used: 6 },
    });
  });

  it('ignores saved data of the wrong shape or out of range', async () => {
    const invalidSettings: unknown[] = [
      { targetSize: null },
      { ...initialReticleRangingSettings, apparent: { value: 0, unit: 'mil' } },
      { ...initialReticleRangingSettings, apparent: { value: 2, unit: 'mrad' } },
      { ...initialReticleRangingSettings, solveFor: 'range' },
      { ...initialReticleRangingSettings, focalPlane: 'third' },
      { ...initialReticleRangingSettings, magnification: { calibration: 0, used: 6 } },
    ];
    for (const saved of invalidSettings) {
      useReticleRangingStore.setState(useReticleRangingStore.getInitialState(), true);
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ state: { language: 'en', settings: saved }, version: 0 }),
      );
      await useReticleRangingStore.persist.rehydrate();
      expect(useReticleRangingStore.getState()).toMatchObject({ ...initialReticleRangingSettings });
      // Starting over has to be visible to the user, not silent.
      expect(useStorageStatus.getState().discarded).toEqual([storageKey]);
      useStorageStatus.setState({ discarded: [] });
    }
  });

  it('says nothing about discarded data on a first visit', async () => {
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    await useReticleRangingStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    expect(useReticleRangingStore.getState()).toMatchObject(initialReticleRangingSettings);
  });

  it('stays quiet when another tool discards its own saved data', () => {
    reportDiscardedSave('nilay-labs-other-tool-v1');
    const { result } = renderHook(() => useDiscardedSave(storageKey));
    expect(result.current).toBe(false);
    expect(useStorageStatus.getState().discarded).toEqual(['nilay-labs-other-tool-v1']);
  });

  it('keeps all three quantities so switching direction does not lose what was typed', () => {
    const store = useReticleRangingStore.getState();
    store.setTargetSize({ value: 45, unit: 'cm' });
    store.setApparent({ value: 1.5, unit: 'mil' });
    store.setDistance({ value: 280, unit: 'm' });
    store.setSolveFor('size');
    store.setSolveFor('apparent');
    store.setSolveFor('distance');
    expect(settings()).toMatchObject({
      targetSize: { value: 45, unit: 'cm' },
      apparent: { value: 1.5, unit: 'mil' },
      distance: { value: 280, unit: 'm' },
    });
    // The defaults describe one triangle, so the opening values agree whichever way round they are read.
    useReticleRangingStore.setState(useReticleRangingStore.getInitialState(), true);
    const ranged = calculateReticleRanging(settings())!;
    expect(ranged.distanceMeters).toBeCloseTo(initialReticleRangingSettings.distance.value, 2);
  });

  it('rereads a unit change rather than converting the number', () => {
    const store = useReticleRangingStore.getState();
    store.setDistance({ value: 500, unit: 'yd' });
    expect(settings().distance).toEqual({ value: 500, unit: 'yd' });
    store.setTargetSize({ value: 100, unit: 'm' });
    expect(settings().targetSize).toEqual({ value: 100, unit: 'm' });
    store.setApparent({ value: 2, unit: 'moa' });
    expect(settings().apparent).toEqual({ value: 2, unit: 'moa' });
  });

  it('keeps the last complete settings while a numeric field is blank', async () => {
    const store = useReticleRangingStore.getState();
    store.setTargetSize({ value: 60, unit: 'cm' });
    store.setApparent({ value: 1.2, unit: 'mil' });
    store.setApparent({ value: NaN, unit: 'mil' });
    expect(useReticleRangingStore.getState().apparent.value).toBeNaN();
    const saved = window.localStorage.getItem(storageKey)!;
    useReticleRangingStore.setState(useReticleRangingStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useReticleRangingStore.persist.rehydrate();
    expect(useReticleRangingStore.getState()).toMatchObject({
      targetSize: { value: 60, unit: 'cm' },
      apparent: { value: 1.2, unit: 'mil' },
    });
  });

  it('survives drafts that no calculation can use', () => {
    const store = useReticleRangingStore.getState();
    expect(() => {
      store.setTargetSize({ value: NaN, unit: 'cm' });
      store.setApparent({ value: NaN, unit: 'mil' });
      store.setMagnification({ calibration: NaN, used: NaN });
    }).not.toThrow();
    expect(calculateReticleRanging(settings())).toBeNull();
    expect(useReticleRangingStore.getState().lastValidSettings).toEqual(initialReticleRangingSettings);
    // An unusable magnification is harmless until the reticle is declared to be second focal plane.
    store.setTargetSize({ value: 90, unit: 'cm' });
    store.setApparent({ value: 3, unit: 'mil' });
    expect(calculateReticleRanging(settings())).not.toBeNull();
    store.setFocalPlane('sfp');
    expect(calculateReticleRanging(settings())).toBeNull();
    store.setMagnification({ calibration: 10, used: 5 });
    expect(calculateReticleRanging(settings())!.scale).toBe(2);
    expect(useReticleRangingStore.getState().lastValidSettings.targetSize).toEqual({ value: 90, unit: 'cm' });
  });

  it('remains usable when browser storage rejects writes', () => {
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => useReticleRangingStore.getState().setApparent({ value: 4, unit: 'mil' })).not.toThrow();
    expect(useReticleRangingStore.getState().apparent.value).toBe(4);
    expect(useStorageStatus.getState().available).toBe(false);
  });
});
