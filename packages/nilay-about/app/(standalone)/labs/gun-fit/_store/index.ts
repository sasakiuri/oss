import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { convertFitSheet, emptyFitSheet } from '@/lib/gun-fit';
import {
  eyeTrialSchema,
  fitSheetSchema,
  savedFitSheetSchema,
  type EyeTrial,
  type FitSheet,
  type FitUnit,
} from '@/lib/schemas/gun-fit';

export const storageKey = 'nilay-labs-gun-fit-v1';

/** Enough trials to see a preference; more than this is repetition, not information. */
export const MAX_EYE_TRIALS = 9;

const savedSchema = z.object({
  sheet: fitSheetSchema,
  sheets: z.array(savedFitSheetSchema),
  trials: z.array(eyeTrialSchema).max(MAX_EYE_TRIALS),
});
type SavedState = z.infer<typeof savedSchema>;

interface GunFitStore extends SavedState {
  // Saved sheets are SavedFitSheet records; the working sheet has no id until it is saved.
  setSheet: (changes: Partial<FitSheet>) => void;
  /** Converts every measurement, so the sheet keeps describing the same stock. */
  setUnit: (unit: FitUnit) => void;
  /** Saves under the sheet's name, replacing a sheet of the same name. False without a name. */
  saveSheet: () => boolean;
  loadSheet: (id: string) => void;
  deleteSheet: (id: string) => void;
  clearSheet: () => void;
  addTrial: (trial: EyeTrial) => void;
  clearTrials: () => void;
}

export const useGunFitStore = create<GunFitStore>()(
  persist(
    (set, get) => ({
      sheet: emptyFitSheet(),
      sheets: [],
      trials: [],
      setSheet: (changes) => set((state) => ({ sheet: { ...state.sheet, ...changes } })),
      setUnit: (unit) => set((state) => ({ sheet: convertFitSheet(state.sheet, unit) })),
      saveSheet: () => {
        const { sheet, sheets } = get();
        const existing = sheets.find((item) => item.name === sheet.name.trim());
        const parsed = savedFitSheetSchema.safeParse({
          ...sheet,
          name: sheet.name.trim(),
          id: existing?.id ?? crypto.randomUUID(),
          savedAt: new Date().toISOString(),
        });
        if (!parsed.success) return false;
        set({
          sheets: existing
            ? sheets.map((item) => (item.id === existing.id ? parsed.data : item))
            : [...sheets, parsed.data],
        });
        return true;
      },
      loadSheet: (id) => {
        const found = get().sheets.find((item) => item.id === id);
        if (!found) return;
        const { id: _id, savedAt: _savedAt, ...sheet } = found;
        set({ sheet });
      },
      deleteSheet: (id) => set((state) => ({ sheets: state.sheets.filter((item) => item.id !== id) })),
      clearSheet: () => set((state) => ({ sheet: { ...emptyFitSheet(), unit: state.sheet.unit } })),
      addTrial: (trial) =>
        set((state) => (state.trials.length >= MAX_EYE_TRIALS ? state : { trials: [...state.trials, trial] })),
      clearTrials: () => set({ trials: [] }),
    }),
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: ({ sheet, sheets, trials }) => ({ sheet, sheets, trials }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) return { ...current, ...parsed.data };
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
