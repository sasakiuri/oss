import { create } from 'zustand';

import { labsSession, labsSessionReady, labsWritable, toolSessionSignal, trackWrite } from '@/lib/labs-session';

// Storage can be disabled by the browser or become full during a session.
export const useStorageStatus = create<{ available: boolean; discarded: readonly string[] }>(() => ({
  available: true,
  discarded: [],
}));

/** The reports being collected by `collectDiscardedSaves`, instead of being shown. */
let collecting: Set<string> | null = null;

// Saved data can also stop matching its schema, in which case a tool starts over.
// The key is recorded so a tool only speaks for its own saved data, never another tool's.
export function reportDiscardedSave(name: string): void {
  if (collecting) {
    collecting.add(name);
    return;
  }
  useStorageStatus.setState((state) =>
    state.discarded.includes(name) ? state : { discarded: [...state.discarded, name] },
  );
}

/**
 * Runs `check`, which reads saved data the way a store does, and returns the keys it reported as
 * discarded. The reports are only returned: no notice is raised and the page's own notices are not
 * touched, so a check of a file (the backup) never speaks for the data the tools have open.
 */
export function collectDiscardedSaves(check: () => void): ReadonlySet<string> {
  const outer = collecting;
  const reports = new Set<string>();
  collecting = reports;
  try {
    check();
  } finally {
    collecting = outer;
  }
  return reports;
}

/** Reading a key again clears it: the tool is no longer opening with the defaults, so the notice would lie. */
function clearDiscardedSave(name: string): void {
  useStorageStatus.setState((state) =>
    state.discarded.includes(name) ? { discarded: state.discarded.filter((key) => key !== name) } : state,
  );
}

export function useDiscardedSave(name: string): boolean {
  return useStorageStatus((state) => state.discarded.includes(name));
}

/**
 * The site's own setting (`store/language-store.ts`), read on every page and never part of a backup.
 * Everything else read through here is data of the Labs tools.
 */
const SITE_KEYS: ReadonlySet<string> = new Set(['nilay-language-v1']);

/**
 * A value exactly as it is stored, for code that has to check what a write left behind, or read another
 * tool's saved value as it stands: `null` when there is none, `unreadable` when the browser refuses.
 * Every Labs read and write of localStorage goes through this module (an ESLint rule sees to it), so a
 * restore can keep the tools apart and the backup reads what the tools save.
 */
export function readStoredText(name: string): string | null | 'unreadable' {
  try {
    return window.localStorage.getItem(name);
  } catch {
    return 'unreadable';
  }
}

function read(name: string) {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(name);
  } catch {
    useStorageStatus.setState({ available: false });
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A value that is not JSON cannot be merged, so report it rather than starting over in silence.
    reportDiscardedSave(name);
    return null;
  }
  // Valid JSON that is not a persisted envelope is dropped by persist just as quietly, so check it here.
  // A version mismatch is not visible from here: persist compares it after this call and falls back to
  // the defaults on its own. A store that starts declaring `version` has to report from `migrate`,
  // or the reader is sent back to the defaults without a word.
  if (typeof parsed !== 'object' || parsed === null || !('state' in parsed)) {
    reportDiscardedSave(name);
    return null;
  }
  clearDiscardedSave(name);
  return parsed;
}

export const browserStorage = {
  /**
   * A Labs tool's saved data is read only once the page holds its place among the open Labs pages
   * (`labs-session.ts`), so a page opened while a backup is restored waits for the restore. Once that
   * is held the read is immediate, as it is for the site's own setting.
   */
  getItem: (name: string) =>
    SITE_KEYS.has(name) || labsSessionReady() ? read(name) : labsSession().then(() => read(name)),
  setItem: (name: string, value: unknown) => {
    // A value that cannot be serialised is a fault in the caller, not in the browser's storage,
    // so it is left to throw instead of being reported as storage that cannot be written.
    const raw = JSON.stringify(value);
    // A tool page is read-only while a restore cut short waits for the data page (labs-session.ts).
    if (!SITE_KEYS.has(name) && !labsWritable()) return;
    try {
      window.localStorage.setItem(name, raw);
      // A write that lands means the earlier refusal has passed, such as a quota that has been freed.
      if (!useStorageStatus.getState().available) useStorageStatus.setState({ available: true });
    } catch {
      useStorageStatus.setState({ available: false });
    }
  },
  removeItem: (name: string) => {
    if (!SITE_KEYS.has(name) && !labsWritable()) return;
    try {
      window.localStorage.removeItem(name);
    } catch {
      useStorageStatus.setState({ available: false });
    }
  },
};

/** Thrown where the browser has no Web Locks, so tabs cannot be kept from undoing each other's saves. */
export class SaveLockUnavailableError extends Error {
  constructor() {
    super('Web Locks are not available');
    this.name = 'SaveLockUnavailableError';
  }
}

export const saveLockSupported = () => typeof navigator !== 'undefined' && navigator.locks !== undefined;

/**
 * Runs `work` holding the saved value `name` alone among this browser's tabs, for a tool whose tabs
 * change it read-modify-write (the return alert keeps a plan's keys in it). The exclusive Web Lock
 * `nilay-labs-save:<name>` is taken once the page holds its place among the open Labs pages, so a
 * restore is kept out as for every other read and write; `work` reads the value again under it and
 * saves through `browserStorage` as usual. Without Web Locks it refuses rather than run unguarded.
 *
 * The wait for the lock is given up (an `AbortError`) when the tab moves to the data page, and none is
 * begun there. Work already holding the lock is tracked like a write, so the data page waits for it
 * before it exports or restores.
 */
export async function withSavedValue<T>(name: string, work: () => Promise<T>): Promise<T> {
  if (!saveLockSupported()) throw new SaveLockUnavailableError();
  await labsSession();
  return trackWrite(
    navigator.locks.request(`nilay-labs-save:${name}`, { mode: 'exclusive', signal: toolSessionSignal() }, work),
  );
}

/**
 * Calls `changed` when another tab saves `name` (or clears the storage), so a page can take it in.
 * Returns the function that stops listening.
 */
export function onSavedElsewhere(name: string, changed: () => void): () => void {
  const listener = (event: StorageEvent) => {
    if (event.key === name || event.key === null) changed();
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}
