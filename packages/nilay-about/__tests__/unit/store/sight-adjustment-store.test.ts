import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  initialSightAdjustmentSettings,
  storageKey,
  useSightAdjustmentStore,
} from '@/app/(standalone)/labs/sight-adjustment/_store';
import { reportDiscardedSave, useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import {
  METERS_PER_YARD,
  calculateSightAdjustment,
  calculateSlant,
  toMeters,
  withClickPreset,
} from '@/lib/sight-adjustment';

describe('sight adjustment settings', () => {
  beforeEach(() => {
    // Resetting the store persists it, so the clear has to come last for a test to start with nothing saved.
    useSightAdjustmentStore.setState(useSightAdjustmentStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('restores the inputs and the units after a fresh session', async () => {
    const store = useSightAdjustmentStore.getState();
    store.setDistance({ value: 50, unit: 'yd' });
    store.setOffsetUnit('inch');
    store.setVertical({ direction: 'high', value: 1.5 });
    store.setHorizontal({ direction: 'left', value: 0.5 });
    store.setClick({ preset: '0.1-mil', customMmPer100m: 10 });
    store.setSlant({ value: 80, angleDegrees: -20 });
    const saved = window.localStorage.getItem(storageKey)!;
    useSightAdjustmentStore.setState(useSightAdjustmentStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useSightAdjustmentStore.persist.rehydrate();
    expect(useSightAdjustmentStore.getState()).toMatchObject({
      distance: { value: 50, unit: 'yd' },
      offsetUnit: 'inch',
      vertical: { direction: 'high', value: 1.5 },
      horizontal: { direction: 'left', value: 0.5 },
      click: { preset: '0.1-mil' },
      slant: { value: 80, angleDegrees: -20 },
    });
  });

  it('ignores saved data of the wrong shape or out of range', async () => {
    const invalidSettings: unknown[] = [
      { distance: null },
      { ...initialSightAdjustmentSettings, distance: { value: 0, unit: 'm' } },
      { ...initialSightAdjustmentSettings, vertical: { direction: 'up', value: 5 } },
      { ...initialSightAdjustmentSettings, slant: { value: 100, angleDegrees: 120 } },
    ];
    for (const settings of invalidSettings) {
      useSightAdjustmentStore.setState(useSightAdjustmentStore.getInitialState(), true);
      window.localStorage.setItem(storageKey, JSON.stringify({ state: { language: 'en', settings }, version: 0 }));
      await useSightAdjustmentStore.persist.rehydrate();
      expect(useSightAdjustmentStore.getState()).toMatchObject({ ...initialSightAdjustmentSettings });
      // Starting over has to be visible to the user, not silent.
      expect(useStorageStatus.getState().discarded).toEqual([storageKey]);
      useStorageStatus.setState({ discarded: [] });
    }
  });

  it('says nothing about discarded data on a first visit', async () => {
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    await useSightAdjustmentStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    expect(useSightAdjustmentStore.getState()).toMatchObject(initialSightAdjustmentSettings);
  });

  it('stays quiet when another tool discards its own saved data', () => {
    reportDiscardedSave('nilay-labs-other-tool-v1');
    const { result } = renderHook(() => useDiscardedSave(storageKey));
    expect(result.current).toBe(false);
    expect(useStorageStatus.getState().discarded).toEqual(['nilay-labs-other-tool-v1']);
  });

  it('keeps the incline distance at the same real length when the distance unit changes', () => {
    const store = useSightAdjustmentStore.getState();
    store.setSlant({ value: 100, angleDegrees: 30 });
    const before = calculateSlant(100, 'm', 30)!.horizontalMeters;
    store.setDistance({ value: 100, unit: 'yd' });
    const converted = useSightAdjustmentStore.getState().slant;
    // The field keeps two decimals, so the real length matches within one rounding step of the new unit.
    const slack = 0.01 * METERS_PER_YARD;
    expect(converted.value).toBe(109.36);
    expect(Math.abs(toMeters(converted.value, 'yd') - 100)).toBeLessThanOrEqual(slack);
    expect(
      Math.abs(calculateSlant(converted.value, 'yd', converted.angleDegrees)!.horizontalMeters - before),
    ).toBeLessThanOrEqual(slack);
    // The distance being retyped for the click calculation is reread in the new unit, not converted.
    expect(useSightAdjustmentStore.getState().distance).toEqual({ value: 100, unit: 'yd' });
    store.setDistance({ value: 100, unit: 'm' });
    expect(useSightAdjustmentStore.getState().slant.value).toBeCloseTo(100, 2);
    store.setDistance({ value: 50, unit: 'm' });
    expect(useSightAdjustmentStore.getState().slant.value).toBeCloseTo(100, 2);
  });

  it('keeps the last complete settings while a numeric field is blank', async () => {
    const store = useSightAdjustmentStore.getState();
    store.setDistance({ value: 75, unit: 'm' });
    store.setVertical({ direction: 'high', value: 4 });
    store.setDistance({ value: NaN, unit: 'm' });
    expect(useSightAdjustmentStore.getState().distance.value).toBeNaN();
    const saved = window.localStorage.getItem(storageKey)!;
    useSightAdjustmentStore.setState(useSightAdjustmentStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useSightAdjustmentStore.persist.rehydrate();
    expect(useSightAdjustmentStore.getState()).toMatchObject({
      distance: { value: 75 },
      vertical: { direction: 'high', value: 4 },
    });
  });

  it('survives drafts that no calculation can use', () => {
    const store = useSightAdjustmentStore.getState();
    expect(() => {
      store.setDistance({ value: NaN, unit: 'm' });
      store.setVertical({ direction: 'low', value: NaN });
      store.setClick({ preset: 'custom', customMmPer100m: NaN });
      store.setSlant({ value: NaN, angleDegrees: 400 });
    }).not.toThrow();
    const { distance, offsetUnit, vertical, horizontal, click } = useSightAdjustmentStore.getState();
    expect(calculateSightAdjustment({ distance, offsetUnit, vertical, horizontal, click })).toBeNull();
    expect(useSightAdjustmentStore.getState().lastValidSettings).toEqual(initialSightAdjustmentSettings);
    store.setDistance({ value: 200, unit: 'm' });
    store.setVertical({ direction: 'low', value: 5 });
    store.setClick({ preset: '1/4-moa', customMmPer100m: 10 });
    store.setSlant({ value: 100, angleDegrees: 30 });
    expect(useSightAdjustmentStore.getState().lastValidSettings.distance).toEqual({ value: 200, unit: 'm' });
  });

  it('remains usable when browser storage rejects writes', () => {
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => useSightAdjustmentStore.getState().setDistance({ value: 200, unit: 'm' })).not.toThrow();
    expect(useSightAdjustmentStore.getState().distance.value).toBe(200);
    expect(useStorageStatus.getState().available).toBe(false);
  });

  it('keeps saving once a preset is chosen after a custom travel was cleared', async () => {
    const store = useSightAdjustmentStore.getState();
    store.setClick({ preset: 'custom', customMmPer100m: NaN });
    store.setClick(withClickPreset(useSightAdjustmentStore.getState().click, '0.1-mil'));
    store.setDistance({ value: 50, unit: 'm' });
    const saved = window.localStorage.getItem(storageKey)!;
    useSightAdjustmentStore.setState(useSightAdjustmentStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useSightAdjustmentStore.persist.rehydrate();
    expect(useSightAdjustmentStore.getState()).toMatchObject({
      click: { preset: '0.1-mil' },
      distance: { value: 50, unit: 'm' },
    });
    // A travel that was typed is kept for when custom is chosen again.
    store.setClick({ preset: 'custom', customMmPer100m: 12 });
    expect(withClickPreset(useSightAdjustmentStore.getState().click, '1-moa')).toEqual({
      preset: '1-moa',
      customMmPer100m: 12,
    });
  });
});
