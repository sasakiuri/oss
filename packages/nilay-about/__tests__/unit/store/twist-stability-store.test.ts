import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  initialTwistStabilitySettings,
  storageKey,
  useTwistStabilityStore,
} from '@/app/(standalone)/labs/twist-stability/_store';
import { reportDiscardedSave, useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { calculateTwistStability } from '@/lib/twist-stability';

const stabilityNow = () => calculateTwistStability(useTwistStabilityStore.getState())!.stability;

describe('twist and stability settings', () => {
  beforeEach(() => {
    // Resetting the store persists it, so the clear has to come last for a test to start with nothing saved.
    useTwistStabilityStore.setState(useTwistStabilityStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('restores the bullet, the barrel and the air after a fresh session', async () => {
    const store = useTwistStabilityStore.getState();
    store.setSettings({ diameter: 6.17, length: 25.4, mass: 6.48, twist: 9, muzzleSpeed: 900, targetStability: 2 });
    store.setSettings({
      atmosphere: {
        source: 'sea-level',
        temperature: { value: -5, unit: 'c' },
        pressure: { value: 1020, unit: 'hpa' },
        altitude: { value: 800, unit: 'm' },
      },
    });
    const saved = window.localStorage.getItem(storageKey)!;
    useTwistStabilityStore.setState(useTwistStabilityStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useTwistStabilityStore.persist.rehydrate();
    expect(useTwistStabilityStore.getState()).toMatchObject({
      diameter: 6.17,
      length: 25.4,
      mass: 6.48,
      twist: 9,
      muzzleSpeed: 900,
      targetStability: 2,
      atmosphere: { source: 'sea-level', altitude: { value: 800, unit: 'm' } },
    });
  });

  it('ignores saved data of the wrong shape or out of range', async () => {
    const invalidSettings: unknown[] = [
      { diameter: null },
      { ...initialTwistStabilitySettings, bulletUnit: 'cm' },
      { ...initialTwistStabilitySettings, diameter: 0 },
      { ...initialTwistStabilitySettings, mass: -1 },
      // Below 1.0 no barrel would be chosen on purpose, and above 4.0 nothing is published.
      { ...initialTwistStabilitySettings, targetStability: 0.5 },
      { ...initialTwistStabilitySettings, targetStability: 9 },
      { ...initialTwistStabilitySettings, speedUnit: 'kph' },
    ];
    for (const settings of invalidSettings) {
      useTwistStabilityStore.setState(useTwistStabilityStore.getInitialState(), true);
      window.localStorage.setItem(storageKey, JSON.stringify({ state: { language: 'en', settings }, version: 0 }));
      await useTwistStabilityStore.persist.rehydrate();
      expect(useTwistStabilityStore.getState()).toMatchObject({ ...initialTwistStabilitySettings });
      // Starting over has to be visible to the user, not silent.
      expect(useStorageStatus.getState().discarded).toEqual([storageKey]);
      useStorageStatus.setState({ discarded: [] });
    }
  });

  it('says nothing about discarded data on a first visit', async () => {
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    await useTwistStabilityStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    expect(useTwistStabilityStore.getState()).toMatchObject(initialTwistStabilitySettings);
  });

  it('stays quiet when another tool discards its own saved data', () => {
    reportDiscardedSave('nilay-labs-other-tool-v1');
    const { result } = renderHook(() => useDiscardedSave(storageKey));
    expect(result.current).toBe(false);
    expect(useStorageStatus.getState().discarded).toEqual(['nilay-labs-other-tool-v1']);
  });

  it('rewrites the diameter and the length together, so the bullet stays the same bullet', () => {
    const before = stabilityNow();
    useTwistStabilityStore.getState().setBulletUnit('inch');
    const { diameter, length, bulletUnit } = useTwistStabilityStore.getState();
    expect(bulletUnit).toBe('inch');
    expect(diameter).toBe(0.3079);
    expect(length).toBe(1.226);
    // Each field is rounded to the digits the form shows, which moves the answer by far less
    // than the rule's own accuracy.
    expect(Math.abs(stabilityNow() - before) / before).toBeLessThan(0.001);
  });

  it('rewrites the twist, the weight and the speed on their own', () => {
    const before = stabilityNow();
    const store = useTwistStabilityStore.getState();
    store.setTwistUnit('mm');
    expect(useTwistStabilityStore.getState().twist).toBe(304.8);
    // The bullet's own unit is untouched by the barrel's.
    expect(useTwistStabilityStore.getState().bulletUnit).toBe('mm');
    store.setMassUnit('grain');
    expect(useTwistStabilityStore.getState().mass).toBe(168.06);
    store.setSpeedUnit('fps');
    expect(useTwistStabilityStore.getState().muzzleSpeed).toBe(2799.9);
    expect(Math.abs(stabilityNow() - before) / before).toBeLessThan(0.001);
  });

  it('leaves a unit alone when it is set to the one already in use', () => {
    const store = useTwistStabilityStore.getState();
    store.setSettings({ diameter: 7.8232 });
    store.setBulletUnit('mm');
    // Reselecting the same unit must not put the value through a rounding step.
    expect(useTwistStabilityStore.getState().diameter).toBe(7.8232);
  });

  it('keeps the last complete settings while a numeric field is blank', async () => {
    const store = useTwistStabilityStore.getState();
    store.setSettings({ twist: 10 });
    store.setSettings({ diameter: NaN });
    expect(useTwistStabilityStore.getState().diameter).toBeNaN();
    const saved = window.localStorage.getItem(storageKey)!;
    useTwistStabilityStore.setState(useTwistStabilityStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useTwistStabilityStore.persist.rehydrate();
    expect(useTwistStabilityStore.getState()).toMatchObject({
      twist: 10,
      diameter: initialTwistStabilitySettings.diameter,
    });
  });

  it('survives drafts that no calculation can use', () => {
    const store = useTwistStabilityStore.getState();
    expect(() => {
      store.setSettings({ diameter: NaN, length: NaN, mass: NaN });
      store.setBulletUnit('inch');
      store.setMassUnit('grain');
    }).not.toThrow();
    expect(calculateTwistStability(useTwistStabilityStore.getState())).toBeNull();
    expect(useTwistStabilityStore.getState().lastValidSettings).toEqual(initialTwistStabilitySettings);
    store.setSettings({ diameter: 0.308, length: 1.226, mass: 168 });
    expect(useTwistStabilityStore.getState().lastValidSettings.diameter).toBe(0.308);
  });

  it('remains usable when browser storage rejects writes', () => {
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => useTwistStabilityStore.getState().setSettings({ twist: 8 })).not.toThrow();
    expect(useTwistStabilityStore.getState().twist).toBe(8);
    expect(useStorageStatus.getState().available).toBe(false);
  });
});
