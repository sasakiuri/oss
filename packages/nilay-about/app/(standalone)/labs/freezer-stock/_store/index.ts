import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { FREEZER_MAX_ITEMS, freezerItemSchema, type FreezerItem } from '@/lib/schemas/freezer-stock';

export const storageKey = 'nilay-labs-freezer-stock-v1';

// The envelope only: each line is read on its own, so one damaged line does not take the rest with it.
const savedSchema = z.object({ items: z.array(z.unknown()) });
interface SavedState {
  items: FreezerItem[];
}

export function readSavedFreezerItems(saved: unknown): { items: FreezerItem[]; lost: boolean } {
  const envelope = savedSchema.safeParse(saved);
  if (!envelope.success) return { items: [], lost: true };
  const items: FreezerItem[] = [];
  let lost = false;
  for (const entry of envelope.data.items) {
    const parsed = freezerItemSchema.safeParse(entry);
    if (parsed.success && !items.some((item) => item.id === parsed.data.id)) items.push(parsed.data);
    else lost = true;
  }
  return { items, lost };
}

interface FreezerStore {
  items: FreezerItem[];
  /** Adds a line and returns false once the list is full. */
  addItem: (item: Omit<FreezerItem, 'id'>) => boolean;
  updateItem: (id: string, changes: Partial<Omit<FreezerItem, 'id'>>) => void;
  /** Takes one pack out. A line at 0 stays, so what was used is still on the list until it is removed. */
  takeOne: (id: string) => void;
  removeItem: (id: string) => void;
  removeEmpty: () => void;
  deleteAll: () => void;
}

export const useFreezerStore = create<FreezerStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => {
        if (get().items.length >= FREEZER_MAX_ITEMS) return false;
        set((state) => ({ items: [...state.items, { ...item, id: crypto.randomUUID() }] }));
        return true;
      },
      updateItem: (id, changes) =>
        set((state) => ({ items: state.items.map((item) => (item.id === id ? { ...item, ...changes } : item)) })),
      takeOne: (id) =>
        set((state) => ({
          items: state.items.map((item) => (item.id === id ? { ...item, packs: Math.max(0, item.packs - 1) } : item)),
        })),
      removeItem: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      removeEmpty: () => set((state) => ({ items: state.items.filter((item) => item.packs > 0) })),
      deleteAll: () => set({ items: [] }),
    }),
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ items: state.items }),
      merge: (saved, current) => {
        if (saved === undefined) return { ...current, items: [] };
        const { items, lost } = readSavedFreezerItems(saved);
        if (lost) reportDiscardedSave(storageKey);
        return { ...current, items };
      },
    },
  ),
);
