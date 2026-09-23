import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import type { DistanceUnit } from '@/lib/schemas/sight-adjustment';
import {
  targetLeadSettingsSchema,
  type ProjectileSpeedUnit,
  type TargetLeadSettings,
  type TargetSpeedUnit,
} from '@/lib/schemas/target-lead';

export const storageKey = 'nilay-labs-target-lead-v1';

const savedSchema = z.object({
  settings: targetLeadSettingsSchema.nullable(),
});
type SavedState = z.infer<typeof savedSchema>;

interface TargetLeadStore extends TargetLeadSettings {
  lastValidSettings: TargetLeadSettings;
  setTargetSpeed: (targetSpeed: { value: number; unit: TargetSpeedUnit }) => void;
  setDistance: (distance: { value: number; unit: DistanceUnit }) => void;
  setCrossingAngle: (crossingAngleDegrees: number) => void;
  setProjectileSpeed: (projectileSpeed: { value: number; unit: ProjectileSpeedUnit }) => void;
  setDelay: (delaySeconds: number) => void;
}

/** Round numbers and no delay; none of them stands for a particular clay, bird or load. */
export const initialTargetLeadSettings: TargetLeadSettings = {
  targetSpeed: { value: 60, unit: 'km/h' },
  distance: { value: 30, unit: 'm' },
  crossingAngleDegrees: 90,
  projectileSpeed: { value: 350, unit: 'm/s' },
  delaySeconds: 0,
};

export const useTargetLeadStore = create<TargetLeadStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<TargetLeadSettings>) => {
        const parsed = targetLeadSettingsSchema.safeParse({ ...get(), ...changes });
        // Keep the last complete settings while a numeric field is being edited.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialTargetLeadSettings,
        lastValidSettings: initialTargetLeadSettings,
        // Changing a unit keeps the number as typed, as in the sight adjustment tool.
        setTargetSpeed: (targetSpeed) => edit({ targetSpeed }),
        setDistance: (distance) => edit({ distance }),
        setCrossingAngle: (crossingAngleDegrees) => edit({ crossingAngleDegrees }),
        setProjectileSpeed: (projectileSpeed) => edit({ projectileSpeed }),
        setDelay: (delaySeconds) => edit({ delaySeconds }),
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
        // A first visit has nothing saved; report only data that could not be read.
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
