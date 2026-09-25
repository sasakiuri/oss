import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { prefectureSchema, type Prefecture } from '@/lib/schemas/hunting-log';

export const HUNTING_SEASONS_STORAGE_KEY = 'nilay-labs-hunting-seasons-v1';

// Only the prefecture is kept: the day opens on today each visit.
const savedSchema = z.object({ prefecture: prefectureSchema });
type SavedState = z.infer<typeof savedSchema>;

interface HuntingSeasonsStore {
  prefecture: Prefecture;
  /** An ISO date, or empty for today. */
  day: string;
  setPrefecture: (prefecture: Prefecture) => void;
  setDay: (day: string) => void;
}

export const initialHuntingSeasonsState = { prefecture: '北海道' as Prefecture, day: '' };

export const useHuntingSeasonsStore = create<HuntingSeasonsStore>()(
  persist(
    (set) => ({
      ...initialHuntingSeasonsState,
      setPrefecture: (prefecture) => set({ prefecture }),
      setDay: (day) => set({ day }),
    }),
    {
      name: HUNTING_SEASONS_STORAGE_KEY,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ prefecture: state.prefecture }),
      merge: (saved, current) => {
        if (saved === undefined) return current;
        const parsed = savedSchema.safeParse(saved);
        if (!parsed.success) {
          reportDiscardedSave(HUNTING_SEASONS_STORAGE_KEY);
          return current;
        }
        return { ...current, prefecture: parsed.data.prefecture };
      },
    },
  ),
);
