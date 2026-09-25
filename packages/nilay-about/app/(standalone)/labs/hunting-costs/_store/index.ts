import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { STANDARD_FEES, registrationYearOf } from '@/lib/hunting-costs';
import {
  HUNTING_COSTS_MAX_OTHER,
  HUNTING_COSTS_MAX_REGISTRATIONS,
  huntingCostsSettingsSchema,
  type CostRegistration,
  type FeeSchedule,
  type HuntingCostsSettings,
  type OtherCost,
} from '@/lib/schemas/hunting-costs';
import type { LicenseType } from '@/lib/schemas/hunting-log';
import { todayInJapan } from '@/lib/snare-gauge';

export const HUNTING_COSTS_STORAGE_KEY = 'nilay-labs-hunting-costs-v1';

const savedSchema = z.object({ settings: huntingCostsSettingsSchema });
type SavedState = z.infer<typeof savedSchema>;

const newId = () => Math.random().toString(36).slice(2, 10);

export function initialHuntingCostsSettings(today: string = todayInJapan(new Date())): HuntingCostsSettings {
  return {
    season: registrationYearOf(today),
    licenses: [{ type: 'firstGun', partlyExempt: false }],
    lowIncome: false,
    registrations: [
      { id: 'first', prefecture: '東京都', types: ['firstGun'], releaseArea: 'none', relief: 'none', registeredOn: '' },
    ],
    others: [],
    fees: STANDARD_FEES,
  };
}

interface HuntingCostsStore extends HuntingCostsSettings {
  lastValidSettings: HuntingCostsSettings;
  setSeason: (season: number) => void;
  setLowIncome: (lowIncome: boolean) => void;
  toggleLicense: (type: LicenseType, held: boolean) => void;
  setPartlyExempt: (type: LicenseType, partlyExempt: boolean) => void;
  addRegistration: () => void;
  updateRegistration: (id: string, changes: Partial<Omit<CostRegistration, 'id'>>) => void;
  removeRegistration: (id: string) => void;
  addOther: () => void;
  updateOther: (id: string, changes: Partial<Omit<OtherCost, 'id'>>) => void;
  removeOther: (id: string) => void;
  setFee: (key: keyof FeeSchedule, value: number) => void;
  reset: () => void;
}

const settingsOf = (state: HuntingCostsSettings): HuntingCostsSettings => ({
  season: state.season,
  licenses: state.licenses,
  lowIncome: state.lowIncome,
  registrations: state.registrations,
  others: state.others,
  fees: state.fees,
});

export const useHuntingCostsStore = create<HuntingCostsStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<HuntingCostsSettings>) => {
        const parsed = huntingCostsSettingsSchema.safeParse({ ...settingsOf(get()), ...changes });
        // A number being typed can be half-finished; what is saved is the last complete set.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      const initial = initialHuntingCostsSettings();
      return {
        ...initial,
        lastValidSettings: initial,
        setSeason: (season) => edit({ season }),
        setLowIncome: (lowIncome) => edit({ lowIncome }),
        toggleLicense: (type, held) => {
          const others = get().licenses.filter((license) => license.type !== type);
          const order: LicenseType[] = ['net', 'trap', 'firstGun', 'secondGun'];
          const licenses = held ? [...others, { type, partlyExempt: false }] : others;
          licenses.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
          // A registration can only be for a licence held.
          const registrations = held
            ? get().registrations
            : get().registrations.map((registration) => ({
                ...registration,
                types: registration.types.filter((entry) => entry !== type),
              }));
          edit({ licenses, registrations });
        },
        setPartlyExempt: (type, partlyExempt) =>
          edit({
            licenses: get().licenses.map((license) => (license.type === type ? { ...license, partlyExempt } : license)),
          }),
        addRegistration: () => {
          const { registrations, licenses } = get();
          if (registrations.length >= HUNTING_COSTS_MAX_REGISTRATIONS) return;
          edit({
            registrations: [
              ...registrations,
              {
                id: newId(),
                prefecture: '北海道',
                types: licenses.map((license) => license.type),
                releaseArea: 'none',
                relief: 'none',
                registeredOn: '',
              },
            ],
          });
        },
        updateRegistration: (id, changes) =>
          edit({
            registrations: get().registrations.map((registration) =>
              registration.id === id ? { ...registration, ...changes } : registration,
            ),
          }),
        removeRegistration: (id) =>
          edit({ registrations: get().registrations.filter((registration) => registration.id !== id) }),
        addOther: () => {
          const { others } = get();
          if (others.length >= HUNTING_COSTS_MAX_OTHER) return;
          edit({ others: [...others, { id: newId(), label: '', amount: 0 }] });
        },
        updateOther: (id, changes) =>
          edit({ others: get().others.map((other) => (other.id === id ? { ...other, ...changes } : other)) }),
        removeOther: (id) => edit({ others: get().others.filter((other) => other.id !== id) }),
        setFee: (key, value) => edit({ fees: { ...get().fees, [key]: value } }),
        reset: () => {
          const settings = initialHuntingCostsSettings();
          set({ ...settings, lastValidSettings: settings });
        },
      };
    },
    {
      name: HUNTING_COSTS_STORAGE_KEY,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ settings: state.lastValidSettings }),
      merge: (saved, current) => {
        if (saved === undefined) return current;
        const parsed = savedSchema.safeParse(saved);
        if (!parsed.success) {
          reportDiscardedSave(HUNTING_COSTS_STORAGE_KEY);
          return current;
        }
        return { ...current, ...parsed.data.settings, lastValidSettings: parsed.data.settings };
      },
    },
  ),
);
