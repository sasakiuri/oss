import { create } from 'zustand';

// Storage can be disabled by the browser or become full during a session.
export const useStorageStatus = create<{ available: boolean; discarded: readonly string[] }>(() => ({
  available: true,
  discarded: [],
}));

// Saved data can also stop matching its schema, in which case a tool starts over.
// The key is recorded so a tool only speaks for its own saved data, never another tool's.
export function reportDiscardedSave(name: string): void {
  useStorageStatus.setState((state) =>
    state.discarded.includes(name) ? state : { discarded: [...state.discarded, name] },
  );
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

export const browserStorage = {
  getItem: (name: string) => {
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
  },
  setItem: (name: string, value: unknown) => {
    // A value that cannot be serialised is a fault in the caller, not in the browser's storage,
    // so it is left to throw instead of being reported as storage that cannot be written.
    const raw = JSON.stringify(value);
    try {
      window.localStorage.setItem(name, raw);
      // A write that lands means the earlier refusal has passed, such as a quota that has been freed.
      if (!useStorageStatus.getState().available) useStorageStatus.setState({ available: true });
    } catch {
      useStorageStatus.setState({ available: false });
    }
  },
  removeItem: (name: string) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      useStorageStatus.setState({ available: false });
    }
  },
};
