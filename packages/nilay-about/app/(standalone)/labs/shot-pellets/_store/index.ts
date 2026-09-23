import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  shotPelletsSettingsSchema,
  type AtmosphereSetting,
  type LoadId,
  type PelletDiameterUnit,
  type PelletLoad,
  type ShotChargeUnit,
  type ShotPelletsSettings,
  type SpeedUnit,
} from '@/lib/schemas/shot-pellets';
import type { DistanceUnit } from '@/lib/schemas/sight-adjustment';
import {
  convertCharge,
  convertDiameter,
  convertSpeed,
  MATERIAL_DENSITIES,
  shotNumberDiameterInches,
  type PelletMaterial,
} from '@/lib/shot-pellets';

export const storageKey = 'nilay-labs-shot-pellets-v1';

const savedSchema = z.object({
  settings: shotPelletsSettingsSchema.nullable(),
});
type SavedState = z.infer<typeof savedSchema>;

interface ShotPelletsStore extends ShotPelletsSettings {
  lastValidSettings: ShotPelletsSettings;
  setDiameterUnit: (unit: PelletDiameterUnit) => void;
  setShotChargeUnit: (unit: ShotChargeUnit) => void;
  setSpeedUnit: (unit: SpeedUnit) => void;
  setDistanceUnit: (unit: DistanceUnit) => void;
  setStep: (step: number) => void;
  setMaxRange: (maxRange: number) => void;
  setReferenceDistance: (referenceDistance: number) => void;
  setAtmosphere: (atmosphere: AtmosphereSetting) => void;
  setLoad: (id: LoadId, changes: Partial<PelletLoad>) => void;
  applyShotNumber: (id: LoadId, shotNumber: number) => void;
  applyMaterial: (id: LoadId, material: PelletMaterial) => void;
  copyLoad: (from: LoadId) => void;
}

/**
 * Two loads of the same size in the two materials that size is sold in.
 *
 * Load A is 28 g of 2.41 mm lead at 400 m/s: an ordinary clay target load, stated in the
 * units a Japanese box is marked in. Load B is the same charge of the same size in steel,
 * which is the comparison a shooter makes when lead is not allowed where they are shooting
 * and they have to decide what to buy instead. Neither is a published load: the speeds and
 * charges of real shells are printed on their own boxes, and those are the figures to enter.
 */
export const initialShotPelletsSettings: ShotPelletsSettings = {
  diameterUnit: 'mm',
  shotChargeUnit: 'g',
  speedUnit: 'mps',
  distanceUnit: 'm',
  step: 5,
  maxRange: 50,
  referenceDistance: 35,
  atmosphere: {
    source: 'station',
    temperature: { value: 15, unit: 'c' },
    pressure: { value: 1013.25, unit: 'hpa' },
    altitude: { value: 0, unit: 'm' },
  },
  a: { diameter: 2.41, density: MATERIAL_DENSITIES.lead, shotCharge: 28, muzzleSpeed: 400 },
  b: { diameter: 2.41, density: MATERIAL_DENSITIES.iron, shotCharge: 28, muzzleSpeed: 400 },
};

export const useShotPelletsStore = create<ShotPelletsStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<ShotPelletsSettings>) => {
        const parsed = shotPelletsSettingsSchema.safeParse({ ...get(), ...changes });
        // Keep the last complete settings while a numeric field is being edited.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      // Both loads are rewritten together: a unit that meant one thing in A and another in B
      // would make the comparison meaningless, which is the whole point of the tool.
      const rewrite = (change: (load: PelletLoad) => PelletLoad, changes: Partial<ShotPelletsSettings>) => {
        const { a, b } = get();
        edit({ ...changes, a: change(a), b: change(b) });
      };
      return {
        ...initialShotPelletsSettings,
        lastValidSettings: initialShotPelletsSettings,
        setDiameterUnit: (diameterUnit) => {
          const current = get().diameterUnit;
          if (diameterUnit === current) return;
          // The number is rewritten rather than reread, so changing the unit never changes the pellet.
          rewrite((load) => ({ ...load, diameter: convertDiameter(load.diameter, current, diameterUnit) }), {
            diameterUnit,
          });
        },
        setShotChargeUnit: (shotChargeUnit) => {
          const current = get().shotChargeUnit;
          if (shotChargeUnit === current) return;
          rewrite((load) => ({ ...load, shotCharge: convertCharge(load.shotCharge, current, shotChargeUnit) }), {
            shotChargeUnit,
          });
        },
        setSpeedUnit: (speedUnit) => {
          const current = get().speedUnit;
          if (speedUnit === current) return;
          rewrite((load) => ({ ...load, muzzleSpeed: convertSpeed(load.muzzleSpeed, current, speedUnit) }), {
            speedUnit,
          });
        },
        /**
         * The distance unit is a label on the range the table is read over rather than a
         * measurement of the shell, so the numbers stay as they are: a shooter who works in
         * yards wants the same round figures, not 45.7 of them. The load's own units are
         * rewritten above, because those describe a pellet that does not change.
         */
        setDistanceUnit: (distanceUnit) => edit({ distanceUnit }),
        setStep: (step) => edit({ step }),
        setMaxRange: (maxRange) => edit({ maxRange }),
        setReferenceDistance: (referenceDistance) => edit({ referenceDistance }),
        setAtmosphere: (atmosphere) => edit({ atmosphere }),
        setLoad: (id, changes) => {
          const load = { ...get()[id], ...changes };
          edit(id === 'a' ? { a: load } : { b: load });
        },
        // A shot number writes an average diameter into the field, which the reader can then
        // overwrite with what their own shell measures. It is a shortcut, not a second input.
        applyShotNumber: (id, shotNumber) => {
          const { diameterUnit } = get();
          const inches = shotNumberDiameterInches(shotNumber);
          const diameter = convertDiameter(inches, 'inch', diameterUnit);
          const load = { ...get()[id], diameter };
          edit(id === 'a' ? { a: load } : { b: load });
        },
        applyMaterial: (id, material) => {
          const load = { ...get()[id], density: MATERIAL_DENSITIES[material] };
          edit(id === 'a' ? { a: load } : { b: load });
        },
        // Comparing one changed field against the same shell is the common case, and retyping
        // four fields to get there is where a unit or a digit goes astray.
        copyLoad: (from) => {
          const source = { ...get()[from] };
          edit(from === 'a' ? { b: source } : { a: source });
        },
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
        // A first visit stores nothing, but unreadable data is a loss the tool has to own up to.
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
