import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  velocitySpreadSettingsSchema,
  type AtmosphereSetting,
  type DistanceUnit,
  type DragModel,
  type DropUnit,
  type SightHeightUnit,
  type SpeedUnit,
  type VelocitySpreadSettings,
} from '@/lib/schemas/velocity-spread';
import { MM_PER_INCH } from '@/lib/sight-adjustment';

export const storageKey = 'nilay-labs-velocity-spread-v1';

const savedSchema = z.object({
  settings: velocitySpreadSettingsSchema.nullable(),
});
type SavedState = z.infer<typeof savedSchema>;

interface VelocitySpreadStore extends VelocitySpreadSettings {
  lastValidSettings: VelocitySpreadSettings;
  setReadings: (readings: string) => void;
  setSpeedUnit: (unit: SpeedUnit) => void;
  setBallisticCoefficient: (value: number) => void;
  setDragModel: (dragModel: DragModel) => void;
  setSightHeight: (value: number) => void;
  setSightHeightUnit: (unit: SightHeightUnit) => void;
  setDistanceUnit: (unit: DistanceUnit) => void;
  setZeroDistance: (value: number) => void;
  setStep: (value: number) => void;
  setMaxRange: (value: number) => void;
  setDropUnit: (unit: DropUnit) => void;
  setSdPrecisionPercent: (value: number) => void;
  setAtmosphere: (atmosphere: AtmosphereSetting) => void;
}

/**
 * What the tool opens on: ten readings of an ordinary centrefire load, and the rifle they came
 * from zeroed at 100 m.
 *
 * The string is not a published one. It is there so the first visit shows what a summary looks
 * like - an average, a deviation known only to a factor of two, an extreme spread on the low
 * side of what that deviation really produces - rather than an empty box.
 *
 * The velocities are not asked for separately from the load: the average of these readings is
 * the muzzle velocity the drop is worked out from, which is the whole point of having measured them.
 */
export const initialVelocitySpreadSettings: VelocitySpreadSettings = {
  readings: '800\n805\n795\n802\n798\n807\n793\n801\n799\n804',
  speedUnit: 'mps',
  ballisticCoefficient: 0.45,
  dragModel: 'g1',
  sightHeight: { value: 45, unit: 'mm' },
  distanceUnit: 'm',
  zeroDistance: 100,
  step: 100,
  maxRange: 600,
  dropUnit: 'cm',
  sdPrecisionPercent: 20,
  atmosphere: {
    source: 'station',
    temperature: { value: 15, unit: 'c' },
    pressure: { value: 1013.25, unit: 'hpa' },
    altitude: { value: 0, unit: 'm' },
  },
};

export const useVelocitySpreadStore = create<VelocitySpreadStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<VelocitySpreadSettings>) => {
        const parsed = velocitySpreadSettingsSchema.safeParse({ ...get(), ...changes });
        // Keep the last complete settings while a numeric field is being edited.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialVelocitySpreadSettings,
        lastValidSettings: initialVelocitySpreadSettings,
        setReadings: (readings) => edit({ readings }),
        /**
         * The unit the readings were measured in.
         *
         * Unlike a velocity typed into a form, a string of readings is not rewritten when the
         * unit changes: the numbers came off a device that was set to one of them, and turning
         * ten readings into their converted selves would claim measurements nobody took.
         */
        setSpeedUnit: (speedUnit) => edit({ speedUnit }),
        setBallisticCoefficient: (ballisticCoefficient) => edit({ ballisticCoefficient }),
        setDragModel: (dragModel) => edit({ dragModel }),
        setSightHeight: (value) => edit({ sightHeight: { ...get().sightHeight, value } }),
        // A scope height is a property of the rifle, so changing the unit rewrites the number.
        setSightHeightUnit: (unit) => {
          const { sightHeight } = get();
          if (unit === sightHeight.unit) return;
          const millimetres = sightHeight.unit === 'mm' ? sightHeight.value : sightHeight.value * MM_PER_INCH;
          edit({ sightHeight: { value: unit === 'mm' ? millimetres : millimetres / MM_PER_INCH, unit } });
        },
        setDistanceUnit: (distanceUnit) => edit({ distanceUnit }),
        setZeroDistance: (zeroDistance) => edit({ zeroDistance }),
        setStep: (step) => edit({ step }),
        setMaxRange: (maxRange) => edit({ maxRange }),
        setDropUnit: (dropUnit) => edit({ dropUnit }),
        setSdPrecisionPercent: (sdPrecisionPercent) => edit({ sdPrecisionPercent }),
        setAtmosphere: (atmosphere) => edit({ atmosphere }),
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
