import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  addNamedSettings,
  namedSettingsListSchema,
  removeNamedSettings,
  renameNamedSettings,
  replaceNamedSettings,
  restoreNamedSettings,
  type NamedSettings,
  type RemovedNamedSettings,
  type SaveError,
} from '@/lib/named-settings';

export type NamedSettingsResult = 'saved' | SaveError | 'invalid-settings';

export interface NamedSettingsState<T> {
  entries: NamedSettings<T>[];
  /** The last entry deleted, until it is put back or another is deleted. Not saved. */
  removed: RemovedNamedSettings<T> | null;
  /** `settings` is checked against the tool's schema first: a half-typed form is not kept. */
  save: (name: string, settings: unknown) => NamedSettingsResult;
  rename: (id: string, name: string) => NamedSettingsResult;
  replace: (id: string, settings: unknown) => NamedSettingsResult;
  remove: (id: string) => void;
  undoRemove: () => NamedSettingsResult;
  /** The entry's settings, for the tool to apply; null when the id is not in the list. */
  find: (id: string) => T | null;
}

/**
 * A list of named settings, saved under its own key beside the tool's own saved state.
 *
 * Keeping it apart means a tool gains named settings without changing the shape of what it already
 * saves, and the list is validated with the same schema the tool checks its settings with. Like every
 * Labs store it is read only when the page asks (`persist.rehydrate()`), and a list that no longer
 * matches the schema is reported through the shared notice rather than dropped in silence.
 */
export function createNamedSettingsStore<S extends z.ZodTypeAny>(storageKey: string, settingsSchema: S) {
  type T = z.infer<S>;
  const savedSchema = z.object({ entries: namedSettingsListSchema(settingsSchema) });
  type SavedState = z.infer<typeof savedSchema>;

  return create<NamedSettingsState<T>>()(
    persist(
      (set, get) => {
        const apply = (result: { ok: true; list: NamedSettings<T>[] } | { ok: false; error: SaveError }) => {
          if (!result.ok) return result.error;
          set({ entries: result.list });
          return 'saved' as const;
        };
        return {
          entries: [],
          removed: null,
          save: (name, settings) => {
            const parsed = settingsSchema.safeParse(settings);
            if (!parsed.success) return 'invalid-settings';
            return apply(addNamedSettings<T>(get().entries, name, parsed.data, crypto.randomUUID()));
          },
          rename: (id, name) => apply(renameNamedSettings<T>(get().entries, id, name)),
          replace: (id, settings) => {
            const parsed = settingsSchema.safeParse(settings);
            if (!parsed.success) return 'invalid-settings';
            set({ entries: replaceNamedSettings<T>(get().entries, id, parsed.data) });
            return 'saved';
          },
          remove: (id) => {
            const result = removeNamedSettings<T>(get().entries, id);
            if (result) set({ entries: result.list, removed: result.removed });
          },
          undoRemove: () => {
            const { removed } = get();
            if (!removed) return 'saved';
            const result = restoreNamedSettings<T>(get().entries, removed);
            if (!result.ok) return result.error;
            set({ entries: result.list, removed: null });
            return 'saved';
          },
          find: (id) => get().entries.find((entry) => entry.id === id)?.settings ?? null,
        };
      },
      {
        name: storageKey,
        storage: browserStorage as PersistStorage<SavedState>,
        skipHydration: true,
        partialize: (state) => ({ entries: state.entries }),
        merge: (saved, current) => {
          // A first visit has nothing stored, and persist still calls merge.
          if (saved === undefined) return current;
          const parsed = savedSchema.safeParse(saved);
          if (!parsed.success) {
            reportDiscardedSave(storageKey);
            return current;
          }
          return { ...current, entries: parsed.data.entries as NamedSettings<T>[] };
        },
      },
    ),
  );
}
