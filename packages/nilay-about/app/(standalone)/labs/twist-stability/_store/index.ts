import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { createNamedSettingsStore } from '@/lib/named-settings-store';
import {
  twistStabilitySettingsSchema,
  type BulletLengthUnit,
  type MassUnit,
  type SpeedUnit,
  type TwistStabilitySettings,
} from '@/lib/schemas/twist-stability';
import { convertBulletLength, convertMass, convertSpeed } from '@/lib/twist-stability';

export const storageKey = 'nilay-labs-twist-stability-v1';
export const profilesStorageKey = 'nilay-labs-twist-stability-profiles-v1';

/** Bullets and barrels kept by name, apart from the form so that saving one never changes what the form saves. */
export const useTwistStabilityProfiles = createNamedSettingsStore(profilesStorageKey, twistStabilitySettingsSchema);

const savedSchema = z.object({
  settings: twistStabilitySettingsSchema.nullable(),
});
type SavedState = z.infer<typeof savedSchema>;

interface TwistStabilityStore extends TwistStabilitySettings {
  lastValidSettings: TwistStabilitySettings;
  setBulletUnit: (unit: BulletLengthUnit) => void;
  setTwistUnit: (unit: BulletLengthUnit) => void;
  setMassUnit: (unit: MassUnit) => void;
  setSpeedUnit: (unit: SpeedUnit) => void;
  setSettings: (changes: Partial<TwistStabilitySettings>) => void;
}

/**
 * Case 1 in Don Miller, "A New Rule for Estimating Rifling Twist", Precision Shooting, March
 * 2005: a 168 gr Sierra International, 0.308 in, 3.98 calibers, measured at s = 1.80 from a
 * 12 in twist at 2800 ft/s. The rule gives about 1.67, a few per cent under the measurement.
 *
 * Rounded into metric. The twist stays in inches, as barrels are quoted. The atmosphere is the
 * same ISO reference as the trajectory tool, not Army Standard Metro.
 */
export const initialTwistStabilitySettings: TwistStabilitySettings = {
  bulletUnit: 'mm',
  twistUnit: 'inch',
  massUnit: 'g',
  speedUnit: 'mps',
  diameter: 7.82,
  length: 31.14,
  mass: 10.89,
  twist: 12,
  muzzleSpeed: 853.4,
  targetStability: 1.5,
  atmosphere: {
    source: 'station',
    temperature: { value: 15, unit: 'c' },
    pressure: { value: 1013.25, unit: 'hpa' },
    altitude: { value: 0, unit: 'm' },
  },
};

export const useTwistStabilityStore = create<TwistStabilityStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<TwistStabilitySettings>) => {
        const parsed = twistStabilitySettingsSchema.safeParse({ ...get(), ...changes });
        // Keep the last complete settings while a numeric field is being edited.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialTwistStabilitySettings,
        lastValidSettings: initialTwistStabilitySettings,
        // Converts the numbers, so changing a unit never changes the bullet. The diameter and
        // the length share one unit.
        setBulletUnit: (bulletUnit) => {
          const current = get().bulletUnit;
          if (bulletUnit === current) return;
          const convert = (value: number) => convertBulletLength(value, current, bulletUnit);
          edit({ bulletUnit, diameter: convert(get().diameter), length: convert(get().length) });
        },
        setTwistUnit: (twistUnit) => {
          const current = get().twistUnit;
          if (twistUnit === current) return;
          edit({ twistUnit, twist: convertBulletLength(get().twist, current, twistUnit) });
        },
        setMassUnit: (massUnit) => {
          const current = get().massUnit;
          if (massUnit === current) return;
          edit({ massUnit, mass: convertMass(get().mass, current, massUnit) });
        },
        setSpeedUnit: (speedUnit) => {
          const current = get().speedUnit;
          if (speedUnit === current) return;
          edit({ speedUnit, muzzleSpeed: convertSpeed(get().muzzleSpeed, current, speedUnit) });
        },
        setSettings: (changes) => edit(changes),
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
