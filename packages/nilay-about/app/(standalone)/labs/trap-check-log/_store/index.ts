import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  CHECKS_PER_TRAP_MAX,
  TRAP_MAX_COUNT,
  WORK_SESSIONS_MAX,
  intervalHoursSchema,
  trapCheckSchema,
  trapSchema,
  workSessionSchema,
  type Trap,
  type TrapCheck,
  type WorkSession,
} from '@/lib/schemas/trap-check-log';
import { validateCheckTime, type CheckTimeError } from '@/lib/trap-check-log';

export const TRAP_CHECK_LOG_STORAGE_KEY = 'nilay-labs-trap-check-log-v1';

/**
 * The opening interval. It is a starting point for the field, not a rule: the page says so, and
 * points to the prefectural guidance and permit conditions the person has to follow instead.
 */
export const DEFAULT_INTERVAL_HOURS = 24;

const savedSchema = z.object({
  intervalHours: intervalHoursSchema,
  traps: z.array(trapSchema).max(TRAP_MAX_COUNT),
  // Added with the work sheet on 2026-09-24; a log saved before then has no work recorded.
  work: z.array(workSessionSchema).max(WORK_SESSIONS_MAX).optional(),
});
type SavedState = z.infer<typeof savedSchema>;

export type TrapFields = Pick<Trap, 'name' | 'kind' | 'installedAt' | 'location' | 'latitude' | 'longitude'> &
  Partial<Pick<Trap, 'accuracyM'>>;
export type AddResult = 'added' | 'full';
export type AddCheckResult = AddResult | CheckTimeError;
export type WorkResult = 'added' | 'full' | 'invalid' | 'endBeforeStart' | 'open';

interface TrapCheckLogStore {
  /** What the field holds, which can be half typed or out of range. */
  intervalHours: number;
  /** The last value that passed, which the warnings and the saved data use. */
  lastValidIntervalHours: number;
  traps: Trap[];
  work: WorkSession[];
  setIntervalHours: (hours: number) => void;
  resetInterval: () => void;
  addTrap: (fields: TrapFields) => AddResult;
  deleteTrap: (id: string) => void;
  setRemoved: (id: string, removedAt: string | null) => void;
  /** Returns the id the round was saved under, so a photo can be stored with it. */
  addCheck: (trapId: string, check: Omit<TrapCheck, 'id'>, id?: string) => AddCheckResult;
  deleteCheck: (trapId: string, checkId: string) => void;
  /** Starts a stretch of work at the given minute. Only one stretch is open at a time. */
  startWork: (start: string) => WorkResult;
  endWork: (id: string, end: string, note: string) => WorkResult;
  /** A stretch entered afterwards, with both ends. */
  addWork: (session: Omit<WorkSession, 'id'>) => WorkResult;
  deleteWork: (id: string) => void;
  clearAll: () => void;
}

export const initialTrapCheckLogState = {
  intervalHours: DEFAULT_INTERVAL_HOURS,
  lastValidIntervalHours: DEFAULT_INTERVAL_HOURS,
  traps: [] as Trap[],
  work: [] as WorkSession[],
};

export const useTrapCheckLogStore = create<TrapCheckLogStore>()(
  persist(
    (set, get) => {
      const editTrap = (id: string, change: (trap: Trap) => Trap) =>
        set((state) => ({ traps: state.traps.map((trap) => (trap.id === id ? change(trap) : trap)) }));
      return {
        ...initialTrapCheckLogState,
        setIntervalHours: (intervalHours) => {
          const parsed = intervalHoursSchema.safeParse(intervalHours);
          set({ intervalHours, ...(parsed.success ? { lastValidIntervalHours: parsed.data } : {}) });
        },
        resetInterval: () =>
          set({ intervalHours: DEFAULT_INTERVAL_HOURS, lastValidIntervalHours: DEFAULT_INTERVAL_HOURS }),
        addTrap: (fields) => {
          if (get().traps.length >= TRAP_MAX_COUNT) return 'full';
          const trap = trapSchema.parse({ ...fields, id: crypto.randomUUID(), removedAt: null, checks: [] });
          set((state) => ({ traps: [...state.traps, trap] }));
          return 'added';
        },
        deleteTrap: (id) => set((state) => ({ traps: state.traps.filter((trap) => trap.id !== id) })),
        setRemoved: (id, removedAt) => editTrap(id, (trap) => trapSchema.parse({ ...trap, removedAt })),
        addCheck: (trapId, check, id = crypto.randomUUID()) => {
          const trap = get().traps.find((item) => item.id === trapId);
          if (!trap) return 'full';
          const timeError = validateCheckTime(trap, check.at);
          if (timeError) return timeError;
          if (trap.checks.length >= CHECKS_PER_TRAP_MAX) return 'full';
          const entry = trapCheckSchema.parse({ ...check, id });
          editTrap(trapId, (current) => ({ ...current, checks: [...current.checks, entry] }));
          return 'added';
        },
        deleteCheck: (trapId, checkId) =>
          editTrap(trapId, (trap) => ({ ...trap, checks: trap.checks.filter((check) => check.id !== checkId) })),
        startWork: (start) => {
          const { work } = get();
          if (work.some((session) => session.end === null)) return 'open';
          if (work.length >= WORK_SESSIONS_MAX) return 'full';
          const parsed = workSessionSchema.safeParse({ id: crypto.randomUUID(), start, end: null, note: '' });
          if (!parsed.success) return 'invalid';
          set({ work: [...work, parsed.data] });
          return 'added';
        },
        endWork: (id, end, note) => {
          const session = get().work.find((item) => item.id === id);
          if (!session) return 'invalid';
          const parsed = workSessionSchema.safeParse({ ...session, end, note });
          if (!parsed.success) return end < session.start ? 'endBeforeStart' : 'invalid';
          set((state) => ({ work: state.work.map((item) => (item.id === id ? parsed.data : item)) }));
          return 'added';
        },
        addWork: (session) => {
          if (get().work.length >= WORK_SESSIONS_MAX) return 'full';
          if (session.end === null) return 'invalid';
          const parsed = workSessionSchema.safeParse({ ...session, id: crypto.randomUUID() });
          if (!parsed.success) return session.end < session.start ? 'endBeforeStart' : 'invalid';
          set((state) => ({ work: [...state.work, parsed.data] }));
          return 'added';
        },
        deleteWork: (id) => set((state) => ({ work: state.work.filter((session) => session.id !== id) })),
        clearAll: () => set({ ...initialTrapCheckLogState, traps: [], work: [] }),
      };
    },
    {
      name: TRAP_CHECK_LOG_STORAGE_KEY,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ intervalHours: state.lastValidIntervalHours, traps: state.traps, work: state.work }),
      merge: (saved, current) => {
        // A first visit has nothing stored, and persist still calls merge.
        if (saved === undefined) return current;
        const parsed = savedSchema.safeParse(saved);
        if (!parsed.success) {
          // A log that vanished without a word would look like no round had ever been made.
          reportDiscardedSave(TRAP_CHECK_LOG_STORAGE_KEY);
          return current;
        }
        return {
          ...current,
          intervalHours: parsed.data.intervalHours,
          lastValidIntervalHours: parsed.data.intervalHours,
          traps: parsed.data.traps,
          work: parsed.data.work ?? [],
        };
      },
    },
  ),
);
