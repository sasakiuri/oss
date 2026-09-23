import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  sightAdjustmentSettingsSchema,
  type ClickSetting,
  type DistanceUnit,
  type HorizontalImpact,
  type OffsetUnit,
  type SightAdjustmentSettings,
  type VerticalImpact,
} from '@/lib/schemas/sight-adjustment';
import { fromMeters, toMeters } from '@/lib/sight-adjustment';

export const storageKey = 'nilay-labs-sight-adjustment-v1';

const savedSchema = z.object({
  settings: sightAdjustmentSettingsSchema.nullable(),
});
type SavedState = z.infer<typeof savedSchema>;

interface SightAdjustmentStore extends SightAdjustmentSettings {
  lastValidSettings: SightAdjustmentSettings;
  setDistance: (distance: { value: number; unit: DistanceUnit }) => void;
  setOffsetUnit: (offsetUnit: OffsetUnit) => void;
  setVertical: (vertical: { direction: VerticalImpact; value: number }) => void;
  setHorizontal: (horizontal: { direction: HorizontalImpact; value: number }) => void;
  setClick: (click: ClickSetting) => void;
  setSlant: (slant: { value: number; angleDegrees: number }) => void;
}

export const initialSightAdjustmentSettings: SightAdjustmentSettings = {
  distance: { value: 100, unit: 'm' },
  offsetUnit: 'cm',
  vertical: { direction: 'low', value: 5 },
  horizontal: { direction: 'right', value: 3 },
  click: { preset: '1/4-moa', customMmPer100m: 10 },
  slant: { value: 100, angleDegrees: 30 },
};

export const useSightAdjustmentStore = create<SightAdjustmentStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<SightAdjustmentSettings>) => {
        const parsed = sightAdjustmentSettingsSchema.safeParse({ ...get(), ...changes });
        // Keep the last complete settings while a numeric field is being edited.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialSightAdjustmentSettings,
        lastValidSettings: initialSightAdjustmentSettings,
        setDistance: (distance) => {
          const { distance: current, slant } = get();
          edit(
            distance.unit === current.unit
              ? { distance }
              : // The incline distance shares this unit and is converted. Rounding can shift it by up to half a
                // step (about 5 mm) after switching back and forth.
                {
                  distance,
                  slant: {
                    ...slant,
                    value: Math.round(fromMeters(toMeters(slant.value, current.unit), distance.unit) * 100) / 100,
                  },
                },
          );
        },
        setOffsetUnit: (offsetUnit) => edit({ offsetUnit }),
        setVertical: (vertical) => edit({ vertical }),
        setHorizontal: (horizontal) => edit({ horizontal }),
        setClick: (click) => edit({ click }),
        setSlant: (slant) => edit({ slant }),
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
