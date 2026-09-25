import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';

/**
 * The energiser, solar and cost inputs, kept under their own key so the fence layout saved before
 * them is read as it was. An empty field is null: none of these has a value that suits every fence.
 */
export const powerStorageKey = 'nilay-labs-electric-fence-power-v1';

export const PRICE_IDS = [
  'wire',
  'cord',
  'post',
  'insulator',
  'grip',
  'connector',
  'energizer',
  'panel',
  'battery',
  'sign',
  'earthRod',
  'tester',
  'breaker',
] as const;
export type PriceId = (typeof PRICE_IDS)[number];

const optionalNumber = z.number().finite().nullable();

export const powerSettingsSchema = z.object({
  energizerW: optionalNumber,
  hoursPerDay: optionalNumber,
  batteryV: optionalNumber,
  peakSunHours: optionalNumber,
  daysWithoutSun: optionalNumber,
  usablePercent: optionalNumber,
  signSpacingM: optionalNumber,
  earthRods: optionalNumber,
  testers: optionalNumber,
  mains: z.boolean(),
  solar: z.boolean(),
  prices: z.record(z.enum(PRICE_IDS), optionalNumber),
  subsidyPercent: optionalNumber,
});
export type PowerSettings = z.infer<typeof powerSettingsSchema>;
export type PowerNumberKey = Exclude<keyof PowerSettings, 'mains' | 'solar' | 'prices'>;

// 24 hours and 12 V are what the fence and battery normally run at; half the battery is Kencove's
// limit on how deep to discharge it. The rest depend on the equipment and the site.
export const initialPowerSettings: PowerSettings = {
  energizerW: null,
  hoursPerDay: 24,
  batteryV: 12,
  peakSunHours: null,
  daysWithoutSun: null,
  usablePercent: 50,
  signSpacingM: null,
  earthRods: null,
  testers: 1,
  mains: false,
  solar: true,
  prices: {},
  subsidyPercent: null,
};

interface PowerStore extends PowerSettings {
  setNumber: (key: PowerNumberKey, value: number | null) => void;
  setMains: (mains: boolean) => void;
  setSolar: (solar: boolean) => void;
  setPrice: (id: PriceId, value: number | null) => void;
}

export const usePowerStore = create<PowerStore>()(
  persist(
    (set) => ({
      ...initialPowerSettings,
      setNumber: (key, value) => set({ [key]: value }),
      setMains: (mains) => set({ mains }),
      setSolar: (solar) => set({ solar }),
      setPrice: (id, value) => set((state) => ({ prices: { ...state.prices, [id]: value } })),
    }),
    {
      name: powerStorageKey,
      storage: browserStorage as PersistStorage<{ settings: PowerSettings }>,
      skipHydration: true,
      partialize: (state) => ({
        settings: {
          energizerW: state.energizerW,
          hoursPerDay: state.hoursPerDay,
          batteryV: state.batteryV,
          peakSunHours: state.peakSunHours,
          daysWithoutSun: state.daysWithoutSun,
          usablePercent: state.usablePercent,
          signSpacingM: state.signSpacingM,
          earthRods: state.earthRods,
          testers: state.testers,
          mains: state.mains,
          solar: state.solar,
          prices: state.prices,
          subsidyPercent: state.subsidyPercent,
        },
      }),
      merge: (saved, current) => {
        if (saved === undefined) return current;
        const parsed = z.object({ settings: powerSettingsSchema }).safeParse(saved);
        if (!parsed.success) {
          reportDiscardedSave(powerStorageKey);
          return current;
        }
        return { ...current, ...parsed.data.settings };
      },
    },
  ),
);
