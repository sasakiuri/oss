import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  initialShotPelletsSettings,
  storageKey,
  useShotPelletsStore,
} from '@/app/(standalone)/labs/shot-pellets/_store';
import { reportDiscardedSave, useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { MATERIAL_DENSITIES, summarisePellets, type PelletUnits } from '@/lib/shot-pellets';

const pelletMassOf = (id: 'a' | 'b') => {
  const state = useShotPelletsStore.getState();
  const units: PelletUnits = {
    diameterUnit: state.diameterUnit,
    shotChargeUnit: state.shotChargeUnit,
    speedUnit: state.speedUnit,
    distanceUnit: state.distanceUnit,
  };
  const conditions = {
    temperatureK: 288.15,
    pressurePa: 101325,
    densityKgPerM3: 1.225,
    densityRatio: 1,
    speedOfSoundMs: 340.3,
  };
  return summarisePellets(state[id], units, conditions, state)?.massKg ?? NaN;
};

describe('shot pellet settings', () => {
  beforeEach(() => {
    // Resetting the store persists it, so the clear has to come last for a test to start with nothing saved.
    useShotPelletsStore.setState(useShotPelletsStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('restores both loads and the units after a fresh session', async () => {
    const store = useShotPelletsStore.getState();
    store.setDiameterUnit('inch');
    store.setShotChargeUnit('oz');
    store.setSpeedUnit('fps');
    store.setDistanceUnit('yd');
    store.setLoad('a', { diameter: 0.095, density: 11.3, shotCharge: 1.125, muzzleSpeed: 1200 });
    store.setReferenceDistance(40);
    const saved = window.localStorage.getItem(storageKey)!;
    useShotPelletsStore.setState(useShotPelletsStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useShotPelletsStore.persist.rehydrate();
    expect(useShotPelletsStore.getState()).toMatchObject({
      diameterUnit: 'inch',
      shotChargeUnit: 'oz',
      speedUnit: 'fps',
      distanceUnit: 'yd',
      referenceDistance: 40,
      a: { diameter: 0.095, shotCharge: 1.125, muzzleSpeed: 1200 },
    });
  });

  it('ignores saved data of the wrong shape or out of range', async () => {
    const invalidSettings: unknown[] = [
      { a: null },
      { ...initialShotPelletsSettings, speedUnit: 'kph' },
      { ...initialShotPelletsSettings, a: { ...initialShotPelletsSettings.a, diameter: 0 } },
      { ...initialShotPelletsSettings, b: { ...initialShotPelletsSettings.b, density: -1 } },
      { ...initialShotPelletsSettings, step: 0 },
    ];
    for (const settings of invalidSettings) {
      useShotPelletsStore.setState(useShotPelletsStore.getInitialState(), true);
      window.localStorage.setItem(storageKey, JSON.stringify({ state: { language: 'en', settings }, version: 0 }));
      await useShotPelletsStore.persist.rehydrate();
      expect(useShotPelletsStore.getState()).toMatchObject({ ...initialShotPelletsSettings });
      // Starting over has to be visible to the user, not silent.
      expect(useStorageStatus.getState().discarded).toEqual([storageKey]);
      useStorageStatus.setState({ discarded: [] });
    }
  });

  it('says nothing about discarded data on a first visit', async () => {
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    await useShotPelletsStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    expect(useShotPelletsStore.getState()).toMatchObject(initialShotPelletsSettings);
  });

  it('stays quiet when another tool discards its own saved data', () => {
    reportDiscardedSave('nilay-labs-other-tool-v1');
    const { result } = renderHook(() => useDiscardedSave(storageKey));
    expect(result.current).toBe(false);
  });

  it('rewrites both loads when a pellet or load unit changes, so neither pellet changes', () => {
    const before = { a: pelletMassOf('a'), b: pelletMassOf('b') };
    const store = useShotPelletsStore.getState();
    store.setDiameterUnit('inch');
    expect(useShotPelletsStore.getState().a.diameter).toBe(0.0949);
    expect(useShotPelletsStore.getState().b.diameter).toBe(0.0949);
    store.setShotChargeUnit('oz');
    expect(useShotPelletsStore.getState().a.shotCharge).toBe(0.9877);
    store.setSpeedUnit('fps');
    expect(useShotPelletsStore.getState().a.muzzleSpeed).toBe(1312);
    // Each field is rounded to the digits the form shows, so the pellet is the same to within that.
    for (const id of ['a', 'b'] as const)
      expect(Math.abs(pelletMassOf(id) - before[id]) / before[id]).toBeLessThan(0.002);
  });

  it('leaves the table alone when the distance unit changes, because it names the scale', () => {
    const store = useShotPelletsStore.getState();
    store.setDistanceUnit('yd');
    expect(useShotPelletsStore.getState()).toMatchObject({
      distanceUnit: 'yd',
      step: initialShotPelletsSettings.step,
      maxRange: initialShotPelletsSettings.maxRange,
      referenceDistance: initialShotPelletsSettings.referenceDistance,
    });
  });

  it('leaves a unit alone when it is set to the one already in use', () => {
    const store = useShotPelletsStore.getState();
    store.setLoad('a', { diameter: 2.4136529 });
    store.setDiameterUnit('mm');
    // Reselecting the same unit must not put the value through a rounding step.
    expect(useShotPelletsStore.getState().a.diameter).toBe(2.4136529);
  });

  it('writes a diameter into the field from a shot number, in the unit in use', () => {
    const store = useShotPelletsStore.getState();
    store.applyShotNumber('a', 6);
    // (17 - 6)/100 inch is 0.11 inch, which is 2.794 mm.
    expect(useShotPelletsStore.getState().a.diameter).toBe(2.794);
    store.setDiameterUnit('inch');
    store.applyShotNumber('b', 9);
    expect(useShotPelletsStore.getState().b.diameter).toBe(0.08);
    // The other load is left where it was: a number fills one field, not both.
    expect(useShotPelletsStore.getState().a.diameter).toBe(0.11);
  });

  it('writes a density into the field from a material', () => {
    const store = useShotPelletsStore.getState();
    store.applyMaterial('a', 'bismuth');
    expect(useShotPelletsStore.getState().a.density).toBe(MATERIAL_DENSITIES.bismuth);
    store.setLoad('a', { density: 10.2 });
    expect(useShotPelletsStore.getState().a.density).toBe(10.2);
  });

  it('copies one load onto the other without linking them', () => {
    const store = useShotPelletsStore.getState();
    store.copyLoad('a');
    expect(useShotPelletsStore.getState().b).toEqual(initialShotPelletsSettings.a);
    store.setLoad('b', { muzzleSpeed: 380 });
    expect(useShotPelletsStore.getState().a.muzzleSpeed).toBe(initialShotPelletsSettings.a.muzzleSpeed);
    store.copyLoad('b');
    expect(useShotPelletsStore.getState().a.muzzleSpeed).toBe(380);
  });

  it('keeps the last complete settings while a numeric field is blank', async () => {
    const store = useShotPelletsStore.getState();
    store.setLoad('a', { muzzleSpeed: 420 });
    store.setLoad('a', { diameter: NaN });
    expect(useShotPelletsStore.getState().a.diameter).toBeNaN();
    const saved = window.localStorage.getItem(storageKey)!;
    useShotPelletsStore.setState(useShotPelletsStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useShotPelletsStore.persist.rehydrate();
    expect(useShotPelletsStore.getState()).toMatchObject({ a: { muzzleSpeed: 420, diameter: 2.41 } });
  });

  it('survives drafts that no calculation can use', () => {
    const store = useShotPelletsStore.getState();
    expect(() => {
      store.setLoad('a', { diameter: NaN, density: NaN, shotCharge: NaN });
      store.setStep(NaN);
      store.setDiameterUnit('inch');
    }).not.toThrow();
    expect(pelletMassOf('a')).toBeNaN();
    expect(useShotPelletsStore.getState().lastValidSettings).toEqual(initialShotPelletsSettings);
  });

  it('remains usable when browser storage rejects writes', () => {
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => useShotPelletsStore.getState().setLoad('a', { muzzleSpeed: 410 })).not.toThrow();
    expect(useShotPelletsStore.getState().a.muzzleSpeed).toBe(410);
    expect(useStorageStatus.getState().available).toBe(false);
  });
});
