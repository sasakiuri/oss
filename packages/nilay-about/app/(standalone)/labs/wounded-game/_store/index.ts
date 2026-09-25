import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, readStoredText, reportDiscardedSave } from '@/lib/browser-storage';
import {
  ENTRY_LIMIT,
  woundedGameStateSchema,
  type CueId,
  type Impression,
  type TrailEntry,
  type WoundedGameState,
} from '@/lib/schemas/wounded-game';

export const storageKey = 'nilay-labs-wounded-game-v1';

const savedSchema = z.object({ state: woundedGameStateSchema.nullable() });
type SavedState = z.infer<typeof savedSchema>;

interface WoundedGameStore extends WoundedGameState {
  setShotAt: (shotAt: string) => void;
  setImpression: (impression: Impression) => void;
  /**
   * Sets one sign to the state the reader left its box in. It is not a toggle: flipping the saved
   * value would turn a tick in a tab that has not caught up into an untick in storage.
   */
  setCue: (cue: CueId, checked: boolean) => void;
  /** Returns false when the log is full, so the form can say so instead of dropping the entry. */
  addEntry: (entry: Omit<TrailEntry, 'id'>) => boolean;
  removeEntry: (id: string) => void;
}

export const initialWoundedGameState: WoundedGameState = {
  shotAt: '',
  impression: 'unsure',
  cues: [],
  entries: [],
};

/**
 * The state as last saved, which another tab may have written since this one read it. Each change is
 * applied to this rather than to what this tab holds, so a tab that has not caught up yet never writes
 * its older log over entries added elsewhere. `null` when there is nothing readable to build on.
 */
function latestSaved(): WoundedGameState | null {
  const raw = readStoredText(storageKey);
  if (raw === null || raw === 'unreadable') return null;
  try {
    const envelope: unknown = JSON.parse(raw);
    const parsed = savedSchema.safeParse(
      typeof envelope === 'object' && envelope !== null && 'state' in envelope ? envelope.state : undefined,
    );
    return parsed.success ? parsed.data.state : null;
  } catch {
    return null;
  }
}

const pickState = ({ shotAt, impression, cues, entries }: WoundedGameState): WoundedGameState => ({
  shotAt,
  impression,
  cues,
  entries,
});

export const useWoundedGameStore = create<WoundedGameStore>()(
  persist(
    (set, get) => {
      const edit = (change: (state: WoundedGameState) => Partial<WoundedGameState>) => {
        const base = latestSaved() ?? pickState(get());
        set({ ...base, ...change(base) });
      };
      return {
        ...initialWoundedGameState,
        setShotAt: (shotAt) => edit(() => ({ shotAt })),
        setImpression: (impression) => edit(() => ({ impression })),
        setCue: (cue, checked) =>
          edit((state) => ({
            cues: checked
              ? state.cues.includes(cue)
                ? state.cues
                : [...state.cues, cue]
              : state.cues.filter((value) => value !== cue),
          })),
        addEntry: (entry) => {
          const base = latestSaved() ?? pickState(get());
          if (base.entries.length >= ENTRY_LIMIT) {
            set(base);
            return false;
          }
          set({ ...base, entries: [...base.entries, { ...entry, id: crypto.randomUUID() }] });
          return true;
        },
        removeEntry: (id) => edit((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) })),
      };
    },
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: ({ shotAt, impression, cues, entries }) => ({ state: { shotAt, impression, cues, entries } }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) return { ...current, ...parsed.data.state };
        // A first visit stores nothing, but an unreadable trail log is a loss the tool has to own up to.
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
