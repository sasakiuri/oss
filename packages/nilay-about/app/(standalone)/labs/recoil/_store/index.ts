import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { convertChargeMass, convertGunMass, convertVelocity } from '@/lib/recoil';
import {
  recoilSettingsSchema,
  type ChargeMassUnit,
  type GunMassUnit,
  type LoadId,
  type RecoilLoad,
  type RecoilSettings,
  type VelocityUnit,
} from '@/lib/schemas/recoil';

export const storageKey = 'nilay-labs-recoil-v1';

const savedSchema = z.object({
  settings: recoilSettingsSchema.nullable(),
});
type SavedState = z.infer<typeof savedSchema>;

interface RecoilStore extends RecoilSettings {
  lastValidSettings: RecoilSettings;
  setGunMassUnit: (unit: GunMassUnit) => void;
  setChargeMassUnit: (unit: ChargeMassUnit) => void;
  setVelocityUnit: (unit: VelocityUnit) => void;
  setLoad: (id: LoadId, changes: Partial<RecoilLoad>) => void;
  copyLoad: (from: LoadId) => void;
}

/**
 * Condition A is the worked example from SAAMI, "Gun Recoil - Technical: Free Recoil Energy",
 * Rev. 7/9/2018: a 7 lb average length shotgun firing 1¼ oz of shot with 43 gr of wads and
 * 33.4 gr of powder at 1275 fps. Every one of its numbers is published there, which is what
 * makes it worth opening on.
 *
 * Condition B is an ordinary .308 Win load - 150 gr at 2800 fps from a 7.5 lb rifle with a
 * 39 gr charge - so that the first screen sets a rifle against a shotgun, which is the
 * comparison the tool is for. Its charge weight is a typical one rather than a published
 * figure, so unlike condition A it is not a reference for anything.
 *
 * Both are rounded into metric here, so the opening figures sit a little off the imperial ones.
 */
export const initialRecoilSettings: RecoilSettings = {
  gunMassUnit: 'kg',
  chargeMassUnit: 'g',
  velocityUnit: 'm/s',
  a: {
    gunMass: 3.175,
    projectileMass: 35.44,
    wadMass: 2.79,
    powderMass: 2.16,
    velocity: 388.6,
    firearmType: 'shotgun-average',
  },
  b: {
    gunMass: 3.402,
    projectileMass: 9.72,
    wadMass: 0,
    powderMass: 2.53,
    velocity: 853.4,
    firearmType: 'rifle',
  },
};

export const useRecoilStore = create<RecoilStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<RecoilSettings>) => {
        const parsed = recoilSettingsSchema.safeParse({ ...get(), ...changes });
        // Keep the last complete settings while a numeric field is being edited.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      // Both conditions share one unit, so A and B stay comparable.
      const rewrite = (change: (load: RecoilLoad) => RecoilLoad, changes: Partial<RecoilSettings>) => {
        const { a, b } = get();
        edit({ ...changes, a: change(a), b: change(b) });
      };
      return {
        ...initialRecoilSettings,
        lastValidSettings: initialRecoilSettings,
        setGunMassUnit: (gunMassUnit) => {
          const current = get().gunMassUnit;
          if (gunMassUnit === current) return;
          // Converted, not reread: changing the unit keeps the same gun.
          rewrite((load) => ({ ...load, gunMass: convertGunMass(load.gunMass, current, gunMassUnit) }), {
            gunMassUnit,
          });
        },
        setChargeMassUnit: (chargeMassUnit) => {
          const current = get().chargeMassUnit;
          if (chargeMassUnit === current) return;
          const convert = (value: number) => convertChargeMass(value, current, chargeMassUnit);
          rewrite(
            (load) => ({
              ...load,
              projectileMass: convert(load.projectileMass),
              wadMass: convert(load.wadMass),
              powderMass: convert(load.powderMass),
            }),
            { chargeMassUnit },
          );
        },
        setVelocityUnit: (velocityUnit) => {
          const current = get().velocityUnit;
          if (velocityUnit === current) return;
          rewrite((load) => ({ ...load, velocity: convertVelocity(load.velocity, current, velocityUnit) }), {
            velocityUnit,
          });
        },
        setLoad: (id, changes) => {
          const load = { ...get()[id], ...changes };
          edit(id === 'a' ? { a: load } : { b: load });
        },
        // Copies one condition to the other, to compare a single changed field.
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
        // Report saved data that could not be read; a first visit has none.
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
