import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { REWARD_CLASSES, SHOT_ITEMS, type RewardRow } from '@/lib/capture-check';

export const CAPTURE_CHECK_STORAGE_KEY = 'nilay-labs-capture-check-v1';

export const REWARD_ROWS_MAX = 20;
const REWARD_LABEL_MAX = 40;

const shotIds = SHOT_ITEMS.map((item) => item.id) as [string, ...string[]];

// Amounts are kept as typed, including half-typed values; the calculation marks the ones it cannot use.
const rewardRowSchema = z.object({
  id: z.string().min(1),
  rewardClass: z.enum(REWARD_CLASSES),
  label: z.string().max(REWARD_LABEL_MAX),
  nationalYen: z.number(),
  heads: z.number(),
  prefectureYen: z.number(),
  municipalityYen: z.number(),
});

const savedSchema = z.object({
  checked: z.array(z.enum(shotIds)),
  solo: z.boolean(),
  rows: z.array(rewardRowSchema).max(REWARD_ROWS_MAX),
});
type SavedState = z.infer<typeof savedSchema>;

/** NaN does not survive JSON, so an emptied amount is saved as null and read back as NaN. */
type StoredRow = Omit<RewardRow, 'nationalYen' | 'heads' | 'prefectureYen' | 'municipalityYen'> & {
  nationalYen: number | null;
  heads: number | null;
  prefectureYen: number | null;
  municipalityYen: number | null;
};

const newRow = (): RewardRow => ({
  id: crypto.randomUUID(),
  rewardClass: 'deerBoarOther',
  label: '',
  nationalYen: 0,
  heads: 1,
  prefectureYen: 0,
  municipalityYen: 0,
});

interface CaptureCheckStore {
  /** The photo items ticked for the animal at hand. Not a record: cleared for the next animal. */
  checked: string[];
  solo: boolean;
  rows: RewardRow[];
  toggleChecked: (id: string) => void;
  clearChecked: () => void;
  setSolo: (solo: boolean) => void;
  addRow: () => boolean;
  updateRow: (id: string, change: Partial<Omit<RewardRow, 'id'>>) => void;
  removeRow: (id: string) => void;
}

export const initialCaptureCheckState = { checked: [] as string[], solo: false, rows: [] as RewardRow[] };

const toNumber = (value: number | null) => (value === null ? Number.NaN : value);
const toStored = (value: number) => (Number.isFinite(value) ? value : null);

export const useCaptureCheckStore = create<CaptureCheckStore>()(
  persist(
    (set, get) => ({
      ...initialCaptureCheckState,
      toggleChecked: (id) =>
        set((state) => ({
          checked: state.checked.includes(id) ? state.checked.filter((item) => item !== id) : [...state.checked, id],
        })),
      clearChecked: () => set({ checked: [] }),
      setSolo: (solo) => set({ solo }),
      addRow: () => {
        if (get().rows.length >= REWARD_ROWS_MAX) return false;
        set((state) => ({ rows: [...state.rows, newRow()] }));
        return true;
      },
      updateRow: (id, change) =>
        set((state) => ({ rows: state.rows.map((row) => (row.id === id ? { ...row, ...change } : row)) })),
      removeRow: (id) => set((state) => ({ rows: state.rows.filter((row) => row.id !== id) })),
    }),
    {
      name: CAPTURE_CHECK_STORAGE_KEY,
      storage: browserStorage as PersistStorage<unknown>,
      skipHydration: true,
      partialize: (state) => ({
        checked: state.checked,
        solo: state.solo,
        rows: state.rows.map((row): StoredRow => ({
          ...row,
          nationalYen: toStored(row.nationalYen),
          heads: toStored(row.heads),
          prefectureYen: toStored(row.prefectureYen),
          municipalityYen: toStored(row.municipalityYen),
        })),
      }),
      merge: (saved, current) => {
        if (saved === undefined) return current;
        const numberOrNull = z.number().finite().nullable();
        const parsed = savedSchema
          .extend({
            rows: z
              .array(
                rewardRowSchema.extend({
                  nationalYen: numberOrNull,
                  heads: numberOrNull,
                  prefectureYen: numberOrNull,
                  municipalityYen: numberOrNull,
                }),
              )
              .max(REWARD_ROWS_MAX),
          })
          .safeParse(saved);
        if (!parsed.success) {
          reportDiscardedSave(CAPTURE_CHECK_STORAGE_KEY);
          return current;
        }
        const state: SavedState = {
          ...parsed.data,
          rows: parsed.data.rows.map((row) => ({
            ...row,
            nationalYen: toNumber(row.nationalYen),
            heads: toNumber(row.heads),
            prefectureYen: toNumber(row.prefectureYen),
            municipalityYen: toNumber(row.municipalityYen),
          })),
        };
        return { ...current, ...state };
      },
    },
  ),
);
