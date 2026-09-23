import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  CHECKS_PER_TRAP_MAX,
  TRAP_MAX_COUNT,
  intervalHoursSchema,
  trapCheckSchema,
  trapSchema,
  type Trap,
  type TrapCheck,
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
});
type SavedState = z.infer<typeof savedSchema>;

export type TrapFields = Pick<Trap, 'name' | 'kind' | 'installedAt' | 'location' | 'latitude' | 'longitude'>;
export type AddResult = 'added' | 'full';
export type AddCheckResult = AddResult | CheckTimeError;

interface TrapCheckLogStore {
  /** What the field holds, which can be half typed or out of range. */
  intervalHours: number;
  /** The last value that passed, which the warnings and the saved data use. */
  lastValidIntervalHours: number;
  traps: Trap[];
  setIntervalHours: (hours: number) => void;
  resetInterval: () => void;
  addTrap: (fields: TrapFields) => AddResult;
  deleteTrap: (id: string) => void;
  setRemoved: (id: string, removedAt: string | null) => void;
  addCheck: (trapId: string, check: Omit<TrapCheck, 'id'>) => AddCheckResult;
  deleteCheck: (trapId: string, checkId: string) => void;
  clearAll: () => void;
}

export const initialTrapCheckLogState = {
  intervalHours: DEFAULT_INTERVAL_HOURS,
  lastValidIntervalHours: DEFAULT_INTERVAL_HOURS,
  traps: [] as Trap[],
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
        addCheck: (trapId, check) => {
          const trap = get().traps.find((item) => item.id === trapId);
          if (!trap) return 'full';
          const timeError = validateCheckTime(trap, check.at);
          if (timeError) return timeError;
          if (trap.checks.length >= CHECKS_PER_TRAP_MAX) return 'full';
          const entry = trapCheckSchema.parse({ ...check, id: crypto.randomUUID() });
          editTrap(trapId, (current) => ({ ...current, checks: [...current.checks, entry] }));
          return 'added';
        },
        deleteCheck: (trapId, checkId) =>
          editTrap(trapId, (trap) => ({ ...trap, checks: trap.checks.filter((check) => check.id !== checkId) })),
        clearAll: () => set({ ...initialTrapCheckLogState, traps: [] }),
      };
    },
    {
      name: TRAP_CHECK_LOG_STORAGE_KEY,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ intervalHours: state.lastValidIntervalHours, traps: state.traps }),
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
        };
      },
    },
  ),
);
