import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { FUNRYU_EXAMPLE_TEMPERATURES } from '@/lib/deer-density';

export const DEER_DENSITY_STORAGE_KEY = 'nilay-labs-deer-density-v1';

const finite = z.number().finite();
const positive = finite.positive();
const nonNegative = finite.nonnegative();

export const deerDensitySettingsSchema = z.object({
  method: z.enum(['rem', 'clearance', 'funryu']),
  rem: z.object({
    photos: nonNegative,
    cameraDays: positive,
    dayRangeKm: positive,
    radiusM: positive,
    angleDegrees: finite.min(0).max(360),
    groupSize: positive,
  }),
  clearance: z
    .object({
      pelletsPerM2: nonNegative,
      placed: positive,
      remaining: positive,
      days: positive,
      pelletsPerDay: positive,
    })
    // Some pellets have to be gone, or the rate of loss is not defined.
    .refine((clearance) => clearance.remaining < clearance.placed, { path: ['remaining'] }),
  funryu: z.object({
    pelletsPerM2: nonNegative,
    surveyMonth: z.number().int().min(1).max(12),
    temperatures: z.array(finite).length(12),
  }),
});
export type DeerDensitySettings = z.infer<typeof deerDensitySettingsSchema>;
export type DensityMethod = DeerDensitySettings['method'];

// The REM values are those of the Gunma sika deer study (r = 18.1 m, θ = 57°, v = 7.4 km/day); the
// counts are placeholders to be replaced. FUNRYU opens on the paper's own worked example.
export const initialDeerDensitySettings: DeerDensitySettings = {
  method: 'rem',
  rem: { photos: 100, cameraDays: 300, dayRangeKm: 7.4, radiusM: 18.1, angleDegrees: 57, groupSize: 1 },
  clearance: { pelletsPerM2: 1, placed: 100, remaining: 80, days: 30, pelletsPerDay: 1385 },
  funryu: { pelletsPerM2: 2.17, surveyMonth: 1, temperatures: [...FUNRYU_EXAMPLE_TEMPERATURES] },
};

interface DeerDensityStore extends DeerDensitySettings {
  lastValidSettings: DeerDensitySettings;
  setMethod: (method: DensityMethod) => void;
  setRem: (key: keyof DeerDensitySettings['rem'], value: number) => void;
  setClearance: (key: keyof DeerDensitySettings['clearance'], value: number) => void;
  setFunryu: (change: Partial<DeerDensitySettings['funryu']>) => void;
}

const settingsOf = (state: DeerDensitySettings): DeerDensitySettings => ({
  method: state.method,
  rem: state.rem,
  clearance: state.clearance,
  funryu: state.funryu,
});

export const useDeerDensityStore = create<DeerDensityStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<DeerDensitySettings>) => {
        const parsed = deerDensitySettingsSchema.safeParse({ ...settingsOf(get()), ...changes });
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialDeerDensitySettings,
        lastValidSettings: initialDeerDensitySettings,
        setMethod: (method) => edit({ method }),
        setRem: (key, value) => edit({ rem: { ...get().rem, [key]: value } }),
        setClearance: (key, value) => edit({ clearance: { ...get().clearance, [key]: value } }),
        setFunryu: (change) => edit({ funryu: { ...get().funryu, ...change } }),
      };
    },
    {
      name: DEER_DENSITY_STORAGE_KEY,
      storage: browserStorage as PersistStorage<{ settings: DeerDensitySettings }>,
      skipHydration: true,
      partialize: (state) => ({ settings: state.lastValidSettings }),
      merge: (saved, current) => {
        if (saved === undefined) return current;
        const parsed = z.object({ settings: deerDensitySettingsSchema }).safeParse(saved);
        if (!parsed.success) {
          reportDiscardedSave(DEER_DENSITY_STORAGE_KEY);
          return current;
        }
        return { ...current, ...parsed.data.settings, lastValidSettings: parsed.data.settings };
      },
    },
  ),
);
