import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  reticleRangingSettingsSchema,
  type FocalPlane,
  type ReticleRangingSettings,
  type ReticleUnit,
  type SolveFor,
  type TargetSizeUnit,
} from '@/lib/schemas/reticle-ranging';
import type { DistanceUnit } from '@/lib/schemas/sight-adjustment';

export const storageKey = 'nilay-labs-reticle-ranging-v1';

const savedSchema = z.object({
  settings: reticleRangingSettingsSchema.nullable(),
});
type SavedState = z.infer<typeof savedSchema>;

interface ReticleRangingStore extends ReticleRangingSettings {
  lastValidSettings: ReticleRangingSettings;
  setSolveFor: (solveFor: SolveFor) => void;
  setTargetSize: (targetSize: { value: number; unit: TargetSizeUnit }) => void;
  setApparent: (apparent: { value: number; unit: ReticleUnit }) => void;
  setDistance: (distance: { value: number; unit: DistanceUnit }) => void;
  setFocalPlane: (focalPlane: FocalPlane) => void;
  setMagnification: (magnification: { calibration: number; used: number }) => void;
}

// 1 m at 2 mil is 500 m, so the defaults agree in all three directions.
export const initialReticleRangingSettings: ReticleRangingSettings = {
  solveFor: 'distance',
  targetSize: { value: 100, unit: 'cm' },
  apparent: { value: 2, unit: 'mil' },
  distance: { value: 500, unit: 'm' },
  focalPlane: 'ffp',
  magnification: { calibration: 10, used: 10 },
};

export const useReticleRangingStore = create<ReticleRangingStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<ReticleRangingSettings>) => {
        const parsed = reticleRangingSettingsSchema.safeParse({ ...get(), ...changes });
        // Keep the last complete settings while a numeric field is being edited.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialReticleRangingSettings,
        lastValidSettings: initialReticleRangingSettings,
        setSolveFor: (solveFor) => edit({ solveFor }),
        // Changing a unit rereads the typed number in the new unit; it does not convert it.
        setTargetSize: (targetSize) => edit({ targetSize }),
        setApparent: (apparent) => edit({ apparent }),
        setDistance: (distance) => edit({ distance }),
        setFocalPlane: (focalPlane) => edit({ focalPlane }),
        setMagnification: (magnification) => edit({ magnification }),
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
        // Report saved data that could not be read; a first visit has none.
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
