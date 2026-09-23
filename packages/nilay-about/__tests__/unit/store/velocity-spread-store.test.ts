import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  initialVelocitySpreadSettings,
  storageKey,
  useVelocitySpreadStore,
} from '@/app/(standalone)/labs/velocity-spread/_store';
import { reportDiscardedSave, useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { VELOCITY_READINGS_MAX } from '@/lib/schemas/velocity-spread';

const reopen = async () => {
  const saved = window.localStorage.getItem(storageKey)!;
  useVelocitySpreadStore.setState(useVelocitySpreadStore.getInitialState(), true);
  window.localStorage.setItem(storageKey, saved);
  await useVelocitySpreadStore.persist.rehydrate();
};

describe('velocity spread settings', () => {
  beforeEach(() => {
    // Resetting the store persists it, so the clear has to come last for a test to start with nothing saved.
    useVelocitySpreadStore.setState(useVelocitySpreadStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('restores the readings and the load after a fresh session', async () => {
    const store = useVelocitySpreadStore.getState();
    store.setReadings('2650\n2661\n2644');
    store.setSpeedUnit('fps');
    store.setBallisticCoefficient(0.31);
    store.setDragModel('g7');
    store.setDistanceUnit('yd');
    store.setZeroDistance(200);
    store.setStep(100);
    store.setMaxRange(500);
    store.setDropUnit('inch');
    store.setSdPrecisionPercent(25);
    await reopen();
    expect(useVelocitySpreadStore.getState()).toMatchObject({
      readings: '2650\n2661\n2644',
      speedUnit: 'fps',
      ballisticCoefficient: 0.31,
      dragModel: 'g7',
      distanceUnit: 'yd',
      zeroDistance: 200,
      maxRange: 500,
      dropUnit: 'inch',
      sdPrecisionPercent: 25,
    });
  });

  it('keeps the readings exactly as they were typed, including what could not be read', () => {
    // The screen points at the entry that is not a speed, so the entry has to still be there.
    useVelocitySpreadStore.getState().setReadings('800\n80o\n795');
    expect(useVelocitySpreadStore.getState().readings).toBe('800\n80o\n795');
    expect(useVelocitySpreadStore.getState().lastValidSettings.readings).toBe('800\n80o\n795');
  });

  it('leaves the readings alone when the unit changes', () => {
    // They came off a device that was set to one unit; rewriting them would claim measurements
    // nobody took. Only the label of what they mean changes.
    useVelocitySpreadStore.getState().setSpeedUnit('fps');
    expect(useVelocitySpreadStore.getState().readings).toBe(initialVelocitySpreadSettings.readings);
    expect(useVelocitySpreadStore.getState().speedUnit).toBe('fps');
  });

  it('rewrites the sight height when its unit changes, because that is the rifle', () => {
    useVelocitySpreadStore.getState().setSightHeightUnit('inch');
    expect(useVelocitySpreadStore.getState().sightHeight.value).toBeCloseTo(1.772, 3);
    useVelocitySpreadStore.getState().setSightHeightUnit('mm');
    expect(useVelocitySpreadStore.getState().sightHeight.value).toBeCloseTo(45, 6);
  });

  it('ignores saved data of the wrong shape or out of range', async () => {
    const invalidSettings: unknown[] = [
      { readings: null },
      { ...initialVelocitySpreadSettings, ballisticCoefficient: 3 },
      { ...initialVelocitySpreadSettings, zeroDistance: 0 },
      { ...initialVelocitySpreadSettings, step: 0 },
      { ...initialVelocitySpreadSettings, maxRange: -100 },
      { ...initialVelocitySpreadSettings, sdPrecisionPercent: 0 },
      { ...initialVelocitySpreadSettings, sdPrecisionPercent: 101 },
      { ...initialVelocitySpreadSettings, speedUnit: 'kph' },
      { ...initialVelocitySpreadSettings, readings: 'x'.repeat(VELOCITY_READINGS_MAX + 1) },
    ];
    for (const settings of invalidSettings) {
      useVelocitySpreadStore.setState(useVelocitySpreadStore.getInitialState(), true);
      window.localStorage.setItem(storageKey, JSON.stringify({ state: { language: 'en', settings }, version: 0 }));
      await useVelocitySpreadStore.persist.rehydrate();
      expect(useVelocitySpreadStore.getState()).toMatchObject({ ...initialVelocitySpreadSettings });
      // Starting over has to be visible to the user, not silent.
      expect(useStorageStatus.getState().discarded).toEqual([storageKey]);
      useStorageStatus.setState({ discarded: [] });
    }
  });

  it('says nothing about discarded data on a first visit', async () => {
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    await useVelocitySpreadStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    expect(useVelocitySpreadStore.getState()).toMatchObject(initialVelocitySpreadSettings);
  });

  it('stays quiet when another tool discards its own saved data', () => {
    reportDiscardedSave('nilay-labs-other-tool-v1');
    const { result } = renderHook(() => useDiscardedSave(storageKey));
    expect(result.current).toBe(false);
    expect(useStorageStatus.getState().discarded).toEqual(['nilay-labs-other-tool-v1']);
  });

  it('keeps the last complete settings while a numeric field is blank', async () => {
    const store = useVelocitySpreadStore.getState();
    store.setMaxRange(800);
    store.setStep(NaN);
    expect(useVelocitySpreadStore.getState().step).toBeNaN();
    await reopen();
    expect(useVelocitySpreadStore.getState()).toMatchObject({
      maxRange: 800,
      step: initialVelocitySpreadSettings.step,
    });
  });

  it('remains usable when browser storage rejects writes', () => {
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => useVelocitySpreadStore.getState().setZeroDistance(150)).not.toThrow();
    expect(useVelocitySpreadStore.getState().zeroDistance).toBe(150);
    expect(useStorageStatus.getState().available).toBe(false);
  });
});
