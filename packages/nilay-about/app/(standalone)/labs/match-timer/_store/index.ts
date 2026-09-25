import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { DEFAULT_PROGRAM_OPTIONS } from '@/lib/match-timer';

export const storageKey = 'nilay-labs-match-timer-v1';

export const matchTimerSettingsSchema = z.object({
  program: z.enum(['air-qualification', 'prone-qualification', '3p-qualification', 'air-final', '3p-final']),
  finalGapSeconds: z.number().finite().min(0).max(120),
  outdoor: z.boolean(),
  pistol: z.boolean(),
  /** Read the commands in English as written, in this tool's Japanese, or only beep. */
  voice: z.enum(['en', 'ja', 'beep']),
});
export type MatchTimerSettings = z.infer<typeof matchTimerSettingsSchema>;

export const initialMatchTimerSettings: MatchTimerSettings = {
  program: 'air-qualification',
  ...DEFAULT_PROGRAM_OPTIONS,
  voice: 'en',
};

const savedSchema = z.object({ settings: matchTimerSettingsSchema });
type SavedState = z.infer<typeof savedSchema>;

interface MatchTimerStore extends MatchTimerSettings {
  lastValidSettings: MatchTimerSettings;
  edit: (changes: Partial<MatchTimerSettings>) => void;
  reset: () => void;
}

export const useMatchTimerStore = create<MatchTimerStore>()(
  persist(
    (set, get) => ({
      ...initialMatchTimerSettings,
      lastValidSettings: initialMatchTimerSettings,
      edit: (changes) => {
        const parsed = matchTimerSettingsSchema.safeParse({ ...get(), ...changes });
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      },
      reset: () => set({ ...initialMatchTimerSettings, lastValidSettings: initialMatchTimerSettings }),
    }),
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ settings: state.lastValidSettings }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) return { ...current, ...parsed.data.settings, lastValidSettings: parsed.data.settings };
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
