import { afterEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage } from '@/lib/browser-storage';
import { savedAsShown } from '@/lib/persisted-store';

const KEY = 'nilay-labs-test-saved-v1';

function makeStore() {
  return create<{ items: string[]; draft: string; set: (items: string[]) => void }>()(
    persist((set) => ({ items: [], draft: '', set: (items) => set({ items }) }), {
      name: KEY,
      storage: browserStorage as PersistStorage<{ items: string[] }>,
      partialize: (state) => ({ items: state.items }),
    }),
  );
}

describe('savedAsShown', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('says a change is on disk when what is saved is what the store keeps', () => {
    const store = makeStore();
    store.getState().set(['a']);
    expect(savedAsShown(store)).toBe(true);
    // A field the store does not save changes nothing.
    store.setState({ draft: 'typing' });
    expect(savedAsShown(store)).toBe(true);
  });

  it('says a change is not on disk when the write failed', () => {
    const store = makeStore();
    store.getState().set(['a']);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    store.getState().set([]);
    expect(savedAsShown(store)).toBe(false);
  });
});
