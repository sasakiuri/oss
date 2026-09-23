import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { convertDiameter, convertHeight, convertMass, convertSpeed } from '@/lib/max-range';
import {
  maxRangeSettingsSchema,
  type AtmosphereSetting,
  type BulletSetting,
  type DiameterUnit,
  type DistanceUnit,
  type HeightUnit,
  type MassUnit,
  type MaxRangeSettings,
  type ProjectileKind,
  type SpeedUnit,
  type SphereSetting,
} from '@/lib/schemas/max-range';

export const storageKey = 'nilay-labs-max-range-v1';

const savedSchema = z.object({
  settings: maxRangeSettingsSchema.nullable(),
});
type SavedState = z.infer<typeof savedSchema>;

interface MaxRangeStore extends MaxRangeSettings {
  lastValidSettings: MaxRangeSettings;
  setKind: (kind: ProjectileKind) => void;
  setBullet: (changes: Partial<BulletSetting>) => void;
  setSphere: (changes: Partial<SphereSetting>) => void;
  setMassUnit: (unit: MassUnit) => void;
  setDiameterUnit: (unit: DiameterUnit) => void;
  setMuzzleSpeed: (value: number) => void;
  setSpeedUnit: (unit: SpeedUnit) => void;
  setLaunchHeight: (value: number) => void;
  setHeightUnit: (unit: HeightUnit) => void;
  setElevation: (elevationDegrees: number) => void;
  setDistanceUnit: (distanceUnit: DistanceUnit) => void;
  setAtmosphere: (atmosphere: AtmosphereSetting) => void;
}

/**
 * Defaults: a bird-shot lead pellet at an ordinary shotgun velocity, from a standing shooter at
 * thirty degrees; small shot still carries a couple of hundred metres. The density is pure lead
 * (hardened shot is slightly lighter, so the field is typed in).
 *
 * The bullet is an ordinary centrefire load, not a published one.
 *
 * The atmosphere is ISO 2533, entered as a station pressure so no altitude is needed.
 */
export const initialMaxRangeSettings: MaxRangeSettings = {
  kind: 'sphere',
  bullet: {
    ballisticCoefficient: 0.2,
    dragModel: 'g7',
    mass: { value: 9.7, unit: 'g' },
  },
  sphere: {
    diameter: { value: 2.4, unit: 'mm' },
    densityKgPerM3: 11340,
  },
  muzzleSpeed: { value: 380, unit: 'mps' },
  launchHeight: { value: 1.5, unit: 'm' },
  elevationDegrees: 30,
  distanceUnit: 'm',
  atmosphere: {
    source: 'station',
    temperature: { value: 15, unit: 'c' },
    pressure: { value: 1013.25, unit: 'hpa' },
    altitude: { value: 0, unit: 'm' },
  },
};

export const useMaxRangeStore = create<MaxRangeStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<MaxRangeSettings>) => {
        const parsed = maxRangeSettingsSchema.safeParse({ ...get(), ...changes });
        // Keep the last complete settings while a numeric field is being edited.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialMaxRangeSettings,
        lastValidSettings: initialMaxRangeSettings,
        setKind: (kind) => edit({ kind }),
        setBullet: (changes) => edit({ bullet: { ...get().bullet, ...changes } }),
        setSphere: (changes) => edit({ sphere: { ...get().sphere, ...changes } }),
        // Weight, size and speed units convert the number. The answer's distance unit leaves the
        // inputs alone.
        setMassUnit: (unit) => {
          const { mass } = get().bullet;
          if (unit === mass.unit) return;
          edit({ bullet: { ...get().bullet, mass: { value: convertMass(mass.value, mass.unit, unit), unit } } });
        },
        setDiameterUnit: (unit) => {
          const { diameter } = get().sphere;
          if (unit === diameter.unit) return;
          edit({
            sphere: {
              ...get().sphere,
              diameter: { value: convertDiameter(diameter.value, diameter.unit, unit), unit },
            },
          });
        },
        setMuzzleSpeed: (value) => edit({ muzzleSpeed: { ...get().muzzleSpeed, value } }),
        setSpeedUnit: (unit) => {
          const { muzzleSpeed } = get();
          if (unit === muzzleSpeed.unit) return;
          edit({ muzzleSpeed: { value: convertSpeed(muzzleSpeed.value, muzzleSpeed.unit, unit), unit } });
        },
        setLaunchHeight: (value) => edit({ launchHeight: { ...get().launchHeight, value } }),
        setHeightUnit: (unit) => {
          const { launchHeight } = get();
          if (unit === launchHeight.unit) return;
          edit({ launchHeight: { value: convertHeight(launchHeight.value, launchHeight.unit, unit), unit } });
        },
        setElevation: (elevationDegrees) => edit({ elevationDegrees }),
        setDistanceUnit: (distanceUnit) => edit({ distanceUnit }),
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
        // A first visit stores nothing; only unreadable data is reported.
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
