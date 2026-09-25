import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { PERMIT_PURPOSES } from '@/lib/permit-deadlines';
import {
  PERMIT_DEADLINES_MAX_ITEMS,
  permitDeadlinesSettingsSchema,
  type ExtraDeadline,
  type HuntingLicenseEntry,
  type PermitDeadlinesSettings,
  type PurposeUseEntry,
} from '@/lib/schemas/permit-deadlines';

export const PERMIT_DEADLINES_STORAGE_KEY = 'nilay-labs-permit-deadlines-v1';

const savedSchema = z.object({ settings: permitDeadlinesSettingsSchema });
type SavedState = z.infer<typeof savedSchema>;

const newId = () => Math.random().toString(36).slice(2, 10);

export const initialPermitDeadlinesSettings: PermitDeadlinesSettings = {
  birthDate: '',
  permitBasis: 'granted',
  permitFrom: '',
  gun: 'huntingGun',
  courseIssuedOn: '',
  skillsIssuedOn: '',
  licenses: [],
  extras: [],
  alarms: [30, 7],
  checked: [],
  dormant: {
    grantedOn: '',
    heldBeforeRuleStart: false,
    uses: PERMIT_PURPOSES.map((purpose) => ({ purpose, permitted: purpose === 'hunting', lastUsedOn: '' })),
  },
};

type Editable = Omit<PermitDeadlinesSettings, 'licenses' | 'extras' | 'dormant' | 'checked' | 'alarms'>;

interface PermitDeadlinesStore extends PermitDeadlinesSettings {
  set: <K extends keyof Editable>(key: K, value: Editable[K]) => void;
  addLicense: () => void;
  updateLicense: (id: string, changes: Partial<Omit<HuntingLicenseEntry, 'id'>>) => void;
  removeLicense: (id: string) => void;
  addExtra: () => void;
  updateExtra: (id: string, changes: Partial<Omit<ExtraDeadline, 'id'>>) => void;
  removeExtra: (id: string) => void;
  toggleAlarm: (days: 60 | 30 | 7 | 0, on: boolean) => void;
  toggleChecked: (id: string, on: boolean) => void;
  clearChecked: () => void;
  setDormant: (changes: Partial<Omit<PermitDeadlinesSettings['dormant'], 'uses'>>) => void;
  updateUse: (purpose: PurposeUseEntry['purpose'], changes: Partial<Omit<PurposeUseEntry, 'purpose'>>) => void;
  reset: () => void;
}

export const usePermitDeadlinesStore = create<PermitDeadlinesStore>()(
  persist(
    (set, get) => ({
      ...initialPermitDeadlinesSettings,
      set: (key, value) => set({ [key]: value } as Partial<PermitDeadlinesSettings>),
      addLicense: () => {
        const { licenses } = get();
        if (licenses.length >= 4) return;
        set({ licenses: [...licenses, { id: newId(), type: 'firstGun', basis: 'exam', date: '' }] });
      },
      updateLicense: (id, changes) =>
        set({ licenses: get().licenses.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)) }),
      removeLicense: (id) => set({ licenses: get().licenses.filter((entry) => entry.id !== id) }),
      addExtra: () => {
        const { extras } = get();
        if (extras.length >= PERMIT_DEADLINES_MAX_ITEMS) return;
        set({ extras: [...extras, { id: newId(), label: '', date: '' }] });
      },
      updateExtra: (id, changes) =>
        set({ extras: get().extras.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)) }),
      removeExtra: (id) => set({ extras: get().extras.filter((entry) => entry.id !== id) }),
      toggleAlarm: (days, on) => {
        const others = get().alarms.filter((entry) => entry !== days);
        set({ alarms: on ? [...others, days].sort((a, b) => b - a) : others });
      },
      toggleChecked: (id, on) => {
        const others = get().checked.filter((entry) => entry !== id);
        set({ checked: on ? [...others, id] : others });
      },
      clearChecked: () => set({ checked: [] }),
      setDormant: (changes) => set({ dormant: { ...get().dormant, ...changes } }),
      updateUse: (purpose, changes) =>
        set({
          dormant: {
            ...get().dormant,
            uses: get().dormant.uses.map((use) => (use.purpose === purpose ? { ...use, ...changes } : use)),
          },
        }),
      reset: () => set(initialPermitDeadlinesSettings),
    }),
    {
      name: PERMIT_DEADLINES_STORAGE_KEY,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({
        settings: {
          birthDate: state.birthDate,
          permitBasis: state.permitBasis,
          permitFrom: state.permitFrom,
          gun: state.gun,
          courseIssuedOn: state.courseIssuedOn,
          skillsIssuedOn: state.skillsIssuedOn,
          licenses: state.licenses,
          extras: state.extras,
          alarms: state.alarms,
          checked: state.checked,
          dormant: state.dormant,
        },
      }),
      merge: (saved, current) => {
        if (saved === undefined) return current;
        const parsed = savedSchema.safeParse(saved);
        if (!parsed.success) {
          reportDiscardedSave(PERMIT_DEADLINES_STORAGE_KEY);
          return current;
        }
        return { ...current, ...parsed.data.settings };
      },
    },
  ),
);
