import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { unitConverterSettingsSchema, type UnitConverterSettings } from '@/lib/schemas/unit-converter';
import type { UnitQuantity } from '@/lib/unit-converter';

export const storageKey = 'nilay-labs-unit-converter-v1';

const savedSchema = z.object({ settings: unitConverterSettingsSchema.nullable() });
type SavedState = z.infer<typeof savedSchema>;

interface UnitConverterStore extends UnitConverterSettings {
  lastValidSettings: UnitConverterSettings;
  setQuantity: (quantity: UnitQuantity) => void;
  setEntry: (quantity: UnitQuantity, entry: { value: number; unit: string }) => void;
}

/**
 * Each quantity opens on a figure a shooter looks up: a PCP fill of 200 bar, a ring screw at
 * 2.5 N·m, 800 m/s, a 10 g bullet, 3000 J, 100 m and one MOA. Meant to be replaced.
 */
export const initialUnitConverterSettings: UnitConverterSettings = {
  quantity: 'pressure',
  entries: {
    pressure: { value: 200, unit: 'bar' },
    torque: { value: 2.5, unit: 'nm' },
    velocity: { value: 800, unit: 'mps' },
    mass: { value: 10, unit: 'g' },
    energy: { value: 3000, unit: 'j' },
    length: { value: 100, unit: 'm' },
    angle: { value: 1, unit: 'moa' },
  },
};

export const useUnitConverterStore = create<UnitConverterStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<UnitConverterSettings>) => {
        const parsed = unitConverterSettingsSchema.safeParse({ ...get(), ...changes });
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialUnitConverterSettings,
        lastValidSettings: initialUnitConverterSettings,
        setQuantity: (quantity) => edit({ quantity }),
        setEntry: (quantity, entry) => edit({ entries: { ...get().entries, [quantity]: entry } }),
      };
    },
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ settings: state.lastValidSettings }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success)
          return {
            ...current,
            ...parsed.data.settings,
            lastValidSettings: parsed.data.settings ?? current.lastValidSettings,
          };
        // A first visit stores nothing; only unreadable data is reported.
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
