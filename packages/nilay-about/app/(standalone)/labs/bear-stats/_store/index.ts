import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { resolveYear } from '@/lib/bear-stats';
import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  bearStatsSettingsSchema,
  type BearArea,
  type BearDataset,
  type BearStatsSettings,
  type CaptureMetric,
  type InjuryMetric,
} from '@/lib/schemas/bear-stats';

export const storageKey = 'nilay-labs-bear-stats-v1';

const savedSchema = z.object({
  settings: bearStatsSettingsSchema.nullable(),
});
type SavedState = z.infer<typeof savedSchema>;

interface BearStatsStore extends BearStatsSettings {
  setDataset: (dataset: BearDataset) => void;
  setArea: (area: BearArea) => void;
  setYear: (year: number) => void;
  setInjuryMetric: (metric: InjuryMetric) => void;
  setCaptureMetric: (metric: CaptureMetric) => void;
}

/** The last whole fiscal year, which every dataset has. */
export const initialBearStatsSettings: BearStatsSettings = {
  dataset: 'injuries',
  area: 'national',
  year: 2025,
  injuryMetric: 'cases',
  captureMetric: 'total',
};

const settingsOf = (state: BearStatsSettings): BearStatsSettings => ({
  dataset: state.dataset,
  area: state.area,
  year: state.year,
  injuryMetric: state.injuryMetric,
  captureMetric: state.captureMetric,
});

export const useBearStatsStore = create<BearStatsStore>()(
  persist(
    (set, get) => ({
      ...initialBearStatsSettings,
      // A dataset that does not reach back to the chosen year shows its nearest year instead.
      setDataset: (dataset) => set({ dataset, year: resolveYear(dataset, get().year) }),
      setArea: (area) => set({ area }),
      setYear: (year) => set({ year: resolveYear(get().dataset, year) }),
      setInjuryMetric: (injuryMetric) => set({ injuryMetric }),
      setCaptureMetric: (captureMetric) => set({ captureMetric }),
    }),
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ settings: settingsOf(state) }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) {
          const settings = parsed.data.settings;
          if (!settings) return current;
          return { ...current, ...settings, year: resolveYear(settings.dataset, settings.year) };
        }
        // A first visit has nothing saved; report only data that could not be read.
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
