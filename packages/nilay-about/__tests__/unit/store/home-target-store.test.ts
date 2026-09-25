import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

import {
  TARGET_STORAGE_KEY,
  useHomeTargetStore,
  calculateHeightOfTarget,
  calculateBlackAreaSize,
  type Discipline,
} from '@/app/(standalone)/labs/home-target/_store';
import { useStorageStatus } from '@/lib/browser-storage';

const discipline: Discipline = {
  name: '10m Air Rifle',
  key: 'AR10',
  distance: { number: 10, unit: 'm' },
  heightOfTarget: { number: 140, unit: 'cm' },
  blackAreaSize: { number: 3.05, unit: 'cm' },
};

describe('target calculations and saved setups', () => {
  beforeEach(() => {
    // Resetting the store persists it, so storage is emptied afterwards to start from a first visit.
    useHomeTargetStore.setState(useHomeTargetStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('scales the target height and diameter at half distance', () => {
    expect(calculateHeightOfTarget({ number: 170, unit: 'cm' }, { number: 5, unit: 'm' }, discipline)).toBeCloseTo(155);
    expect(calculateBlackAreaSize({ number: 5, unit: 'm' }, discipline)).toBeCloseTo(1.525);
  });
  it('preserves full-distance and zero-distance geometry', () => {
    expect(calculateHeightOfTarget({ number: 170, unit: 'cm' }, { number: 10, unit: 'm' }, discipline)).toBeCloseTo(
      140,
    );
    expect(calculateHeightOfTarget({ number: 170, unit: 'cm' }, { number: 0, unit: 'm' }, discipline)).toBeCloseTo(170);
    expect(calculateBlackAreaSize({ number: 10, unit: 'm' }, discipline)).toBeCloseTo(3.05);
    expect(calculateBlackAreaSize({ number: 0, unit: 'm' }, discipline)).toBe(0);
  });
  it('uses units consistently and supports a target at floor height', () => {
    expect(calculateHeightOfTarget({ number: 1.7, unit: 'm' }, { number: 500, unit: 'cm' }, discipline)).toBeCloseTo(
      155,
    );
    expect(calculateBlackAreaSize({ number: 5000, unit: 'mm' }, discipline)).toBeCloseTo(1.525);
    expect(
      calculateHeightOfTarget(
        { number: 170, unit: 'cm' },
        { number: 5, unit: 'm' },
        { ...discipline, heightOfTarget: { number: 0, unit: 'cm' } },
      ),
    ).toBeCloseTo(85);
  });
  it('restores an independent named setup including its paper size', () => {
    const store = useHomeTargetStore.getState();
    store.setPaper('letter');
    expect(store.saveProfile('自宅')).toBe(true);
    const profile = useHomeTargetStore.getState().profiles[0];
    if (!profile) throw new Error('Expected a saved profile.');
    store.setHeightOfEye({ number: 180, unit: 'cm' });
    store.setPaper('a4');
    expect(profile.settings.heightOfEye.number).toBe(170);
    store.loadProfile(profile.id);
    expect(useHomeTargetStore.getState()).toMatchObject({ heightOfEye: { number: 170 }, paper: 'letter' });
    store.deleteProfile(profile.id);
    expect(useHomeTargetStore.getState().profiles).toEqual([]);
  });
  it('does not overwrite another setup with the same name or save invalid input', () => {
    const store = useHomeTargetStore.getState();
    expect(store.saveProfile(' 自宅 ')).toBe(true);
    expect(store.saveProfile('自宅')).toBe(false);
    store.setDistanceToTarget({ number: NaN, unit: 'm' });
    expect(store.saveProfile('別の設定')).toBe(false);
    expect(useHomeTargetStore.getState().profiles).toHaveLength(1);
  });
  it('restores settings and profiles after a fresh session', async () => {
    const store = useHomeTargetStore.getState();
    store.setDistanceToTarget({ number: 8, unit: 'm' });
    store.saveProfile('Home');
    const saved = window.localStorage.getItem('nilay-labs-target-v1')!;
    useHomeTargetStore.setState(useHomeTargetStore.getInitialState(), true);
    window.localStorage.setItem('nilay-labs-target-v1', saved);
    await useHomeTargetStore.persist.rehydrate();
    expect(useHomeTargetStore.getState()).toMatchObject({
      distanceToTarget: { number: 8 },
      profiles: [{ name: 'Home' }],
    });
  });
  it('ignores invalid saved shapes', async () => {
    window.localStorage.setItem(
      'nilay-labs-target-v1',
      JSON.stringify({ state: { language: 'en', settings: { discipline: null }, profiles: [] }, version: 0 }),
    );
    await useHomeTargetStore.persist.rehydrate();
    expect(useHomeTargetStore.getState().heightOfEye.number).toBe(170);
  });
  it('remains usable when browser storage rejects writes', () => {
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => useHomeTargetStore.getState().setHeightOfEye({ number: 180, unit: 'cm' })).not.toThrow();
    expect(useHomeTargetStore.getState().heightOfEye.number).toBe(180);
    expect(useStorageStatus.getState().available).toBe(false);
  });
  it('retains the last complete setup when a numeric draft is blank during reload', async () => {
    const store = useHomeTargetStore.getState();
    store.setHeightOfEye({ number: 185, unit: 'cm' });
    store.setDistanceToTarget({ number: 7, unit: 'm' });
    store.setDistanceToTarget({ number: NaN, unit: 'm' });
    const saved = window.localStorage.getItem('nilay-labs-target-v1')!;
    useHomeTargetStore.setState(useHomeTargetStore.getInitialState(), true);
    window.localStorage.setItem('nilay-labs-target-v1', saved);
    await useHomeTargetStore.persist.rehydrate();
    expect(useHomeTargetStore.getState()).toMatchObject({
      heightOfEye: { number: 185 },
      distanceToTarget: { number: 7 },
    });
  });
  it('updates only the selected profile, rejects duplicate names, and restores deleted settings', () => {
    const store = useHomeTargetStore.getState();
    store.saveProfile('Home');
    store.saveProfile('Club');
    const [home, club] = useHomeTargetStore.getState().profiles;
    if (!home || !club) throw new Error('Expected two saved profiles.');
    store.setDistanceToTarget({ number: 8, unit: 'm' });
    store.setCopies(4);
    store.setShowConditions(true);
    expect(store.updateProfile(home.id)).toBe(true);
    expect(store.renameProfile(home.id, 'Club')).toBe(false);
    expect(store.renameProfile(home.id, 'Practice')).toBe(true);
    store.deleteProfile(home.id);
    store.undoDelete();
    const profiles = useHomeTargetStore.getState().profiles;
    expect(profiles[0]).toMatchObject({
      id: home.id,
      name: 'Practice',
      settings: { distanceToTarget: { number: 8 }, copies: 4, showConditions: true },
    });
    expect(profiles[1]).toEqual(club);
    store.setDistanceToTarget({ number: NaN, unit: 'm' });
    expect(store.updateProfile(home.id)).toBe(false);
    store.loadProfile(home.id);
    expect(useHomeTargetStore.getState().distanceToTarget.number).toBe(8);
  });
  it('restores older saved setups with single-target print defaults', async () => {
    const {
      copies: _copies,
      showConditions: _showConditions,
      markers: _markers,
      ...settings
    } = useHomeTargetStore.getState().lastValidSettings;
    window.localStorage.setItem(
      'nilay-labs-target-v1',
      JSON.stringify({
        state: { language: 'ja', settings, profiles: [{ id: 'old', name: 'Home', settings }] },
        version: 0,
      }),
    );
    await useHomeTargetStore.persist.rehydrate();
    expect(useHomeTargetStore.getState()).toMatchObject({
      copies: 1,
      showConditions: false,
      markers: false,
      profiles: [{ settings: { copies: 1, showConditions: false, markers: false } }],
    });
  });

  it('says when a saved setup could not be read, and stays quiet on a first visit', async () => {
    expect(window.localStorage.getItem(TARGET_STORAGE_KEY)).toBeNull();
    await useHomeTargetStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);

    window.localStorage.setItem(TARGET_STORAGE_KEY, JSON.stringify({ state: { profiles: 'none' }, version: 0 }));
    await useHomeTargetStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([TARGET_STORAGE_KEY]);
    expect(useHomeTargetStore.getState()).toMatchObject({ profiles: [] });
  });

  it('speaks only for its own saved data', async () => {
    window.localStorage.setItem('nilay-labs-other-v1', '{broken');
    await useHomeTargetStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toEqual([]);
  });
});
