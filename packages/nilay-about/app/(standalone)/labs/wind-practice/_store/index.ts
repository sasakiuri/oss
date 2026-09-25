import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  MAX_PRACTICE_ATTEMPTS,
  windPracticeSettingsSchema,
  type WindPracticeSettings,
} from '@/lib/schemas/wind-practice';
import type { PracticeAttempt } from '@/lib/wind-practice';

export const storageKey = 'nilay-labs-wind-practice-v1';

const savedSchema = z.object({ settings: windPracticeSettingsSchema.nullable() });
type SavedState = z.infer<typeof savedSchema>;

interface WindPracticeStore extends WindPracticeSettings {
  lastValidSettings: WindPracticeSettings;
  setSettings: (changes: Partial<Omit<WindPracticeSettings, 'attempts'>>) => void;
  record: (attempt: PracticeAttempt) => void;
  clearAttempts: () => void;
}

/**
 * The trajectory tool's opening load, distances a rifle is hunted at, winds up to a strong breeze,
 * and tolerances of about a click and a tenth of the wind. Meant to be replaced.
 */
export const initialWindPracticeSettings: WindPracticeSettings = {
  kind: 'value',
  load: { muzzleSpeed: { value: 800, unit: 'mps' }, ballisticCoefficient: 0.45, dragModel: 'g1' },
  distanceUnit: 'm',
  windUnit: 'mps',
  angleUnit: 'mil',
  maxSpeed: 8,
  minDistance: 100,
  maxDistance: 300,
  distanceStep: 50,
  valueTolerance: 10,
  holdTolerance: 0.1,
  attempts: [],
};

export const useWindPracticeStore = create<WindPracticeStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<WindPracticeSettings>) => {
        const parsed = windPracticeSettingsSchema.safeParse({ ...get(), ...changes });
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialWindPracticeSettings,
        lastValidSettings: initialWindPracticeSettings,
        setSettings: (changes) => edit(changes),
        record: (attempt) => edit({ attempts: [...get().attempts, attempt].slice(-MAX_PRACTICE_ATTEMPTS) }),
        clearAttempts: () => edit({ attempts: [] }),
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
