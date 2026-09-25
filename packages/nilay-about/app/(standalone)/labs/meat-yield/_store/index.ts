import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { saleCuts } from '@/lib/game-cuts';
import { referenceRatios } from '@/lib/meat-yield';
import {
  MEAT_YIELD_MAX_ROWS,
  meatYieldSettingsSchema,
  type MeatYieldCost,
  type MeatYieldPart,
  type MeatYieldSettings,
  type MeatYieldSpecies,
  type WeighedStage,
  type YieldRatios,
} from '@/lib/schemas/meat-yield';

export const storageKey = 'nilay-labs-meat-yield-v1';

const savedSchema = z.object({
  settings: meatYieldSettingsSchema.nullable(),
});
type SavedState = z.infer<typeof savedSchema>;

interface MeatYieldStore extends MeatYieldSettings {
  lastValidSettings: MeatYieldSettings;
  /** Picking a species puts in the shares the sources give for it and empties the rest. */
  setSpecies: (species: MeatYieldSpecies) => void;
  setStage: (stage: WeighedStage) => void;
  setWeightKg: (weightKg: number) => void;
  setRatio: (stage: keyof YieldRatios, percent: number | null) => void;
  /** Puts back the sources' shares for the species already chosen. */
  restoreReferenceRatios: () => void;
  setPackGrams: (packGrams: number) => void;
  setFreezerKg: (freezerKg: number | null) => void;
  /** Adds a row for each cut on the certification scheme's chart that is not in the list yet. */
  addChartCuts: (language: 'ja' | 'en') => void;
  addPart: () => void;
  updatePart: (id: string, changes: Partial<Omit<MeatYieldPart, 'id'>>) => void;
  removePart: (id: string) => void;
  addCost: () => void;
  updateCost: (id: string, changes: Partial<Omit<MeatYieldCost, 'id'>>) => void;
  removeCost: (id: string) => void;
  setSubsidyYen: (yen: number | null) => void;
}

// 30 kg is the weight per deer the processing manual works its own example with.
export const initialMeatYieldSettings: MeatYieldSettings = {
  species: 'deer',
  stage: 'whole',
  weightKg: 30,
  ratios: referenceRatios('deer'),
  packGrams: 500,
  freezerKg: null,
};

const newId = () => crypto.randomUUID();

export const useMeatYieldStore = create<MeatYieldStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<MeatYieldSettings>) => {
        const parsed = meatYieldSettingsSchema.safeParse({ ...get(), ...changes });
        // Keep the last complete settings while a numeric field is being edited.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialMeatYieldSettings,
        lastValidSettings: initialMeatYieldSettings,
        setSpecies: (species) => edit({ species, ratios: referenceRatios(species) }),
        setStage: (stage) => edit({ stage }),
        setWeightKg: (weightKg) => edit({ weightKg }),
        setRatio: (stage, percent) => edit({ ratios: { ...get().ratios, [stage]: percent } }),
        restoreReferenceRatios: () => edit({ ratios: referenceRatios(get().species) }),
        setPackGrams: (packGrams) => edit({ packGrams }),
        setFreezerKg: (freezerKg) => edit({ freezerKg }),
        addChartCuts: (language) => {
          const species = get().species;
          if (species === 'other') return;
          const names = new Set((get().parts ?? []).map((part) => part.name.trim()));
          const added = saleCuts(species)
            .map((cut) => cut[language])
            .filter((name) => !names.has(name))
            .map((name) => ({ id: newId(), name, percent: null, pricePerKg: null }));
          edit({ parts: [...(get().parts ?? []), ...added].slice(0, MEAT_YIELD_MAX_ROWS) });
        },
        addPart: () => {
          if ((get().parts ?? []).length >= MEAT_YIELD_MAX_ROWS) return;
          edit({ parts: [...(get().parts ?? []), { id: newId(), name: '', percent: null, pricePerKg: null }] });
        },
        updatePart: (id, changes) =>
          edit({ parts: (get().parts ?? []).map((part) => (part.id === id ? { ...part, ...changes } : part)) }),
        removePart: (id) => edit({ parts: (get().parts ?? []).filter((part) => part.id !== id) }),
        addCost: () => {
          if ((get().costs ?? []).length >= MEAT_YIELD_MAX_ROWS) return;
          edit({ costs: [...(get().costs ?? []), { id: newId(), name: '', yen: null }] });
        },
        updateCost: (id, changes) =>
          edit({ costs: (get().costs ?? []).map((cost) => (cost.id === id ? { ...cost, ...changes } : cost)) }),
        removeCost: (id) => edit({ costs: (get().costs ?? []).filter((cost) => cost.id !== id) }),
        setSubsidyYen: (subsidyYen) => edit({ subsidyYen }),
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
        // A first visit stores nothing, but unreadable data is a loss the tool has to own up to.
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
