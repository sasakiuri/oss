import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initialMaxRangeSettings, storageKey, useMaxRangeStore } from '@/app/(standalone)/labs/max-range/_store';
import { reportDiscardedSave, useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { calculateMaxRange, type MaxRangeSettings } from '@/lib/max-range';

const settingsOf = (): MaxRangeSettings => {
  const { kind, bullet, sphere, muzzleSpeed, launchHeight, elevationDegrees, distanceUnit, atmosphere } =
    useMaxRangeStore.getState();
  return { kind, bullet, sphere, muzzleSpeed, launchHeight, elevationDegrees, distanceUnit, atmosphere };
};

const rangeNow = () => calculateMaxRange(settingsOf())?.maximum?.flight.rangeMeters ?? NaN;

describe('maximum range settings', () => {
  beforeEach(() => {
    // Resetting the store persists it, so the clear has to come last for a test to start with nothing saved.
    useMaxRangeStore.setState(useMaxRangeStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('restores the projectile and the shot after a fresh session', async () => {
    const store = useMaxRangeStore.getState();
    store.setKind('bullet');
    store.setBullet({ ballisticCoefficient: 0.45, dragModel: 'g1' });
    store.setMassUnit('grain');
    store.setSpeedUnit('fps');
    store.setMuzzleSpeed(2750);
    store.setElevation(22);
    store.setLaunchHeight(3);
    store.setDistanceUnit('yd');
    const saved = window.localStorage.getItem(storageKey)!;
    useMaxRangeStore.setState(useMaxRangeStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useMaxRangeStore.persist.rehydrate();
    expect(useMaxRangeStore.getState()).toMatchObject({
      kind: 'bullet',
      bullet: { ballisticCoefficient: 0.45, dragModel: 'g1', mass: { unit: 'grain' } },
      muzzleSpeed: { value: 2750, unit: 'fps' },
      launchHeight: { value: 3, unit: 'm' },
      elevationDegrees: 22,
      distanceUnit: 'yd',
    });
  });

  it('keeps the projectile that is not in use, so switching back brings it whole', async () => {
    const store = useMaxRangeStore.getState();
    store.setSphere({ densityKgPerM3: 7850 });
    store.setKind('bullet');
    store.setBullet({ ballisticCoefficient: 0.31 });
    const saved = window.localStorage.getItem(storageKey)!;
    useMaxRangeStore.setState(useMaxRangeStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useMaxRangeStore.persist.rehydrate();
    useMaxRangeStore.getState().setKind('sphere');
    expect(useMaxRangeStore.getState().sphere.densityKgPerM3).toBe(7850);
    expect(useMaxRangeStore.getState().bullet.ballisticCoefficient).toBe(0.31);
  });

  it('ignores saved data of the wrong shape or out of range', async () => {
    const invalidSettings: unknown[] = [
      { sphere: null },
      { ...initialMaxRangeSettings, kind: 'arrow' },
      { ...initialMaxRangeSettings, elevationDegrees: 120 },
      { ...initialMaxRangeSettings, elevationDegrees: -5 },
      { ...initialMaxRangeSettings, muzzleSpeed: { value: 0, unit: 'mps' } },
      { ...initialMaxRangeSettings, launchHeight: { value: -1, unit: 'm' } },
      {
        ...initialMaxRangeSettings,
        sphere: { ...initialMaxRangeSettings.sphere, densityKgPerM3: 0 },
      },
      {
        ...initialMaxRangeSettings,
        bullet: { ...initialMaxRangeSettings.bullet, ballisticCoefficient: 3 },
      },
    ];
    for (const settings of invalidSettings) {
      useMaxRangeStore.setState(useMaxRangeStore.getInitialState(), true);
      window.localStorage.setItem(storageKey, JSON.stringify({ state: { language: 'en', settings }, version: 0 }));
      await useMaxRangeStore.persist.rehydrate();
      expect(useMaxRangeStore.getState()).toMatchObject({ ...initialMaxRangeSettings });
      // Starting over has to be visible to the user, not silent.
      expect(useStorageStatus.getState().discarded).toEqual([storageKey]);
      useStorageStatus.setState({ discarded: [] });
    }
  });

  it('says nothing about discarded data on a first visit', async () => {
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    await useMaxRangeStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    expect(useMaxRangeStore.getState()).toMatchObject(initialMaxRangeSettings);
  });

  it('stays quiet when another tool discards its own saved data', () => {
    reportDiscardedSave('nilay-labs-other-tool-v1');
    const { result } = renderHook(() => useDiscardedSave(storageKey));
    expect(result.current).toBe(false);
    expect(useStorageStatus.getState().discarded).toEqual(['nilay-labs-other-tool-v1']);
  });

  it('rewrites a field when its unit changes, so the shot stays the same shot', () => {
    const before = rangeNow();
    const store = useMaxRangeStore.getState();
    store.setSpeedUnit('fps');
    expect(useMaxRangeStore.getState().muzzleSpeed.value).toBeCloseTo(1246.7, 1);
    store.setDiameterUnit('inch');
    expect(useMaxRangeStore.getState().sphere.diameter.value).toBeCloseTo(0.0945, 4);
    store.setHeightUnit('ft');
    expect(useMaxRangeStore.getState().launchHeight.value).toBeCloseTo(4.92, 2);
    // Each field is rounded to the digits the form shows, so the shot is the same to within
    // that rounding: the diameter in inches is the coarsest step and it still barely moves.
    expect(Math.abs(rangeNow() - before) / before).toBeLessThan(0.005);
  });

  it('leaves a unit alone when it is set to the one already in use', () => {
    const store = useMaxRangeStore.getState();
    store.setSphere({ diameter: { value: 2.41290001, unit: 'mm' } });
    store.setDiameterUnit('mm');
    // Reselecting the same unit must not put the value through a rounding step.
    expect(useMaxRangeStore.getState().sphere.diameter.value).toBe(2.41290001);
  });

  it('reads the answer in another unit without touching the shot', () => {
    const before = rangeNow();
    useMaxRangeStore.getState().setDistanceUnit('yd');
    // The distance unit is how the answer is read, not what was fired.
    expect(rangeNow()).toBe(before);
  });

  it('keeps the last complete settings while a numeric field is blank', async () => {
    const store = useMaxRangeStore.getState();
    store.setElevation(40);
    store.setMuzzleSpeed(NaN);
    expect(useMaxRangeStore.getState().muzzleSpeed.value).toBeNaN();
    const saved = window.localStorage.getItem(storageKey)!;
    useMaxRangeStore.setState(useMaxRangeStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useMaxRangeStore.persist.rehydrate();
    expect(useMaxRangeStore.getState()).toMatchObject({
      elevationDegrees: 40,
      muzzleSpeed: { value: initialMaxRangeSettings.muzzleSpeed.value },
    });
  });

  it('survives drafts that no calculation can use', () => {
    const store = useMaxRangeStore.getState();
    expect(() => {
      store.setMuzzleSpeed(NaN);
      store.setSphere({ densityKgPerM3: NaN });
      store.setElevation(NaN);
      store.setSpeedUnit('fps');
    }).not.toThrow();
    expect(calculateMaxRange(settingsOf())).toBeNull();
    expect(useMaxRangeStore.getState().lastValidSettings).toEqual(initialMaxRangeSettings);
    store.setMuzzleSpeed(380);
    store.setSphere({ densityKgPerM3: 11340 });
    store.setElevation(30);
    expect(useMaxRangeStore.getState().lastValidSettings.muzzleSpeed.value).toBe(380);
  });

  it('remains usable when browser storage rejects writes', () => {
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => useMaxRangeStore.getState().setElevation(12)).not.toThrow();
    expect(useMaxRangeStore.getState().elevationDegrees).toBe(12);
    expect(useStorageStatus.getState().available).toBe(false);
  });
});
