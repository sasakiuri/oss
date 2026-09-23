import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initialRecoilSettings, storageKey, useRecoilStore } from '@/app/(standalone)/labs/recoil/_store';
import { reportDiscardedSave, useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { calculateRecoil, type RecoilUnits } from '@/lib/recoil';

const energyOf = (id: 'a' | 'b') => {
  const { gunMassUnit, chargeMassUnit, velocityUnit } = useRecoilStore.getState();
  const units: RecoilUnits = { gunMassUnit, chargeMassUnit, velocityUnit };
  return calculateRecoil(useRecoilStore.getState()[id], units)!.energyJoules;
};

describe('recoil settings', () => {
  beforeEach(() => {
    // Resetting the store persists it, so the clear has to come last for a test to start with nothing saved.
    useRecoilStore.setState(useRecoilStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('restores both conditions and the units after a fresh session', async () => {
    const store = useRecoilStore.getState();
    store.setGunMassUnit('lb');
    store.setChargeMassUnit('grain');
    store.setVelocityUnit('fps');
    store.setLoad('a', { gunMass: 8, projectileMass: 180, wadMass: 0, powderMass: 44, velocity: 2610 });
    store.setLoad('a', { firearmType: 'rifle' });
    store.setLoad('b', { gunMass: 2.5, projectileMass: 115, powderMass: 6, velocity: 1150, firearmType: 'handgun' });
    const saved = window.localStorage.getItem(storageKey)!;
    useRecoilStore.setState(useRecoilStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useRecoilStore.persist.rehydrate();
    expect(useRecoilStore.getState()).toMatchObject({
      gunMassUnit: 'lb',
      chargeMassUnit: 'grain',
      velocityUnit: 'fps',
      a: { gunMass: 8, projectileMass: 180, powderMass: 44, velocity: 2610, firearmType: 'rifle' },
      b: { gunMass: 2.5, projectileMass: 115, velocity: 1150, firearmType: 'handgun' },
    });
  });

  it('ignores saved data of the wrong shape or out of range', async () => {
    const invalidSettings: unknown[] = [
      { a: null },
      { ...initialRecoilSettings, velocityUnit: 'kph' },
      { ...initialRecoilSettings, a: { ...initialRecoilSettings.a, gunMass: 0 } },
      { ...initialRecoilSettings, a: { ...initialRecoilSettings.a, powderMass: -1 } },
      { ...initialRecoilSettings, b: { ...initialRecoilSettings.b, firearmType: 'musket' } },
    ];
    for (const settings of invalidSettings) {
      useRecoilStore.setState(useRecoilStore.getInitialState(), true);
      window.localStorage.setItem(storageKey, JSON.stringify({ state: { language: 'en', settings }, version: 0 }));
      await useRecoilStore.persist.rehydrate();
      expect(useRecoilStore.getState()).toMatchObject({ ...initialRecoilSettings });
      // Starting over has to be visible to the user, not silent.
      expect(useStorageStatus.getState().discarded).toEqual([storageKey]);
      useStorageStatus.setState({ discarded: [] });
    }
  });

  it('says nothing about discarded data on a first visit', async () => {
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    await useRecoilStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    expect(useRecoilStore.getState()).toMatchObject(initialRecoilSettings);
  });

  it('stays quiet when another tool discards its own saved data', () => {
    reportDiscardedSave('nilay-labs-other-tool-v1');
    const { result } = renderHook(() => useDiscardedSave(storageKey));
    expect(result.current).toBe(false);
    expect(useStorageStatus.getState().discarded).toEqual(['nilay-labs-other-tool-v1']);
  });

  it('rewrites both conditions when a unit changes, so neither load changes weight', () => {
    const before = { a: energyOf('a'), b: energyOf('b') };
    const store = useRecoilStore.getState();
    store.setGunMassUnit('lb');
    expect(useRecoilStore.getState().a.gunMass).toBe(7);
    expect(useRecoilStore.getState().b.gunMass).toBe(7.5);
    store.setChargeMassUnit('grain');
    expect(useRecoilStore.getState().a.projectileMass).toBe(546.92);
    expect(useRecoilStore.getState().b.projectileMass).toBe(150);
    expect(useRecoilStore.getState().b.wadMass).toBe(0);
    store.setVelocityUnit('fps');
    expect(useRecoilStore.getState().a.velocity).toBe(1274.9);
    expect(useRecoilStore.getState().b.velocity).toBe(2799.9);
    // Each field is rounded to the digits the form shows, so the load is the same to within that rounding.
    // One decimal of a velocity in fps is the coarsest step, and it moves the energy by well under 0.1%.
    for (const id of ['a', 'b'] as const) expect(Math.abs(energyOf(id) - before[id]) / before[id]).toBeLessThan(0.001);
  });

  it('leaves a unit alone when it is set to the one already in use', () => {
    const store = useRecoilStore.getState();
    store.setLoad('a', { gunMass: 3.17514659 });
    store.setGunMassUnit('kg');
    // Reselecting the same unit must not put the value through a rounding step.
    expect(useRecoilStore.getState().a.gunMass).toBe(3.17514659);
  });

  it('copies one condition onto the other without linking them', () => {
    const store = useRecoilStore.getState();
    store.copyLoad('a');
    expect(useRecoilStore.getState().b).toEqual(initialRecoilSettings.a);
    store.setLoad('b', { velocity: 300 });
    expect(useRecoilStore.getState().a.velocity).toBe(initialRecoilSettings.a.velocity);
    store.copyLoad('b');
    expect(useRecoilStore.getState().a.velocity).toBe(300);
  });

  it('keeps the last complete settings while a numeric field is blank', async () => {
    const store = useRecoilStore.getState();
    store.setLoad('a', { gunMass: 4.2 });
    store.setLoad('b', { velocity: 900 });
    store.setLoad('a', { gunMass: NaN });
    expect(useRecoilStore.getState().a.gunMass).toBeNaN();
    const saved = window.localStorage.getItem(storageKey)!;
    useRecoilStore.setState(useRecoilStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useRecoilStore.persist.rehydrate();
    expect(useRecoilStore.getState()).toMatchObject({
      a: { gunMass: 4.2 },
      b: { velocity: 900 },
    });
  });

  it('survives drafts that no calculation can use', () => {
    const store = useRecoilStore.getState();
    expect(() => {
      store.setLoad('a', { gunMass: NaN, projectileMass: NaN, velocity: NaN });
      store.setLoad('b', { powderMass: -1 });
      store.setGunMassUnit('lb');
    }).not.toThrow();
    const { gunMassUnit, chargeMassUnit, velocityUnit, a, b } = useRecoilStore.getState();
    const units: RecoilUnits = { gunMassUnit, chargeMassUnit, velocityUnit };
    expect(calculateRecoil(a, units)).toBeNull();
    expect(calculateRecoil(b, units)).toBeNull();
    expect(useRecoilStore.getState().lastValidSettings).toEqual(initialRecoilSettings);
    store.setLoad('a', { gunMass: 7, projectileMass: 546.92, velocity: 1274.9 });
    store.setLoad('b', { powderMass: 2.53 });
    expect(useRecoilStore.getState().lastValidSettings.a.gunMass).toBe(7);
  });

  it('remains usable when browser storage rejects writes', () => {
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => useRecoilStore.getState().setLoad('a', { gunMass: 4 })).not.toThrow();
    expect(useRecoilStore.getState().a.gunMass).toBe(4);
    expect(useStorageStatus.getState().available).toBe(false);
  });
});
