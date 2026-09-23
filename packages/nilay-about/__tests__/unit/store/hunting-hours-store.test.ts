import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STORAGE_KEY, useHuntingHoursStore } from '@/app/(standalone)/labs/hunting-hours/_store';
import { presetLocationMap, presetLocations } from '@/app/(standalone)/labs/hunting-hours/locations';
import { useStorageStatus } from '@/lib/browser-storage';

describe('hunting hours places', () => {
  beforeEach(() => {
    // persist writes through every setState, so the store has to be reset before the clear;
    // the other order leaves a valid save behind and any first-visit assertion becomes vacuous.
    useHuntingHoursStore.setState(useHuntingHoursStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('covers every prefecture with a usable reference point', () => {
    expect(presetLocations).toHaveLength(47);
    expect(new Set(presetLocations.map((location) => location.id)).size).toBe(47);
    for (const location of presetLocations) {
      expect(location.latitude).toBeGreaterThan(20);
      expect(location.latitude).toBeLessThan(46);
      expect(location.longitude).toBeGreaterThan(122);
      expect(location.longitude).toBeLessThan(154);
    }
  });

  it('fills the coordinates of a preset and leaves it once a coordinate is edited', () => {
    const store = useHuntingHoursStore.getState();
    store.selectPreset('47');
    expect(useHuntingHoursStore.getState()).toMatchObject({
      presetId: '47',
      latitude: presetLocationMap.get('47')?.latitude,
      longitude: presetLocationMap.get('47')?.longitude,
    });
    store.setLatitude(26.5);
    expect(useHuntingHoursStore.getState()).toMatchObject({ presetId: null, latitude: 26.5 });
    store.selectPreset('unknown');
    expect(useHuntingHoursStore.getState().presetId).toBeNull();
  });

  it('restores an independent named place including its preset', () => {
    const store = useHuntingHoursStore.getState();
    store.selectPreset('01');
    expect(store.saveLocation('猟場')).toBe('saved');
    const place = useHuntingHoursStore.getState().locations[0]!;
    store.selectPreset('47');
    expect(place.latitude).toBe(presetLocationMap.get('01')?.latitude);
    store.loadLocation(place.id);
    expect(useHuntingHoursStore.getState()).toMatchObject({
      presetId: '01',
      latitude: presetLocationMap.get('01')?.latitude,
    });
    store.deleteLocation(place.id);
    expect(useHuntingHoursStore.getState().locations).toEqual([]);
  });

  it('puts a deleted place back where it was', () => {
    const store = useHuntingHoursStore.getState();
    store.selectPreset('01');
    store.saveLocation('北');
    store.selectPreset('47');
    store.saveLocation('南');
    const [north, south] = useHuntingHoursStore.getState().locations;
    store.deleteLocation(north!.id);
    expect(useHuntingHoursStore.getState().locations).toEqual([south]);
    expect(useHuntingHoursStore.getState().deletedLocation).toMatchObject({ index: 0, location: { name: '北' } });
    store.undoDelete();
    expect(useHuntingHoursStore.getState().locations).toEqual([north, south]);
    expect(useHuntingHoursStore.getState().deletedLocation).toBeNull();
    // Nothing left to undo, so a second press changes nothing.
    store.undoDelete();
    expect(useHuntingHoursStore.getState().locations).toEqual([north, south]);
  });

  it('renames a restored place when its name was taken meanwhile', () => {
    const store = useHuntingHoursStore.getState();
    store.saveLocation('猟場');
    const [place] = useHuntingHoursStore.getState().locations;
    store.deleteLocation(place!.id);
    expect(store.saveLocation('猟場')).toBe('saved');
    store.undoDelete();
    expect(useHuntingHoursStore.getState().locations.map((item) => item.name)).toEqual(['猟場 (2)', '猟場']);
  });

  it('stops saying the settings were lost once they read again', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{broken');
    await useHuntingHoursStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([STORAGE_KEY]);

    // Writing through the store replaces the unreadable value, so the next visit opens with the
    // saved settings rather than the defaults and the notice would be telling the reader otherwise.
    useHuntingHoursStore.getState().selectPreset('20');
    await useHuntingHoursStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
  });

  it('names the reason a save was refused', () => {
    const store = useHuntingHoursStore.getState();
    expect(store.saveLocation(' 猟場 ')).toBe('saved');
    expect(store.saveLocation('猟場')).toBe('duplicate-name');
    expect(store.saveLocation('  ')).toBe('empty-name');
    store.setLatitude(NaN);
    expect(store.saveLocation('別の地点')).toBe('invalid-location');
    store.setLatitude(120);
    expect(store.saveLocation('別の地点')).toBe('invalid-location');
    // A blank name is reported as such even when the coordinates are unusable too.
    expect(store.saveLocation('  ')).toBe('empty-name');
    expect(useHuntingHoursStore.getState().locations).toHaveLength(1);
  });

  it('ignores coordinates a geolocation source could not supply', () => {
    const store = useHuntingHoursStore.getState();
    store.setCoordinates({ latitude: 200, longitude: 0 });
    expect(useHuntingHoursStore.getState().latitude).toBe(35.6581);
    store.setCoordinates({ latitude: 43.05, longitude: 141.2 });
    expect(useHuntingHoursStore.getState()).toMatchObject({ latitude: 43.05, longitude: 141.2, presetId: null });
  });

  it('restores the place and saved places after a fresh session', async () => {
    const store = useHuntingHoursStore.getState();
    store.selectPreset('20');
    expect(store.saveLocation('Ridge')).toBe('saved');
    const saved = window.localStorage.getItem(STORAGE_KEY)!;
    useHuntingHoursStore.setState(useHuntingHoursStore.getInitialState(), true);
    window.localStorage.setItem(STORAGE_KEY, saved);
    await useHuntingHoursStore.persist.rehydrate();
    expect(useHuntingHoursStore.getState()).toMatchObject({
      presetId: '20',
      latitude: presetLocationMap.get('20')?.latitude,
      locations: [{ name: 'Ridge', presetId: '20' }],
    });
  });

  it('keeps the last complete position when a coordinate is blank during reload', async () => {
    const store = useHuntingHoursStore.getState();
    store.setLatitude(38.5);
    store.setLongitude(140.5);
    store.setLatitude(NaN);
    const saved = window.localStorage.getItem(STORAGE_KEY)!;
    useHuntingHoursStore.setState(useHuntingHoursStore.getInitialState(), true);
    window.localStorage.setItem(STORAGE_KEY, saved);
    await useHuntingHoursStore.persist.rehydrate();
    expect(useHuntingHoursStore.getState()).toMatchObject({ latitude: 38.5, longitude: 140.5 });
  });

  it('ignores saved shapes it cannot trust', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: { language: 'en', presetId: '13', location: { latitude: 200, longitude: 0 }, locations: [] },
        version: 0,
      }),
    );
    await useHuntingHoursStore.persist.rehydrate();
    expect(useHuntingHoursStore.getState()).toMatchObject({ latitude: 35.6581 });

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: { language: 'ja', presetId: null, location: { latitude: 35, longitude: 135 }, locations: [{ id: '1' }] },
        version: 0,
      }),
    );
    await useHuntingHoursStore.persist.rehydrate();
    expect(useHuntingHoursStore.getState().latitude).toBe(35.6581);
  });

  it('drops a preset that no longer exists but keeps its coordinates', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          language: 'ja',
          presetId: '99',
          location: { latitude: 35, longitude: 135 },
          locations: [{ id: '1', name: 'Old', presetId: '98', latitude: 36, longitude: 136 }],
        },
        version: 0,
      }),
    );
    await useHuntingHoursStore.persist.rehydrate();
    expect(useHuntingHoursStore.getState()).toMatchObject({
      presetId: null,
      latitude: 35,
      longitude: 135,
      locations: [{ name: 'Old', presetId: null, latitude: 36 }],
    });
  });

  it('stays quiet on a first visit, with nothing saved at all', async () => {
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    await useHuntingHoursStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
  });

  it('says when it had to throw its own saved shape away', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { language: 'fr' }, version: 0 }));
    await useHuntingHoursStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([STORAGE_KEY]);
    expect(useHuntingHoursStore.getState().latitude).toBe(35.6581);
  });

  it('keeps quiet when the saved shape is usable', async () => {
    useHuntingHoursStore.getState().selectPreset('20');
    const saved = window.localStorage.getItem(STORAGE_KEY)!;
    useHuntingHoursStore.setState(useHuntingHoursStore.getInitialState(), true);
    window.localStorage.setItem(STORAGE_KEY, saved);
    await useHuntingHoursStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    expect(useHuntingHoursStore.getState().presetId).toBe('20');
  });

  it('does not speak for another tool whose saved data is broken', async () => {
    useStorageStatus.setState({ discarded: ['nilay-labs-target-v1'] });
    await useHuntingHoursStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual(['nilay-labs-target-v1']);
    expect(useStorageStatus.getState().discarded).not.toContain(STORAGE_KEY);
  });

  it('remains usable when browser storage rejects writes', () => {
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => useHuntingHoursStore.getState().selectPreset('47')).not.toThrow();
    expect(useHuntingHoursStore.getState().presetId).toBe('47');
    expect(useStorageStatus.getState().available).toBe(false);
  });
});
