import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initialTrajectorySettings, storageKey, useTrajectoryStore } from '@/app/(standalone)/labs/trajectory/_store';
import { reportDiscardedSave, useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { initialTrajectoryCard } from '@/lib/schemas/trajectory';
import { calculateTrajectory } from '@/lib/trajectory';

describe('trajectory settings', () => {
  beforeEach(() => {
    // Resetting the store persists it, so the clear has to come last for a test to start with nothing saved.
    useTrajectoryStore.setState(useTrajectoryStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('restores the load, the rifle and the air after a fresh session', async () => {
    const store = useTrajectoryStore.getState();
    store.setMuzzleSpeed({ value: 2650, unit: 'fps' });
    store.setMass({ value: 168, unit: 'grain' });
    store.setBallisticCoefficient(0.462);
    store.setDragModel('g7');
    store.setSightHeight({ value: 1.5, unit: 'inch' });
    store.setDistanceUnit('yd');
    store.setZeroDistance(200);
    store.setStep(100);
    store.setMaxRange(600);
    store.setDropUnit('inch');
    store.setVitalRadius(3);
    store.setWind({ speed: 10, unit: 'mph', preset: 'custom', customFromDegrees: 120 });
    store.setAtmosphere({
      source: 'altitude',
      temperature: { value: 30, unit: 'f' },
      pressure: { value: 29.92, unit: 'inhg' },
      altitude: { value: 5000, unit: 'ft' },
    });
    const saved = window.localStorage.getItem(storageKey)!;
    useTrajectoryStore.setState(useTrajectoryStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useTrajectoryStore.persist.rehydrate();
    expect(useTrajectoryStore.getState()).toMatchObject({
      muzzleSpeed: { value: 2650, unit: 'fps' },
      mass: { value: 168, unit: 'grain' },
      ballisticCoefficient: 0.462,
      dragModel: 'g7',
      sightHeight: { value: 1.5, unit: 'inch' },
      distanceUnit: 'yd',
      zeroDistance: 200,
      step: 100,
      maxRange: 600,
      dropUnit: 'inch',
      vitalRadius: 3,
      wind: { speed: 10, unit: 'mph', preset: 'custom', customFromDegrees: 120 },
      atmosphere: { source: 'altitude', altitude: { value: 5000, unit: 'ft' } },
    });
  });

  it('ignores saved data of the wrong shape or out of range', async () => {
    const invalidSettings: unknown[] = [
      { muzzleSpeed: null },
      { ...initialTrajectorySettings, muzzleSpeed: { value: 0, unit: 'mps' } },
      { ...initialTrajectorySettings, dragModel: 'g5' },
      { ...initialTrajectorySettings, ballisticCoefficient: 12 },
      { ...initialTrajectorySettings, wind: { speed: 4, unit: 'knots', preset: '9', customFromDegrees: 270 } },
      {
        ...initialTrajectorySettings,
        atmosphere: { ...initialTrajectorySettings.atmosphere, temperature: { value: 500, unit: 'c' } },
      },
    ];
    for (const settings of invalidSettings) {
      useTrajectoryStore.setState(useTrajectoryStore.getInitialState(), true);
      window.localStorage.setItem(storageKey, JSON.stringify({ state: { language: 'en', settings }, version: 0 }));
      await useTrajectoryStore.persist.rehydrate();
      expect(useTrajectoryStore.getState()).toMatchObject({ ...initialTrajectorySettings });
      // Starting over has to be visible to the user, not silent.
      expect(useStorageStatus.getState().discarded).toEqual([storageKey]);
      useStorageStatus.setState({ discarded: [] });
    }
  });

  it('keeps a saved setup whose unused branch holds what the used one would reject', async () => {
    // Reading the pressure from the altitude means the pressure field is never looked at, so a
    // zero left in it is not a reason to throw the whole setup away and start over.
    const settings = {
      ...initialTrajectorySettings,
      atmosphere: {
        source: 'altitude' as const,
        temperature: { value: 15 as const, unit: 'c' as const },
        pressure: { value: 0, unit: 'hpa' as const },
        altitude: { value: 1500, unit: 'm' as const },
      },
      wind: { speed: 4, unit: 'mps' as const, preset: '9' as const, customFromDegrees: 900 },
    };
    window.localStorage.setItem(storageKey, JSON.stringify({ state: { language: 'ja', settings }, version: 0 }));
    await useTrajectoryStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    expect(useTrajectoryStore.getState().atmosphere).toMatchObject({ source: 'altitude', altitude: { value: 1500 } });
    // Switch that same branch on and the value does have to make sense again.
    useTrajectoryStore.getState().setWind({ speed: 4, unit: 'mps', preset: 'custom', customFromDegrees: 900 });
    expect(useTrajectoryStore.getState().lastValidSettings.wind.preset).toBe('9');
  });

  it('opens a setup saved before the card existed on the card defaults', async () => {
    // The card was added after the tool shipped. A setup saved without one is complete, so it
    // has to open with the card's defaults rather than be reported as an unreadable save.
    const { card: _card, ...withoutCard } = initialTrajectorySettings;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ state: { language: 'ja', settings: { ...withoutCard, zeroDistance: 150 } }, version: 0 }),
    );
    await useTrajectoryStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    expect(useTrajectoryStore.getState().zeroDistance).toBe(150);
    expect(useTrajectoryStore.getState().card).toEqual(initialTrajectoryCard);
    expect(useTrajectoryStore.getState().lastValidSettings.card).toEqual(initialTrajectoryCard);
  });

  it('restores the card the reader set up, columns and names included', async () => {
    const store = useTrajectoryStore.getState();
    store.setCard({ size: 'a7', copies: 1, step: 25, maxRange: 200 });
    store.setCard({ drop: 'mil', drift: 'per-speed', extras: ['speed', 'time'] });
    store.setCard({ gun: 'Tikka T3x', load: '168 gr' });
    const saved = window.localStorage.getItem(storageKey)!;
    useTrajectoryStore.setState(useTrajectoryStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useTrajectoryStore.persist.rehydrate();
    expect(useTrajectoryStore.getState().card).toEqual({
      size: 'a7',
      copies: 1,
      step: 25,
      maxRange: 200,
      drop: 'mil',
      drift: 'per-speed',
      extras: ['speed', 'time'],
      gun: 'Tikka T3x',
      load: '168 gr',
    });
    expect(useStorageStatus.getState().discarded).toEqual([]);
  });

  it('throws away a saved card that is not one the tool offers', async () => {
    const settings = { ...initialTrajectorySettings, card: { ...initialTrajectoryCard, copies: 3 } };
    window.localStorage.setItem(storageKey, JSON.stringify({ state: { language: 'ja', settings }, version: 0 }));
    await useTrajectoryStore.persist.rehydrate();
    expect(useTrajectoryStore.getState().card).toEqual(initialTrajectoryCard);
    expect(useStorageStatus.getState().discarded).toEqual([storageKey]);
  });

  it('keeps the card while a card field is being typed', () => {
    const store = useTrajectoryStore.getState();
    store.setCard({ step: 100 });
    store.setCard({ step: NaN });
    expect(useTrajectoryStore.getState().card.step).toBeNaN();
    // The last complete settings are what is saved, so a half-typed step never reaches storage.
    expect(useTrajectoryStore.getState().lastValidSettings.card.step).toBe(100);
  });

  it('says nothing about discarded data on a first visit', async () => {
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    await useTrajectoryStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    expect(useTrajectoryStore.getState()).toMatchObject(initialTrajectorySettings);
  });

  it('stays quiet when another tool discards its own saved data', () => {
    reportDiscardedSave('nilay-labs-other-tool-v1');
    const { result } = renderHook(() => useDiscardedSave(storageKey));
    expect(result.current).toBe(false);
    expect(useStorageStatus.getState().discarded).toEqual(['nilay-labs-other-tool-v1']);
  });

  it('rereads the distances in the new unit instead of converting them', () => {
    const store = useTrajectoryStore.getState();
    store.setZeroDistance(100);
    store.setMaxRange(500);
    store.setDistanceUnit('yd');
    // A shooter picks a round zero for whichever unit the range is marked out in.
    expect(useTrajectoryStore.getState()).toMatchObject({ distanceUnit: 'yd', zeroDistance: 100, maxRange: 500 });
  });

  it('keeps the last complete settings while a numeric field is blank', async () => {
    const store = useTrajectoryStore.getState();
    store.setMuzzleSpeed({ value: 900, unit: 'mps' });
    store.setBallisticCoefficient(0.6);
    store.setMuzzleSpeed({ value: NaN, unit: 'mps' });
    expect(useTrajectoryStore.getState().muzzleSpeed.value).toBeNaN();
    const saved = window.localStorage.getItem(storageKey)!;
    useTrajectoryStore.setState(useTrajectoryStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useTrajectoryStore.persist.rehydrate();
    expect(useTrajectoryStore.getState()).toMatchObject({
      muzzleSpeed: { value: 900 },
      ballisticCoefficient: 0.6,
    });
  });

  it('survives drafts that no calculation can use', () => {
    const store = useTrajectoryStore.getState();
    expect(() => {
      store.setMuzzleSpeed({ value: NaN, unit: 'mps' });
      store.setMass({ value: NaN, unit: 'g' });
      store.setBallisticCoefficient(NaN);
      store.setZeroDistance(NaN);
      store.setWind({ speed: NaN, unit: 'mps', preset: 'custom', customFromDegrees: 900 });
    }).not.toThrow();
    const draft = useTrajectoryStore.getState();
    expect(calculateTrajectory(draft)).toBeNull();
    expect(draft.lastValidSettings).toEqual(initialTrajectorySettings);
    store.setMuzzleSpeed({ value: 900, unit: 'mps' });
    store.setMass({ value: 11, unit: 'g' });
    store.setBallisticCoefficient(0.5);
    store.setZeroDistance(200);
    store.setWind({ speed: 3, unit: 'mps', preset: '3', customFromDegrees: 90 });
    expect(useTrajectoryStore.getState().lastValidSettings.zeroDistance).toBe(200);
  });

  it('remains usable when browser storage rejects writes', () => {
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => useTrajectoryStore.getState().setZeroDistance(300)).not.toThrow();
    expect(useTrajectoryStore.getState().zeroDistance).toBe(300);
    expect(useStorageStatus.getState().available).toBe(false);
  });
});
