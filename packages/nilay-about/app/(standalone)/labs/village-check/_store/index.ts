import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { ITEM_STATUSES, VILLAGE_ITEM_IDS, type Inspection, type ItemResult } from '@/lib/village-check';

export const VILLAGE_CHECK_STORAGE_KEY = 'nilay-labs-village-check-v1';
export const INSPECTIONS_MAX = 100;
export const AREA_MAX_LENGTH = 60;
export const NOTE_MAX_LENGTH = 200;

const itemResultSchema = z.object({ status: z.enum(ITEM_STATUSES), note: z.string().max(NOTE_MAX_LENGTH) });
const resultsSchema = z.record(z.enum(VILLAGE_ITEM_IDS as [string, ...string[]]), itemResultSchema);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const inspectionSchema = z.object({
  id: z.string().min(1),
  date: dateSchema,
  area: z.string().max(AREA_MAX_LENGTH),
  results: resultsSchema,
});

const draftSchema = z.object({ date: z.string(), area: z.string().max(AREA_MAX_LENGTH), results: resultsSchema });
type Draft = z.infer<typeof draftSchema>;

const savedSchema = z.object({ draft: draftSchema, inspections: z.array(inspectionSchema).max(INSPECTIONS_MAX) });

export type SaveResult = 'saved' | 'full' | 'noDate';

interface VillageCheckStore {
  draft: Draft;
  inspections: Inspection[];
  setDate: (date: string) => void;
  setArea: (area: string) => void;
  setResult: (id: string, change: Partial<ItemResult>) => void;
  saveInspection: () => SaveResult;
  deleteInspection: (id: string) => void;
  clearDraft: () => void;
}

export const emptyDraft = (): Draft => ({ date: '', area: '', results: {} });

export const useVillageCheckStore = create<VillageCheckStore>()(
  persist(
    (set, get) => ({
      draft: emptyDraft(),
      inspections: [],
      setDate: (date) => set((state) => ({ draft: { ...state.draft, date } })),
      setArea: (area) => set((state) => ({ draft: { ...state.draft, area } })),
      setResult: (id, change) =>
        set((state) => {
          const current = state.draft.results[id] ?? { status: 'unchecked', note: '' };
          return { draft: { ...state.draft, results: { ...state.draft.results, [id]: { ...current, ...change } } } };
        }),
      saveInspection: () => {
        const { draft, inspections } = get();
        if (!dateSchema.safeParse(draft.date).success) return 'noDate';
        if (inspections.length >= INSPECTIONS_MAX) return 'full';
        const inspection = inspectionSchema.parse({ ...draft, area: draft.area.trim(), id: crypto.randomUUID() });
        // The form starts empty for the next inspection, which is then compared with this one.
        set({ inspections: [...inspections, inspection], draft: emptyDraft() });
        return 'saved';
      },
      deleteInspection: (id) => set((state) => ({ inspections: state.inspections.filter((item) => item.id !== id) })),
      clearDraft: () => set({ draft: emptyDraft() }),
    }),
    {
      name: VILLAGE_CHECK_STORAGE_KEY,
      storage: browserStorage as PersistStorage<unknown>,
      skipHydration: true,
      partialize: (state) => ({ draft: state.draft, inspections: state.inspections }),
      merge: (saved, current) => {
        if (saved === undefined) return current;
        const parsed = savedSchema.safeParse(saved);
        if (!parsed.success) {
          reportDiscardedSave(VILLAGE_CHECK_STORAGE_KEY);
          return current;
        }
        return { ...current, draft: parsed.data.draft, inspections: parsed.data.inspections };
      },
    },
  ),
);
