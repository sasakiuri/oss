import { beforeEach, describe, expect, it } from 'vitest';

import {
  initialUnitConverterSettings,
  storageKey,
  useUnitConverterStore,
} from '@/app/(standalone)/labs/unit-converter/_store';
import { useStorageStatus } from '@/lib/browser-storage';

describe('unit converter settings', () => {
  beforeEach(() => {
    useUnitConverterStore.setState(useUnitConverterStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('keeps a value for each quantity and restores them after a fresh session', async () => {
    const store = useUnitConverterStore.getState();
    store.setEntry('pressure', { value: 250, unit: 'psi' });
    store.setQuantity('torque');
    store.setEntry('torque', { value: 18, unit: 'in-lb' });
    const saved = window.localStorage.getItem(storageKey)!;
    useUnitConverterStore.setState(useUnitConverterStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useUnitConverterStore.persist.rehydrate();
    expect(useUnitConverterStore.getState()).toMatchObject({
      quantity: 'torque',
      entries: { pressure: { value: 250, unit: 'psi' }, torque: { value: 18, unit: 'in-lb' } },
    });
  });

  it('discards a save whose unit belongs to another quantity, and says so', async () => {
    const settings = {
      ...initialUnitConverterSettings,
      entries: { ...initialUnitConverterSettings.entries, pressure: { value: 1, unit: 'nm' } },
    };
    window.localStorage.setItem(storageKey, JSON.stringify({ state: { settings }, version: 0 }));
    await useUnitConverterStore.persist.rehydrate();
    expect(useUnitConverterStore.getState()).toMatchObject(initialUnitConverterSettings);
    expect(useStorageStatus.getState().discarded).toEqual([storageKey]);
  });
});
