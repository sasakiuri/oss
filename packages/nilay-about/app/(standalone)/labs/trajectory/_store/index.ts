import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  initialTrajectoryCard,
  trajectorySettingsSchema,
  type AtmosphereSetting,
  type DistanceUnit,
  type DragModel,
  type DropUnit,
  type MassUnit,
  type SightHeightUnit,
  type SpeedUnit,
  type TrajectoryCardSetting,
  type TrajectorySettings,
  type WindSetting,
} from '@/lib/schemas/trajectory';

export const storageKey = 'nilay-labs-trajectory-v1';

const savedSchema = z.object({
  settings: trajectorySettingsSchema.nullable(),
});
type SavedState = z.infer<typeof savedSchema>;

interface TrajectoryStore extends TrajectorySettings {
  lastValidSettings: TrajectorySettings;
  setMuzzleSpeed: (muzzleSpeed: { value: number; unit: SpeedUnit }) => void;
  setMass: (mass: { value: number; unit: MassUnit }) => void;
  setBallisticCoefficient: (ballisticCoefficient: number) => void;
  setDragModel: (dragModel: DragModel) => void;
  setSightHeight: (sightHeight: { value: number; unit: SightHeightUnit }) => void;
  setDistanceUnit: (distanceUnit: DistanceUnit) => void;
  setZeroDistance: (zeroDistance: number) => void;
  setStep: (step: number) => void;
  setMaxRange: (maxRange: number) => void;
  setDropUnit: (dropUnit: DropUnit) => void;
  setVitalRadius: (vitalRadius: number) => void;
  setWind: (wind: WindSetting) => void;
  setAtmosphere: (atmosphere: AtmosphereSetting) => void;
  setCard: (changes: Partial<TrajectoryCardSetting>) => void;
}

/**
 * Defaults: an ordinary centrefire rifle zeroed at 100 m in the reference atmosphere, with a light
 * crosswind and a target circle the size of a small animal's chest. Meant to be replaced.
 */
export const initialTrajectorySettings: TrajectorySettings = {
  muzzleSpeed: { value: 800, unit: 'mps' },
  mass: { value: 10.9, unit: 'g' },
  ballisticCoefficient: 0.45,
  dragModel: 'g1',
  sightHeight: { value: 40, unit: 'mm' },
  distanceUnit: 'm',
  zeroDistance: 100,
  step: 50,
  maxRange: 500,
  dropUnit: 'cm',
  vitalRadius: 5,
  wind: { speed: 4, unit: 'mps', preset: '9', customFromDegrees: 270 },
  atmosphere: {
    source: 'station',
    temperature: { value: 15, unit: 'c' },
    pressure: { value: 1013.25, unit: 'hpa' },
    altitude: { value: 0, unit: 'm' },
  },
  card: initialTrajectoryCard,
};

export const useTrajectoryStore = create<TrajectoryStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<TrajectorySettings>) => {
        const parsed = trajectorySettingsSchema.safeParse({ ...get(), ...changes });
        // Keep the last complete settings while a numeric field is being edited.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialTrajectorySettings,
        lastValidSettings: initialTrajectorySettings,
        setMuzzleSpeed: (muzzleSpeed) => edit({ muzzleSpeed }),
        setMass: (mass) => edit({ mass }),
        setBallisticCoefficient: (ballisticCoefficient) => edit({ ballisticCoefficient }),
        setDragModel: (dragModel) => edit({ dragModel }),
        setSightHeight: (sightHeight) => edit({ sightHeight }),
        // Distances keep the typed number and are reread in the new unit.
        setDistanceUnit: (distanceUnit) => edit({ distanceUnit }),
        setZeroDistance: (zeroDistance) => edit({ zeroDistance }),
        setStep: (step) => edit({ step }),
        setMaxRange: (maxRange) => edit({ maxRange }),
        setDropUnit: (dropUnit) => edit({ dropUnit }),
        setVitalRadius: (vitalRadius) => edit({ vitalRadius }),
        setWind: (wind) => edit({ wind }),
        setAtmosphere: (atmosphere) => edit({ atmosphere }),
        setCard: (changes) => edit({ card: { ...get().card, ...changes } }),
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
