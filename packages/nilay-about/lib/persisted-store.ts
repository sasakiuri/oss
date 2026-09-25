import { collectDiscardedSaves, readStoredText } from '@/lib/browser-storage';

/**
 * The part of a Labs store made with zustand's `persist` that the backup needs: its key, and the merge
 * through which it reads what was saved.
 */
export interface PersistedStore {
  getInitialState: () => unknown;
  persist: {
    getOptions: () => {
      name?: string;
      version?: number;
      // `never`, so a store of any state fits; the check below passes the store's own initial state.
      merge?: (persistedState: unknown, currentState: never) => unknown;
    };
  };
}

export function persistedKey(store: PersistedStore): string {
  const name = store.persist.getOptions().name;
  if (!name) throw new Error('A persisted store needs a name');
  return name;
}

/** What `persist` writes under the key: the saved state and the store's version. */
export interface PersistedEnvelope {
  state: unknown;
  version: number;
}

export function isPersistedEnvelope(value: unknown): value is PersistedEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'state' in value &&
    'version' in value &&
    typeof value.version === 'number'
  );
}

/**
 * Whether the store would take this saved value, judged by the store itself.
 *
 * Every Labs store reads its saved state through its own `merge`, which checks it against the tool's
 * schema and reports anything it cannot use with `reportDiscardedSave`. The value is put through that
 * same merge here, against the store's initial state, and the report it makes is the answer; the report
 * is collected rather than shown. Nothing is written and no state is touched: neither the store's nor
 * the page's notices. A store without its own merge cannot check anything, so its values are refused.
 */
export function acceptsPersisted(store: PersistedStore, value: unknown): boolean {
  const options = store.persist.getOptions();
  const name = persistedKey(store);
  if (!options.merge || !isPersistedEnvelope(value)) return false;
  // Another version would go through `migrate`, which no Labs store declares.
  if (value.version !== (options.version ?? 0)) return false;
  const merge = options.merge;
  try {
    const reports = collectDiscardedSaves(() => merge(value.state, store.getInitialState() as never));
    return !reports.has(name);
  } catch {
    return false;
  }
}

/**
 * Whether what the store holds now is what is saved: the value under its key is the store's state as
 * its own `partialize` keeps it. `browserStorage` does not throw when a write fails (a full quota, or a
 * page left read-only while a cut-short restore waits), so a change that has to be on disk before
 * something else is done, such as deleting a record before its photos, is checked with this.
 */
export function savedAsShown(store: {
  getState: () => unknown;
  persist: { getOptions: () => { name?: string; partialize?: (state: never) => unknown } };
}): boolean {
  const options = store.persist.getOptions();
  if (!options.name) return false;
  const raw = readStoredText(options.name);
  if (raw === null || raw === 'unreadable') return false;
  try {
    const saved = JSON.parse(raw) as { state?: unknown };
    const state = options.partialize ? options.partialize(store.getState() as never) : store.getState();
    return JSON.stringify(saved.state) === JSON.stringify(state);
  } catch {
    return false;
  }
}
