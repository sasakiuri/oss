import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import type { DistanceUnit } from '@/lib/schemas/sight-adjustment';
import {
  targetLeadSettingsSchema,
  type SpeedModel,
  type ProjectileSpeedUnit,
  type TargetLeadSettings,
  type TargetSpeedUnit,
} from '@/lib/schemas/target-lead';
import { MATERIAL_DENSITIES } from '@/lib/shot-pellets';

export const storageKey = 'nilay-labs-target-lead-v1';

/**
 * The elevation, the climb, the speed model and the pellet were added after the first saves, so they are
 * optional here and a save made before them reads as it is. Such a save entered its speed as an
 * average with the target level and flat, which is what the merge takes it as.
 */
const savedSchema = z.object({
  settings: targetLeadSettingsSchema
    .partial({ elevationDegrees: true, climbDegrees: true, speedModel: true, pellet: true })
    .nullable(),
});
type SavedState = z.infer<typeof savedSchema>;

interface TargetLeadStore extends TargetLeadSettings {
  lastValidSettings: TargetLeadSettings;
  setTargetSpeed: (targetSpeed: { value: number; unit: TargetSpeedUnit }) => void;
  setDistance: (distance: { value: number; unit: DistanceUnit }) => void;
  setCrossingAngle: (crossingAngleDegrees: number) => void;
  setProjectileSpeed: (projectileSpeed: { value: number; unit: ProjectileSpeedUnit }) => void;
  setDelay: (delaySeconds: number) => void;
  setElevation: (elevationDegrees: number) => void;
  setClimb: (climbDegrees: number) => void;
  setSpeedModel: (speedModel: SpeedModel) => void;
  setPellet: (pellet: TargetLeadSettings['pellet']) => void;
}

/**
 * Round numbers and no delay; none of them stands for a particular clay, bird or load. The pellet is
 * No. 7.5 lead by the SAAMI rule (0.095 in) at 400 m/s, the same starting load as the pellet tool.
 */
export const initialTargetLeadSettings: TargetLeadSettings = {
  targetSpeed: { value: 60, unit: 'km/h' },
  distance: { value: 30, unit: 'm' },
  crossingAngleDegrees: 90,
  projectileSpeed: { value: 400, unit: 'm/s' },
  delaySeconds: 0,
  elevationDegrees: 0,
  climbDegrees: 0,
  speedModel: 'drag',
  pellet: { diameterMm: 2.41, densityGcm3: MATERIAL_DENSITIES.lead },
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
        setElevation: (elevationDegrees) => edit({ elevationDegrees }),
        setClimb: (climbDegrees) => edit({ climbDegrees }),
        setSpeedModel: (speedModel) => edit({ speedModel }),
        setPellet: (pellet) => edit({ pellet }),
      };
    },
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ settings: state.lastValidSettings }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) {
          const saved = parsed.data.settings;
          if (!saved) return current;
          // A save without the speed model was entered as an average speed; without an elevation or
          // climb, the target was level and flat. The pellet is only used by the drag model.
          const settings: TargetLeadSettings = {
            ...saved,
            elevationDegrees: saved.elevationDegrees ?? 0,
            climbDegrees: saved.climbDegrees ?? 0,
            speedModel: saved.speedModel ?? 'average',
            pellet: saved.pellet ?? current.pellet,
          };
          return { ...current, ...settings, lastValidSettings: settings };
        }
        // A first visit has nothing saved; report only data that could not be read.
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
