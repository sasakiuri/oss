import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  TRUING_MEASUREMENT_LIMIT,
  truingSettingsSchema,
  type AtmosphereSetting,
  type DistanceUnit,
  type DragModel,
  type DropUnit,
  type SightHeightUnit,
  type SpeedUnit,
  type TruingMeasurementSetting,
  type TruingSettings,
} from '@/lib/schemas/trajectory-truing';
import { MM_PER_INCH } from '@/lib/sight-adjustment';
import { fromMetersPerSecond, toMetersPerSecond } from '@/lib/trajectory';
import type { DropReading, TruingTarget } from '@/lib/trajectory-truing';

export const storageKey = 'nilay-labs-trajectory-truing-v1';

const savedSchema = z.object({
  settings: truingSettingsSchema.nullable(),
});
type SavedState = z.infer<typeof savedSchema>;

interface TruingStore extends TruingSettings {
  lastValidSettings: TruingSettings;
  setMuzzleSpeed: (value: number) => void;
  setSpeedUnit: (unit: SpeedUnit) => void;
  setBallisticCoefficient: (value: number) => void;
  setDragModel: (dragModel: DragModel) => void;
  setSightHeight: (value: number) => void;
  setSightHeightUnit: (unit: SightHeightUnit) => void;
  setDistanceUnit: (unit: DistanceUnit) => void;
  setZeroDistance: (value: number) => void;
  setDropUnit: (unit: DropUnit) => void;
  setReading: (reading: DropReading) => void;
  setTarget: (target: TruingTarget) => void;
  setTolerance: (value: number) => void;
  setAtmosphere: (atmosphere: AtmosphereSetting) => void;
  addMeasurement: () => void;
  updateMeasurement: (id: string, changes: Partial<Omit<TruingMeasurementSetting, 'id'>>) => void;
  removeMeasurement: (id: string) => void;
  /** Writes the solved value into the load, in the form's unit and rounded as shown on screen. */
  applyFitted: (target: TruingTarget, value: number) => void;
}

/**
 * Defaults: an ordinary centrefire load (not a published one) zeroed at 100 m, with two groups
 * further out. The drops are what this model gives for a coefficient of 0.30, rounded to 0.5 cm,
 * so the first visit shows a solve.
 *
 * The tolerance is 1 cm, about the precision of a five-shot group centre at a few hundred metres.
 */
export const initialTruingSettings: TruingSettings = {
  muzzleSpeed: { value: 800, unit: 'mps' },
  ballisticCoefficient: 0.45,
  dragModel: 'g1',
  sightHeight: { value: 45, unit: 'mm' },
  distanceUnit: 'm',
  zeroDistance: 100,
  dropUnit: 'cm',
  reading: 'offset',
  measurements: [
    { id: 'example-300', distance: 300, drop: 57.5 },
    { id: 'example-400', distance: 400, drop: 134.5 },
  ],
  tolerance: 1,
  target: 'ballistic-coefficient',
  atmosphere: {
    source: 'station',
    temperature: { value: 15, unit: 'c' },
    pressure: { value: 1013.25, unit: 'hpa' },
    altitude: { value: 0, unit: 'm' },
  },
};

export const useTruingStore = create<TruingStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<TruingSettings>) => {
        const parsed = truingSettingsSchema.safeParse({ ...get(), ...changes });
        // Keep the last complete settings while a numeric field is being edited.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialTruingSettings,
        lastValidSettings: initialTruingSettings,
        setMuzzleSpeed: (value) => edit({ muzzleSpeed: { ...get().muzzleSpeed, value } }),
        // Velocity and sight height units convert the number. Distance and drop units reread
        // the numbers as typed.
        setSpeedUnit: (unit) => {
          const { muzzleSpeed } = get();
          if (unit === muzzleSpeed.unit) return;
          edit({
            muzzleSpeed: {
              value: fromMetersPerSecond(toMetersPerSecond(muzzleSpeed.value, muzzleSpeed.unit), unit),
              unit,
            },
          });
        },
        setBallisticCoefficient: (ballisticCoefficient) => edit({ ballisticCoefficient }),
        setDragModel: (dragModel) => edit({ dragModel }),
        setSightHeight: (value) => edit({ sightHeight: { ...get().sightHeight, value } }),
        setSightHeightUnit: (unit) => {
          const { sightHeight } = get();
          if (unit === sightHeight.unit) return;
          const millimetres = sightHeight.unit === 'mm' ? sightHeight.value : sightHeight.value * MM_PER_INCH;
          edit({ sightHeight: { value: unit === 'mm' ? millimetres : millimetres / MM_PER_INCH, unit } });
        },
        setDistanceUnit: (distanceUnit) => edit({ distanceUnit }),
        setZeroDistance: (zeroDistance) => edit({ zeroDistance }),
        setDropUnit: (dropUnit) => edit({ dropUnit }),
        setReading: (reading) => edit({ reading }),
        setTarget: (target) => edit({ target }),
        setTolerance: (tolerance) => edit({ tolerance }),
        setAtmosphere: (atmosphere) => edit({ atmosphere }),
        addMeasurement: () => {
          const { measurements } = get();
          if (measurements.length >= TRUING_MEASUREMENT_LIMIT) return;
          edit({ measurements: [...measurements, { id: crypto.randomUUID(), distance: NaN, drop: NaN }] });
        },
        updateMeasurement: (id, changes) =>
          edit({
            measurements: get().measurements.map((row) => (row.id === id ? { ...row, ...changes } : row)),
          }),
        removeMeasurement: (id) => edit({ measurements: get().measurements.filter((row) => row.id !== id) }),
        applyFitted: (target, value) =>
          target === 'ballistic-coefficient'
            ? edit({ ballisticCoefficient: value })
            : edit({ muzzleSpeed: { ...get().muzzleSpeed, value } }),
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
