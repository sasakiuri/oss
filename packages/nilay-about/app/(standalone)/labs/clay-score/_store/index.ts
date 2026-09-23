import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { emptySheet, summarizeRound } from '@/lib/clay-score';
import {
  NOTE_MAX_LENGTH,
  clayDisciplineSchema,
  clayRoundRecordSchema,
  noteSchema,
  sheetResultsSchema,
  trapStartStationSchema,
  type ClayDiscipline,
  type ClayRoundRecord,
  type TargetResult,
} from '@/lib/schemas/clay-score';

export const storageKey = 'nilay-labs-clay-score-v1';

const savedSchema = z.object({
  discipline: clayDisciplineSchema,
  startStation: trapStartStationSchema,
  results: sheetResultsSchema,
  note: noteSchema,
  records: z.array(clayRoundRecordSchema),
});
type SavedState = z.infer<typeof savedSchema>;

interface ClayScoreStore {
  discipline: ClayDiscipline;
  startStation: number;
  results: (TargetResult | null)[];
  note: string;
  records: ClayRoundRecord[];
  deletedRecord: { record: ClayRoundRecord; index: number } | null;
  /** Changing the discipline changes every target on the sheet, so the sheet starts over. */
  setDiscipline: (discipline: ClayDiscipline) => void;
  /** Only relabels the stations: the results stay in the order they were shot. */
  setStartStation: (station: number) => void;
  /** Records the next target not yet recorded. False once the sheet is full. */
  mark: (result: TargetResult) => boolean;
  /** Steps one target through not recorded, hit and miss, for correcting a single box. */
  cycle: (index: number) => void;
  /** Clears the last target recorded in shooting order. */
  undoLast: () => void;
  clearSheet: () => void;
  setNote: (note: string) => void;
  /** Keeps a full sheet in the history and opens a clean one. False unless all 25 are recorded. */
  saveRound: () => boolean;
  deleteRecord: (id: string) => void;
  undoDelete: () => void;
}

export const initialClayScoreState = {
  discipline: 'trap' as ClayDiscipline,
  startStation: 1,
  results: emptySheet(),
  note: '',
};

const nextResult = { none: 'hit', hit: 'miss', miss: null } as const;

export const useClayScoreStore = create<ClayScoreStore>()(
  persist(
    (set, get) => ({
      ...initialClayScoreState,
      records: [],
      deletedRecord: null,
      setDiscipline: (discipline) =>
        set((state) => (state.discipline === discipline ? state : { discipline, results: emptySheet() })),
      setStartStation: (station) => {
        if (trapStartStationSchema.safeParse(station).success) set({ startStation: station });
      },
      mark: (result) => {
        const { discipline, startStation, results } = get();
        const { nextIndex } = summarizeRound(discipline, startStation, results);
        if (nextIndex === null) return false;
        set({ results: results.map((value, index) => (index === nextIndex ? result : value)) });
        return true;
      },
      cycle: (index) =>
        set((state) => ({
          results: state.results.map((value, position) => (position === index ? nextResult[value ?? 'none'] : value)),
        })),
      undoLast: () =>
        set((state) => {
          let last = state.results.length - 1;
          while (last >= 0 && state.results[last] === null) last--;
          return last === -1
            ? state
            : { results: state.results.map((value, index) => (index === last ? null : value)) };
        }),
      clearSheet: () => set({ results: emptySheet() }),
      setNote: (note) => set({ note: note.slice(0, NOTE_MAX_LENGTH) }),
      saveRound: () => {
        const { discipline, startStation, results, note, records } = get();
        const record = clayRoundRecordSchema.safeParse({
          id: crypto.randomUUID(),
          savedAt: new Date().toISOString(),
          discipline,
          ...(discipline === 'trap' ? { startStation } : {}),
          results,
          note: note.trim(),
        });
        if (!record.success) return false;
        // The note usually names the range or the gun, which the next round shares, so it stays.
        set({ records: [record.data, ...records], results: emptySheet(), deletedRecord: null });
        return true;
      },
      deleteRecord: (id) => {
        const index = get().records.findIndex((record) => record.id === id);
        const record = get().records[index];
        if (!record) return;
        set((state) => ({ deletedRecord: { record, index }, records: state.records.filter((item) => item.id !== id) }));
      },
      undoDelete: () => {
        const deleted = get().deletedRecord;
        if (!deleted) return;
        const records = [...get().records];
        records.splice(deleted.index, 0, deleted.record);
        set({ records, deletedRecord: null });
      },
    }),
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({
        discipline: state.discipline,
        startStation: state.startStation,
        results: state.results,
        note: state.note,
        records: state.records,
      }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) return { ...current, ...parsed.data };
        // A first visit has nothing saved; report only data that could not be read.
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);

/** The reset clears the sheet and the settings; the saved rounds are history, not input, and stay. */
export const resetClayScore = () => useClayScoreStore.setState({ ...initialClayScoreState, results: emptySheet() });
