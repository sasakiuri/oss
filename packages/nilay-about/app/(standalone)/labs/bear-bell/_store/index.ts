import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import type { BellTone, Sensitivity } from '@/lib/bear-bell';
import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { bearBellSettingsSchema, type BearBellSettings, type BellMode } from '@/lib/schemas/bear-bell';

export const BEAR_BELL_STORAGE_KEY = 'nilay-labs-bear-bell-v1';

const savedSchema = z.object({ settings: bearBellSettingsSchema });
type SavedState = z.infer<typeof savedSchema>;

export const initialBearBellSettings: BearBellSettings = {
  tone: 'bright',
  volumePercent: 80,
  mode: 'interval',
  intervalSeconds: 3,
  varyInterval: false,
  varyVolume: false,
  sensitivity: 3,
  autoOffMinutes: 0,
  keepScreenOn: true,
  checked: [],
};

interface BearBellStore extends BearBellSettings {
  /** The last complete settings, which the bell rings with and which are saved. */
  lastValidSettings: BearBellSettings;
  setTone: (tone: BellTone) => void;
  setVolumePercent: (volumePercent: number) => void;
  setMode: (mode: BellMode) => void;
  setIntervalSeconds: (intervalSeconds: number) => void;
  setVaryInterval: (vary: boolean) => void;
  setVaryVolume: (vary: boolean) => void;
  setSensitivity: (sensitivity: Sensitivity) => void;
  setAutoOffMinutes: (minutes: number) => void;
  setKeepScreenOn: (keep: boolean) => void;
  toggleChecked: (id: string) => void;
  clearChecked: () => void;
}

const settingsOf = (state: BearBellSettings): BearBellSettings => ({
  tone: state.tone,
  volumePercent: state.volumePercent,
  mode: state.mode,
  intervalSeconds: state.intervalSeconds,
  varyInterval: state.varyInterval,
  varyVolume: state.varyVolume,
  sensitivity: state.sensitivity,
  autoOffMinutes: state.autoOffMinutes,
  keepScreenOn: state.keepScreenOn,
  checked: state.checked,
});

export const useBearBellStore = create<BearBellStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<BearBellSettings>) => {
        const parsed = bearBellSettingsSchema.safeParse({ ...settingsOf(get()), ...changes });
        // A number field being typed into keeps the bell on the last complete settings.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialBearBellSettings,
        lastValidSettings: initialBearBellSettings,
        setTone: (tone) => edit({ tone }),
        setVolumePercent: (volumePercent) => edit({ volumePercent }),
        setMode: (mode) => edit({ mode }),
        setIntervalSeconds: (intervalSeconds) => edit({ intervalSeconds }),
        setVaryInterval: (varyInterval) => edit({ varyInterval }),
        setVaryVolume: (varyVolume) => edit({ varyVolume }),
        setSensitivity: (sensitivity) => edit({ sensitivity }),
        setAutoOffMinutes: (autoOffMinutes) => edit({ autoOffMinutes }),
        setKeepScreenOn: (keepScreenOn) => edit({ keepScreenOn }),
        toggleChecked: (id) => {
          const checked = get().checked;
          edit({ checked: checked.includes(id) ? checked.filter((item) => item !== id) : [...checked, id] });
        },
        clearChecked: () => edit({ checked: [] }),
      };
    },
    {
      name: BEAR_BELL_STORAGE_KEY,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ settings: state.lastValidSettings }),
      merge: (saved, current) => {
        if (saved === undefined) return current;
        const parsed = savedSchema.safeParse(saved);
        if (!parsed.success) {
          reportDiscardedSave(BEAR_BELL_STORAGE_KEY);
          return current;
        }
        return { ...current, ...parsed.data.settings, lastValidSettings: parsed.data.settings };
      },
    },
  ),
);
