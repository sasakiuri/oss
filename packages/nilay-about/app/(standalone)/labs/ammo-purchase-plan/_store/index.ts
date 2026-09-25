import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  AMMO_PLAN_MAX_ROWS,
  ammoPlanSettingsSchema,
  type AmmoKind,
  type AmmoPlanRow,
  type AmmoPlanSettings,
} from '@/lib/schemas/ammo-purchase-plan';

export const AMMO_PLAN_STORAGE_KEY = 'nilay-labs-ammo-purchase-plan-v1';

const savedSchema = z.object({ settings: ammoPlanSettingsSchema });
type SavedState = z.infer<typeof savedSchema>;

const newId = () => Math.random().toString(36).slice(2, 10);

export const initialAmmoPlanSettings: AmmoPlanSettings = {
  periodFrom: '',
  periodTo: '',
  requested: { cartridge: null, blank: null, primer: null, smokeless: null, blackPowder: null },
  rows: [],
};

interface AmmoPlanStore extends AmmoPlanSettings {
  lastValidSettings: AmmoPlanSettings;
  setPeriod: (changes: Partial<Pick<AmmoPlanSettings, 'periodFrom' | 'periodTo'>>) => void;
  setRequested: (kind: AmmoKind, value: number | null) => void;
  addRow: () => void;
  updateRow: (id: string, changes: Partial<Omit<AmmoPlanRow, 'id'>>) => void;
  removeRow: (id: string) => void;
  reset: () => void;
}

const settingsOf = (state: AmmoPlanSettings): AmmoPlanSettings => ({
  periodFrom: state.periodFrom,
  periodTo: state.periodTo,
  requested: state.requested,
  rows: state.rows,
});

export const useAmmoPlanStore = create<AmmoPlanStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<AmmoPlanSettings>) => {
        const parsed = ammoPlanSettingsSchema.safeParse({ ...settingsOf(get()), ...changes });
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialAmmoPlanSettings,
        lastValidSettings: initialAmmoPlanSettings,
        setPeriod: (changes) => edit(changes),
        setRequested: (kind, value) => edit({ requested: { ...get().requested, [kind]: value } }),
        addRow: () => {
          const { rows, periodFrom, periodTo } = get();
          if (rows.length >= AMMO_PLAN_MAX_ROWS) return;
          const previous = rows.at(-1);
          edit({
            rows: [
              ...rows,
              {
                id: newId(),
                from: periodFrom,
                to: periodTo,
                kind: previous?.kind ?? 'cartridge',
                name: previous?.name ?? '',
                quantity: 0,
                reason: previous?.reason ?? '',
                place: '',
                note: '',
              },
            ],
          });
        },
        updateRow: (id, changes) =>
          edit({ rows: get().rows.map((row) => (row.id === id ? { ...row, ...changes } : row)) }),
        removeRow: (id) => edit({ rows: get().rows.filter((row) => row.id !== id) }),
        reset: () => set({ ...initialAmmoPlanSettings, lastValidSettings: initialAmmoPlanSettings }),
      };
    },
    {
      name: AMMO_PLAN_STORAGE_KEY,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ settings: state.lastValidSettings }),
      merge: (saved, current) => {
        if (saved === undefined) return current;
        const parsed = savedSchema.safeParse(saved);
        if (!parsed.success) {
          reportDiscardedSave(AMMO_PLAN_STORAGE_KEY);
          return current;
        }
        return { ...current, ...parsed.data.settings, lastValidSettings: parsed.data.settings };
      },
    },
  ),
);
