import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initialTargetLeadSettings, storageKey, useTargetLeadStore } from '@/app/(standalone)/labs/target-lead/_store';
import { reportDiscardedSave, useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { calculateTargetLead, leadTable } from '@/lib/target-lead';

describe('target lead settings', () => {
  beforeEach(() => {
    // Resetting the store persists it, so the clear has to come last for a test to start with nothing saved.
    useTargetLeadStore.setState(useTargetLeadStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('restores the shot and the units after a fresh session', async () => {
    const store = useTargetLeadStore.getState();
    store.setTargetSpeed({ value: 45, unit: 'mph' });
    store.setDistance({ value: 35, unit: 'yd' });
    store.setCrossingAngle(60);
    store.setProjectileSpeed({ value: 1150, unit: 'fps' });
    store.setDelay(0.02);
    const saved = window.localStorage.getItem(storageKey)!;
    useTargetLeadStore.setState(useTargetLeadStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useTargetLeadStore.persist.rehydrate();
    expect(useTargetLeadStore.getState()).toMatchObject({
      targetSpeed: { value: 45, unit: 'mph' },
      distance: { value: 35, unit: 'yd' },
      crossingAngleDegrees: 60,
      projectileSpeed: { value: 1150, unit: 'fps' },
      delaySeconds: 0.02,
    });
  });

  it('ignores saved data of the wrong shape or out of range', async () => {
    const invalidSettings: unknown[] = [
      { distance: null },
      { ...initialTargetLeadSettings, distance: { value: 0, unit: 'm' } },
      { ...initialTargetLeadSettings, targetSpeed: { value: 60, unit: 'knots' } },
      { ...initialTargetLeadSettings, projectileSpeed: { value: 0, unit: 'm/s' } },
      { ...initialTargetLeadSettings, crossingAngleDegrees: 200 },
      { ...initialTargetLeadSettings, delaySeconds: -1 },
    ];
    for (const settings of invalidSettings) {
      useTargetLeadStore.setState(useTargetLeadStore.getInitialState(), true);
      window.localStorage.setItem(storageKey, JSON.stringify({ state: { language: 'en', settings }, version: 0 }));
      await useTargetLeadStore.persist.rehydrate();
      expect(useTargetLeadStore.getState()).toMatchObject({ ...initialTargetLeadSettings });
      // Starting over has to be visible to the user, not silent.
      expect(useStorageStatus.getState().discarded).toEqual([storageKey]);
      useStorageStatus.setState({ discarded: [] });
    }
  });

  it('says nothing about discarded data on a first visit', async () => {
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    await useTargetLeadStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    expect(useTargetLeadStore.getState()).toMatchObject(initialTargetLeadSettings);
  });

  it('stays quiet when another tool discards its own saved data', () => {
    reportDiscardedSave('nilay-labs-other-tool-v1');
    const { result } = renderHook(() => useDiscardedSave(storageKey));
    expect(result.current).toBe(false);
    expect(useStorageStatus.getState().discarded).toEqual(['nilay-labs-other-tool-v1']);
  });

  it('rereads a number in the new unit instead of converting it', () => {
    const store = useTargetLeadStore.getState();
    store.setTargetSpeed({ value: 90, unit: 'km/h' });
    store.setTargetSpeed({ value: 90, unit: 'mph' });
    // The shooter is retyping the figure their own source quotes, not asking for 90 km/h in mph.
    expect(useTargetLeadStore.getState().targetSpeed).toEqual({ value: 90, unit: 'mph' });
    store.setDistance({ value: 40, unit: 'yd' });
    expect(useTargetLeadStore.getState().distance).toEqual({ value: 40, unit: 'yd' });
  });

  it('keeps the last complete settings while a numeric field is blank', async () => {
    const store = useTargetLeadStore.getState();
    store.setDistance({ value: 25, unit: 'm' });
    store.setCrossingAngle(45);
    store.setDistance({ value: NaN, unit: 'm' });
    expect(useTargetLeadStore.getState().distance.value).toBeNaN();
    const saved = window.localStorage.getItem(storageKey)!;
    useTargetLeadStore.setState(useTargetLeadStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useTargetLeadStore.persist.rehydrate();
    expect(useTargetLeadStore.getState()).toMatchObject({
      distance: { value: 25, unit: 'm' },
      crossingAngleDegrees: 45,
    });
  });

  it('survives drafts that no calculation can use', () => {
    const store = useTargetLeadStore.getState();
    expect(() => {
      store.setTargetSpeed({ value: NaN, unit: 'km/h' });
      store.setDistance({ value: NaN, unit: 'm' });
      store.setCrossingAngle(NaN);
      store.setProjectileSpeed({ value: NaN, unit: 'm/s' });
      store.setDelay(NaN);
    }).not.toThrow();
    const { targetSpeed, distance, crossingAngleDegrees, projectileSpeed, delaySeconds } =
      useTargetLeadStore.getState();
    const draft = { targetSpeed, distance, crossingAngleDegrees, projectileSpeed, delaySeconds };
    expect(calculateTargetLead(draft).kind).toBe('incomplete');
    expect(leadTable(draft)).toEqual([]);
    expect(useTargetLeadStore.getState().lastValidSettings).toEqual(initialTargetLeadSettings);
    store.setTargetSpeed({ value: 90, unit: 'km/h' });
    store.setDistance({ value: 40, unit: 'm' });
    store.setCrossingAngle(90);
    store.setProjectileSpeed({ value: 400, unit: 'm/s' });
    store.setDelay(0);
    expect(useTargetLeadStore.getState().lastValidSettings.distance).toEqual({ value: 40, unit: 'm' });
    const restored = calculateTargetLead(useTargetLeadStore.getState().lastValidSettings);
    // 40 m against a projectile averaging 400 m/s and a target at 25 m/s crossing square.
    expect(restored.kind === 'lead' && restored.result.lead.meters).toBeCloseTo(
      25 * (40 / Math.sqrt(400 ** 2 - 25 ** 2)),
      10,
    );
  });

  it('remains usable when browser storage rejects writes', () => {
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => useTargetLeadStore.getState().setDistance({ value: 25, unit: 'm' })).not.toThrow();
    expect(useTargetLeadStore.getState().distance.value).toBe(25);
    expect(useStorageStatus.getState().available).toBe(false);
  });
});
