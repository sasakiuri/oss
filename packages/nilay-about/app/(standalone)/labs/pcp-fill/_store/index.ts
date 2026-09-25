import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { fromBar, toBar, type PressureUnit } from '@/lib/pcp-fill';

export const storageKey = 'nilay-labs-pcp-fill-v1';

const finite = z.number().finite();

export const pcpFillSettingsSchema = z.object({
  pressureUnit: z.enum(['bar', 'mpa', 'psi']),
  tankLitres: finite.positive(),
  tankPressure: finite.nonnegative(),
  fillPressure: finite.nonnegative(),
  refillPressure: finite.nonnegative(),
  gunCc: finite.positive(),
  hoseCc: finite.nonnegative(),
  /** Shots the reader gets from one fill, for the total; null when not given. */
  shotsPerFill: finite.positive().nullable(),
});
export type PcpFillSettings = z.infer<typeof pcpFillSettingsSchema>;

/** A 12 L cylinder at 300 bar and a gun filled from 100 to 200 bar: round figures to show the result, not a recommendation. */
export const initialPcpFillSettings: PcpFillSettings = {
  pressureUnit: 'bar',
  tankLitres: 12,
  tankPressure: 300,
  fillPressure: 200,
  refillPressure: 100,
  gunCc: 200,
  hoseCc: 0,
  shotsPerFill: null,
};

const savedSchema = z.object({ settings: pcpFillSettingsSchema });
type SavedState = z.infer<typeof savedSchema>;

interface PcpFillStore extends PcpFillSettings {
  lastValidSettings: PcpFillSettings;
  edit: (changes: Partial<PcpFillSettings>) => void;
  /** Pressures are measured quantities, so a new unit converts them rather than rereading the numbers. */
  setPressureUnit: (unit: PressureUnit) => void;
  reset: () => void;
}

const readable = (value: number) => Math.round(value * 1000) / 1000;

export const usePcpFillStore = create<PcpFillStore>()(
  persist(
    (set, get) => ({
      ...initialPcpFillSettings,
      lastValidSettings: initialPcpFillSettings,
      edit: (changes) => {
        const parsed = pcpFillSettingsSchema.safeParse({ ...get(), ...changes });
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      },
      setPressureUnit: (unit) => {
        const state = get();
        const convert = (value: number) => readable(fromBar(toBar(value, state.pressureUnit), unit));
        get().edit({
          pressureUnit: unit,
          tankPressure: convert(state.tankPressure),
          fillPressure: convert(state.fillPressure),
          refillPressure: convert(state.refillPressure),
        });
      },
      reset: () => set({ ...initialPcpFillSettings, lastValidSettings: initialPcpFillSettings }),
    }),
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ settings: state.lastValidSettings }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) return { ...current, ...parsed.data.settings, lastValidSettings: parsed.data.settings };
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
