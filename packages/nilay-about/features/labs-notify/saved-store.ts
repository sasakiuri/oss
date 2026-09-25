import type { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';

/**
 * A tool's few saved values (what it registered on the server, and the credentials for it), kept
 * in this browser through the shared storage. Saved data that no longer matches its schema is
 * dropped and reported, like every other Labs tool. `prune` removes what has expired on the server
 * (credentials, plan notes) each time the page reads the saved values, so they do not linger here.
 * The pruned values are written back on reading, unless `writeBackOnRead` is false: a tool whose
 * tabs must not undo each other's saves writes them back itself, under its own lock.
 */
export function createSavedStore<T>(
  key: string,
  schema: z.ZodType<T>,
  initial: T,
  prune: (value: T, nowMs: number) => T = (value) => value,
  options: { writeBackOnRead?: boolean } = {},
) {
  return create<{ value: T; set: (value: T) => void }>()(
    persist((set) => ({ value: initial, set: (value) => set({ value }) }), {
      name: key,
      storage: browserStorage as PersistStorage<{ value: T }>,
      skipHydration: true,
      partialize: (state) => ({ value: state.value }),
      merge: (saved, current) => {
        if (saved === undefined) return current;
        const parsed = schema.safeParse((saved as { value?: unknown } | null)?.value);
        if (!parsed.success) {
          reportDiscardedSave(key);
          return current;
        }
        return { ...current, value: prune(parsed.data, Date.now()) };
      },
      // Writes the pruned value back, so expired credentials leave the storage itself.
      onRehydrateStorage: () => (state) => {
        if (options.writeBackOnRead !== false) state?.set(state.value);
      },
    }),
  );
}

/** True when an ISO time has passed. */
export const hasPassed = (iso: string, nowMs: number) => Date.parse(iso) <= nowMs;
