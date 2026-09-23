import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  outingsSchema,
  prefectureSchema,
  registrationDatesSchema,
  type HuntingOuting,
  type Prefecture,
} from '@/lib/schemas/hunting-log';

export const HUNTING_LOG_STORAGE_KEY = 'nilay-labs-hunting-log-v1';

const savedSchema = z.object({
  outings: outingsSchema,
  prefecture: prefectureSchema.nullable(),
  registrationDates: registrationDatesSchema,
});
type SavedState = z.infer<typeof savedSchema>;

interface HuntingLogStore {
  outings: HuntingOuting[];
  /**
   * The prefecture the form opens with: the one used last, since a season is mostly spent in one.
   * None until the first record, so no prefecture is put forward that the reader never chose.
   */
  prefecture: Prefecture | null;
  /** The day each registration was granted, by report group key. Absent until the reader enters it. */
  registrationDates: Record<string, string>;
  saveOuting: (outing: HuntingOuting) => void;
  removeOuting: (id: string) => void;
  setRegistrationDate: (groupKey: string, date: string | null) => void;
  clearAll: () => void;
}

export const initialHuntingLogState: Pick<HuntingLogStore, 'outings' | 'prefecture' | 'registrationDates'> = {
  outings: [],
  prefecture: null,
  registrationDates: {},
};

export const useHuntingLogStore = create<HuntingLogStore>()(
  persist(
    (set) => ({
      ...initialHuntingLogState,
      // A new id is added; an id already in the log is replaced in place.
      saveOuting: (outing) =>
        set((state) => ({
          prefecture: outing.prefecture,
          outings: state.outings.some((item) => item.id === outing.id)
            ? state.outings.map((item) => (item.id === outing.id ? outing : item))
            : [...state.outings, outing],
        })),
      removeOuting: (id) => set((state) => ({ outings: state.outings.filter((item) => item.id !== id) })),
      setRegistrationDate: (groupKey, date) =>
        set((state) => {
          const { [groupKey]: _removed, ...rest } = state.registrationDates;
          return { registrationDates: date ? { ...rest, [groupKey]: date } : rest };
        }),
      clearAll: () => set({ ...initialHuntingLogState }),
    }),
    {
      name: HUNTING_LOG_STORAGE_KEY,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({
        outings: state.outings,
        prefecture: state.prefecture,
        registrationDates: state.registrationDates,
      }),
      merge: (saved, current) => {
        // A first visit has nothing stored, and persist still calls merge.
        if (saved === undefined) return current;
        const parsed = savedSchema.safeParse(saved);
        if (!parsed.success) {
          // Opening with an empty log in silence would read as a season of records gone missing.
          reportDiscardedSave(HUNTING_LOG_STORAGE_KEY);
          return current;
        }
        return {
          ...current,
          outings: parsed.data.outings,
          prefecture: parsed.data.prefecture,
          registrationDates: parsed.data.registrationDates,
        };
      },
    },
  ),
);
