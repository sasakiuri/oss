import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  DEFAULT_KEY_MAP,
  emptyDirections,
  emptySheet,
  lastTurn,
  nextTurn,
  squadStartStation,
  summarizeRound,
  type Turn,
} from '@/lib/clay-score';
import {
  MAX_SQUAD,
  NOTE_MAX_LENGTH,
  TAG_MAX_LENGTH,
  sheetDirectionsSchema,
  sheetResultsSchema,
  tagSchema,
  trapStartStationSchema,
  clayDisciplineSchema,
  clayRoundRecordSchema,
  clayTagsSchema,
  emptyTags,
  keyMapSchema,
  noteSchema,
  resultsAllowed,
  squadShooterSchema,
  type ClayDiscipline,
  type ClayRoundRecord,
  type ClayTagKey,
  type ClayTags,
  type KeyAction,
  type KeyMap,
  type SquadShooter,
  type TargetResult,
  type TrapDirection,
} from '@/lib/schemas/clay-score';

export const storageKey = 'nilay-labs-clay-score-v1';
/**
 * What is saved. The first five fields are the shape saved before barrels, directions, squads, tags and
 * sessions were added, and a save of that shape still reads as it is: every later field is optional,
 * and a missing one means it was never recorded. The first shooter's sheet stays at the top level;
 * the rest of a squad is kept apart in `squad`.
 */
const savedSchema = z.object({
  discipline: clayDisciplineSchema,
  startStation: trapStartStationSchema,
  results: sheetResultsSchema,
  note: noteSchema,
  records: z.array(clayRoundRecordSchema),
  directions: sheetDirectionsSchema.optional(),
  shooterName: tagSchema.optional(),
  shooterId: z.string().min(1).optional(),
  squad: z
    .array(squadShooterSchema)
    .max(MAX_SQUAD - 1)
    .optional(),
  barrels: z.boolean().optional(),
  recordDirections: z.boolean().optional(),
  tags: clayTagsSchema.optional(),
  sessionId: z.string().min(1).optional(),
  keysEnabled: z.boolean().optional(),
  keyMap: keyMapSchema.optional(),
});
type SavedState = z.infer<typeof savedSchema>;

interface ClayState {
  discipline: ClayDiscipline;
  barrels: boolean;
  recordDirections: boolean;
  shooters: SquadShooter[];
  note: string;
  tags: ClayTags;
  sessionId: string;
  records: ClayRoundRecord[];
  keysEnabled: boolean;
  keyMap: KeyMap;
}

/**
 * Reads a save into the working state. A sheet saved without the barrel setting was kept as plain hit
 * or miss, so it goes on without barrels; a sheet saved without directions has none recorded. The
 * settings a save does not mention (keys, a session to add to) are the ones a first visit gets.
 */
function fromSaved<T extends ClayState>(saved: SavedState, current: T): T {
  return {
    ...current,
    discipline: saved.discipline,
    barrels: saved.barrels ?? false,
    recordDirections: saved.recordDirections ?? false,
    shooters: [
      {
        id: saved.shooterId ?? current.shooters[0]?.id ?? crypto.randomUUID(),
        name: saved.shooterName ?? '',
        startStation: saved.startStation,
        results: saved.results,
        directions: saved.directions ?? emptyDirections(),
      },
      ...(saved.squad ?? []),
    ],
    note: saved.note,
    tags: saved.tags ?? emptyTags(),
    sessionId: saved.sessionId ?? current.sessionId,
    records: saved.records,
    keysEnabled: saved.keysEnabled ?? current.keysEnabled,
    keyMap: saved.keyMap ?? current.keyMap,
  };
}

function toSaved(state: ClayState): SavedState {
  const [first, ...squad] = state.shooters;
  return {
    discipline: state.discipline,
    startStation: first?.startStation ?? 1,
    results: first?.results ?? emptySheet(),
    note: state.note,
    records: state.records,
    directions: first?.directions ?? emptyDirections(),
    shooterName: first?.name ?? '',
    ...(first ? { shooterId: first.id } : {}),
    squad,
    barrels: state.barrels,
    recordDirections: state.recordDirections,
    tags: state.tags,
    sessionId: state.sessionId,
    keysEnabled: state.keysEnabled,
    keyMap: state.keyMap,
  };
}

export interface MarkedTurn extends Turn {
  result: TargetResult;
  direction: TrapDirection | null;
}

interface ClayScoreStore extends ClayState {
  /** The history as it was before the last delete, for undo; any save since then drops it. */
  deletedRecords: { records: ClayRoundRecord[]; before: ClayRoundRecord[] } | null;
  /** Changing the discipline changes every target on the sheet, so the sheets start over. */
  setDiscipline: (discipline: ClayDiscipline) => void;
  /** Only while nothing is recorded: a sheet cannot hold hits with and without barrels. */
  setBarrels: (barrels: boolean) => boolean;
  setRecordDirections: (recordDirections: boolean) => void;
  /** Adds empty sheets or drops the last ones; the caller asks before dropping recorded results. */
  setSquadSize: (size: number) => void;
  setShooterName: (shooter: number, name: string) => void;
  /** Only relabels the stations: the results stay in the order they were shot. */
  setStartStation: (shooter: number, station: number) => void;
  /** Records the next turn in shooting order. Null when every sheet is full or the result does not fit. */
  mark: (result: TargetResult, direction?: TrapDirection | null) => MarkedTurn | null;
  /** Steps one box through not recorded and the results this sheet allows. */
  cycle: (shooter: number, index: number) => void;
  /** Sets or clears the direction of one recorded trap target. */
  setDirection: (shooter: number, index: number, direction: TrapDirection | null) => void;
  /** Clears the last target recorded in shooting order. */
  undoLast: () => Turn | null;
  clearSheet: () => void;
  setNote: (note: string) => void;
  setTag: (key: ClayTagKey, value: string) => void;
  /** Keeps every full sheet in the history and opens clean ones. False unless every shooter has all 25. */
  saveRound: () => boolean;
  startSession: () => void;
  /** Deletes a round, or every round of a session. */
  deleteRecords: (ids: readonly string[]) => void;
  undoDelete: () => void;
  setKeysEnabled: (enabled: boolean) => void;
  setKey: (action: KeyAction, key: string | null) => void;
}

const newShooter = (position: number): SquadShooter => ({
  id: crypto.randomUUID(),
  name: '',
  startStation: squadStartStation(position),
  results: emptySheet(),
  directions: emptyDirections(),
});

const clearShooter = (shooter: SquadShooter): SquadShooter => ({
  ...shooter,
  results: emptySheet(),
  directions: emptyDirections(),
});

export const initialClayScoreState = () => ({
  discipline: 'trap' as ClayDiscipline,
  barrels: true,
  recordDirections: false,
  shooters: [newShooter(0)],
  note: '',
  tags: emptyTags(),
});

const sheetsOf = (shooters: readonly SquadShooter[]) => shooters.map((shooter) => shooter.results);

const replaceShooter = (shooters: readonly SquadShooter[], position: number, change: Partial<SquadShooter>) =>
  shooters.map((shooter, index) => (index === position ? { ...shooter, ...change } : shooter));

const replaceAt = <T>(values: readonly T[], position: number, value: T) =>
  values.map((item, index) => (index === position ? value : item));

export const anyRecorded = (shooters: readonly SquadShooter[]) =>
  shooters.some((shooter) => shooter.results.some((result) => result !== null));

export const useClayScoreStore = create<ClayScoreStore>()(
  persist(
    (set, get) => ({
      ...initialClayScoreState(),
      sessionId: crypto.randomUUID(),
      records: [],
      deletedRecords: null,
      keysEnabled: false,
      keyMap: DEFAULT_KEY_MAP,
      setDiscipline: (discipline) =>
        set((state) =>
          state.discipline === discipline ? state : { discipline, shooters: state.shooters.map(clearShooter) },
        ),
      setBarrels: (barrels) => {
        if (anyRecorded(get().shooters)) return get().barrels === barrels;
        set({ barrels });
        return true;
      },
      setRecordDirections: (recordDirections) => set({ recordDirections }),
      setSquadSize: (size) => {
        const count = Math.max(1, Math.min(MAX_SQUAD, Math.floor(size)));
        if (!Number.isFinite(count)) return;
        set((state) => ({
          shooters:
            count <= state.shooters.length
              ? state.shooters.slice(0, count)
              : [
                  ...state.shooters,
                  ...Array.from({ length: count - state.shooters.length }, (_, extra) =>
                    newShooter(state.shooters.length + extra),
                  ),
                ],
        }));
      },
      setShooterName: (shooter, name) =>
        set((state) => ({
          shooters: replaceShooter(state.shooters, shooter, { name: name.slice(0, TAG_MAX_LENGTH) }),
        })),
      setStartStation: (shooter, station) => {
        if (Number.isInteger(station) && station >= 1 && station <= 5)
          set((state) => ({ shooters: replaceShooter(state.shooters, shooter, { startStation: station }) }));
      },
      mark: (result, direction = null) => {
        const { discipline, barrels, shooters } = get();
        if (!resultsAllowed(discipline, barrels).includes(result)) return null;
        const turn = nextTurn(discipline, sheetsOf(shooters));
        const sheet = turn ? shooters[turn.shooter] : undefined;
        if (!turn || !sheet) return null;
        const kept = discipline === 'trap' ? direction : null;
        set({
          shooters: replaceShooter(shooters, turn.shooter, {
            results: replaceAt(sheet.results, turn.index, result),
            directions: replaceAt(sheet.directions, turn.index, kept),
          }),
        });
        return { ...turn, result, direction: kept };
      },
      cycle: (shooter, index) =>
        set((state) => {
          const sheet = state.shooters[shooter];
          if (!sheet) return state;
          const steps: (TargetResult | null)[] = [null, ...resultsAllowed(state.discipline, state.barrels)];
          const next = steps[(steps.indexOf(sheet.results[index] ?? null) + 1) % steps.length] ?? null;
          return {
            shooters: replaceShooter(state.shooters, shooter, {
              results: replaceAt(sheet.results, index, next),
              // A box cleared back to not recorded has no direction either.
              directions: next === null ? replaceAt(sheet.directions, index, null) : sheet.directions,
            }),
          };
        }),
      setDirection: (shooter, index, direction) =>
        set((state) => {
          const sheet = state.shooters[shooter];
          if (!sheet || state.discipline !== 'trap' || sheet.results[index] === null) return state;
          return {
            shooters: replaceShooter(state.shooters, shooter, {
              directions: replaceAt(sheet.directions, index, direction),
            }),
          };
        }),
      undoLast: () => {
        const { discipline, shooters } = get();
        const turn = lastTurn(discipline, sheetsOf(shooters));
        const sheet = turn ? shooters[turn.shooter] : undefined;
        if (!turn || !sheet) return null;
        set({
          shooters: replaceShooter(shooters, turn.shooter, {
            results: replaceAt(sheet.results, turn.index, null),
            directions: replaceAt(sheet.directions, turn.index, null),
          }),
        });
        return turn;
      },
      clearSheet: () => set((state) => ({ shooters: state.shooters.map(clearShooter) })),
      setNote: (note) => set({ note: note.slice(0, NOTE_MAX_LENGTH) }),
      setTag: (key, value) => set((state) => ({ tags: { ...state.tags, [key]: value.slice(0, TAG_MAX_LENGTH) } })),
      saveRound: () => {
        const { discipline, barrels, shooters, note, tags, sessionId, records } = get();
        const savedAt = new Date().toISOString();
        const saved: ClayRoundRecord[] = [];
        for (const shooter of shooters) {
          if (!summarizeRound({ discipline, startStation: shooter.startStation, results: shooter.results }).complete)
            return false;
          const record = clayRoundRecordSchema.safeParse({
            id: crypto.randomUUID(),
            savedAt,
            discipline,
            ...(discipline === 'trap' ? { startStation: shooter.startStation, barrels } : {}),
            results: shooter.results,
            directions: discipline === 'trap' ? shooter.directions : emptyDirections(),
            note: note.trim(),
            shooter: shooter.name.trim(),
            sessionId,
            tags: trimTags(tags),
          });
          if (!record.success) return false;
          saved.push(record.data);
        }
        // The note and tags usually name the range, the gun and the day, which the next round shares, so they stay.
        set({ records: [...saved, ...records], shooters: shooters.map(clearShooter), deletedRecords: null });
        return true;
      },
      startSession: () => set({ sessionId: crypto.randomUUID() }),
      deleteRecords: (ids) => {
        const records = get().records;
        const deleted = records.filter((record) => ids.includes(record.id));
        if (deleted.length === 0) return;
        set({
          deletedRecords: { records: deleted, before: records },
          records: records.filter((record) => !ids.includes(record.id)),
        });
      },
      undoDelete: () => {
        const deleted = get().deletedRecords;
        if (deleted) set({ records: deleted.before, deletedRecords: null });
      },
      setKeysEnabled: (keysEnabled) => set({ keysEnabled }),
      setKey: (action, key) =>
        set((state) => {
          // One key does one thing: taking it for this action frees it from any other.
          const keyMap = Object.fromEntries(
            Object.entries(state.keyMap).map(([name, assigned]) => [
              name,
              key !== null && assigned === key ? null : assigned,
            ]),
          ) as KeyMap;
          return { keyMap: { ...keyMap, [action]: key } };
        }),
    }),
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => toSaved(state),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) return fromSaved(parsed.data, current);
        // A first visit has nothing saved; report only data that could not be read.
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);

const trimTags = (tags: ClayTags): ClayTags =>
  Object.fromEntries(Object.entries(tags).map(([key, value]) => [key, value.trim()])) as ClayTags;

/** The reset clears the sheets and the settings of the round; the saved rounds are history, not input, and stay. */
export const resetClayScore = () => useClayScoreStore.setState(initialClayScoreState());
