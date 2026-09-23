import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { DEFAULT_CLICK, clickUnit, convertDistance, convertLength, type AngleUnit } from '@/lib/click-verification';
import {
  clickVerificationSettingsSchema,
  type ClickVerificationSettings,
  type DistanceUnit,
  type LateralSide,
  type NominalClick,
  type OffsetUnit,
} from '@/lib/schemas/click-verification';

export const storageKey = 'nilay-labs-click-verification-v1';

const savedSchema = z.object({
  settings: clickVerificationSettingsSchema.nullable(),
});
type SavedState = z.infer<typeof savedSchema>;

interface ClickVerificationStore extends ClickVerificationSettings {
  lastValidSettings: ClickVerificationSettings;
  setDistance: (distance: { value: number; unit: DistanceUnit }) => void;
  setClick: (click: NominalClick) => void;
  /** Switching the unit picks that unit's usual click, since a click value belongs to one unit. */
  setDialUnit: (unit: AngleUnit) => void;
  setDial: (dial: number) => void;
  setMeasureUnit: (unit: OffsetUnit) => void;
  setMeasured: (measured: number) => void;
  setLateral: (lateral: { value: number; side: LateralSide }) => void;
}

// 30 MOA, the least elevation the tall target worksheet asks for, dialled at 100 m.
export const initialClickVerificationSettings: ClickVerificationSettings = {
  distance: { value: 100, unit: 'm' },
  click: '1/4-moa',
  dial: 30,
  measureUnit: 'mm',
  measured: 860,
  lateral: { value: 0, side: 'right' },
};

export const useClickVerificationStore = create<ClickVerificationStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<ClickVerificationSettings>) => {
        const parsed = clickVerificationSettingsSchema.safeParse({ ...get(), ...changes });
        // Keep the last complete settings while a numeric field is being edited.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialClickVerificationSettings,
        lastValidSettings: initialClickVerificationSettings,
        // Switching a unit converts the number: 860 mm becomes 86 cm, not 860 cm.
        setDistance: (distance) => {
          const current = get().distance;
          edit({
            distance:
              distance.unit === current.unit
                ? distance
                : { unit: distance.unit, value: convertDistance(current.value, current.unit, distance.unit) },
          });
        },
        setClick: (click) => edit({ click }),
        setDialUnit: (unit) => {
          if (clickUnit(get().click) !== unit) edit({ click: DEFAULT_CLICK[unit] });
        },
        setDial: (dial) => edit({ dial }),
        setMeasureUnit: (measureUnit) => {
          const { measureUnit: from, measured, lateral } = get();
          if (measureUnit === from) return;
          edit({
            measureUnit,
            measured: convertLength(measured, from, measureUnit),
            lateral: { ...lateral, value: convertLength(lateral.value, from, measureUnit) },
          });
        },
        setMeasured: (measured) => edit({ measured }),
        setLateral: (lateral) => edit({ lateral }),
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
