import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  CURE_MIX_MAX_INGREDIENTS,
  cureMixSettingsSchema,
  type CureMixIngredient,
  type CureMixSettings,
} from '@/lib/schemas/cure-mix';

export const storageKey = 'nilay-labs-cure-mix-v1';

const savedSchema = z.object({ settings: cureMixSettingsSchema });
type SavedState = z.infer<typeof savedSchema>;

/**
 * No recipe is filled in: the salt, the curing agent and the spices are the reader's recipe, and the
 * tool has no source that would make one amount the right one.
 */
export const initialCureMixSettings: CureMixSettings = {
  leanG: 1000,
  fatG: null,
  waterG: null,
  basis: 'meat',
  saltPercent: null,
  useCure: false,
  curePercent: null,
  cureNitritePercent: null,
  cureExpressedAs: 'sodiumNitrite',
  cureSaltPercent: null,
  ingredients: [],
  leanPricePerKg: null,
  fatPricePerKg: null,
  saltPricePerKg: null,
  curePricePerKg: null,
  linkG: null,
  casingGPerM: null,
  casingPricePerM: null,
};

type ScalarKey = Exclude<keyof CureMixSettings, 'ingredients'>;

interface CureMixStore {
  settings: CureMixSettings;
  set: <K extends ScalarKey>(key: K, value: CureMixSettings[K]) => void;
  addIngredient: () => void;
  updateIngredient: (id: string, changes: Partial<Omit<CureMixIngredient, 'id'>>) => void;
  removeIngredient: (id: string) => void;
  reset: () => void;
}

export const useCureMixStore = create<CureMixStore>()(
  persist(
    (set) => ({
      settings: initialCureMixSettings,
      set: (key, value) => set((state) => ({ settings: { ...state.settings, [key]: value } })),
      addIngredient: () =>
        set((state) =>
          state.settings.ingredients.length >= CURE_MIX_MAX_INGREDIENTS
            ? state
            : {
                settings: {
                  ...state.settings,
                  ingredients: [
                    ...state.settings.ingredients,
                    { id: crypto.randomUUID(), name: '', percent: null, pricePerKg: null },
                  ],
                },
              },
        ),
      updateIngredient: (id, changes) =>
        set((state) => ({
          settings: {
            ...state.settings,
            ingredients: state.settings.ingredients.map((item) => (item.id === id ? { ...item, ...changes } : item)),
          },
        })),
      removeIngredient: (id) =>
        set((state) => ({
          settings: { ...state.settings, ingredients: state.settings.ingredients.filter((item) => item.id !== id) },
        })),
      reset: () => set({ settings: initialCureMixSettings }),
    }),
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ settings: state.settings }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) return { ...current, settings: parsed.data.settings };
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
