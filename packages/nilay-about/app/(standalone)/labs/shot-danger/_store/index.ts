import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { shotDangerSettingsSchema, type ShotDangerSettings } from '@/lib/schemas/shot-danger';

export const storageKey = 'nilay-labs-shot-danger-v1';

const savedSchema = z.object({ settings: shotDangerSettingsSchema });
type SavedState = z.infer<typeof savedSchema>;

interface ShotDangerStore extends ShotDangerSettings {
  lastValidSettings: ShotDangerSettings;
  edit: (changes: Partial<ShotDangerSettings>) => void;
  reset: () => void;
}

/** A 12-gauge slug, with no firing point until one is chosen. */
export const initialShotDangerSettings: ShotDangerSettings = {
  ammunition: '12-gauge-slug',
  firing: null,
  bearing: 0,
};

const pick = ({ ammunition, firing, bearing }: ShotDangerSettings): ShotDangerSettings => ({
  ammunition,
  firing,
  bearing,
});

export const useShotDangerStore = create<ShotDangerStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<ShotDangerSettings>) => {
        const parsed = shotDangerSettingsSchema.safeParse({ ...pick(get()), ...changes });
        // Keep the last complete settings while a number is being typed.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialShotDangerSettings,
        lastValidSettings: initialShotDangerSettings,
        edit,
        reset: () => set({ ...initialShotDangerSettings, lastValidSettings: initialShotDangerSettings }),
      };
    },
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
