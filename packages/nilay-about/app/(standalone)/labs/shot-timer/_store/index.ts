import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { DEFAULT_DETECTOR } from '@/lib/shot-timer';

export const storageKey = 'nilay-labs-shot-timer-v1';

const finite = z.number().finite();

export const shotTimerSettingsSchema = z.object({
  delayMode: z.enum(['fixed', 'random']),
  fixedDelay: finite.min(0).max(60),
  minDelay: finite.min(0).max(60),
  maxDelay: finite.min(0).max(60),
  /** Seconds after the start beep for the second beep, or null for none. */
  par: finite.positive().max(600).nullable(),
  useMicrophone: z.boolean(),
  thresholdDb: finite.min(-60).max(0),
  deadTimeMs: finite.min(10).max(1000),
});
export type ShotTimerSettings = z.infer<typeof shotTimerSettingsSchema>;

export const initialShotTimerSettings: ShotTimerSettings = {
  delayMode: 'random',
  fixedDelay: 3,
  minDelay: 2,
  maxDelay: 5,
  par: null,
  useMicrophone: true,
  thresholdDb: DEFAULT_DETECTOR.thresholdDb,
  deadTimeMs: DEFAULT_DETECTOR.deadTimeMs,
};

const savedSchema = z.object({ settings: shotTimerSettingsSchema });
type SavedState = z.infer<typeof savedSchema>;

interface ShotTimerStore extends ShotTimerSettings {
  lastValidSettings: ShotTimerSettings;
  edit: (changes: Partial<ShotTimerSettings>) => void;
  reset: () => void;
}

export const useShotTimerStore = create<ShotTimerStore>()(
  persist(
    (set, get) => ({
      ...initialShotTimerSettings,
      lastValidSettings: initialShotTimerSettings,
      // A half-typed number is kept on screen but only a complete set of settings is stored.
      edit: (changes) => {
        const parsed = shotTimerSettingsSchema.safeParse({ ...get(), ...changes });
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      },
      reset: () => set({ ...initialShotTimerSettings, lastValidSettings: initialShotTimerSettings }),
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
