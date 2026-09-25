import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, readStoredText, reportDiscardedSave } from '@/lib/browser-storage';
import {
  emptyTrapTagDraft,
  trapTagDraftSchema,
  trapTagPurposeSchema,
  type TrapTagDraft,
  type TrapTagFieldKey,
  type TrapTagPurpose,
} from '@/lib/schemas/trap-tag';
import { TRAP_TAG_FIELDS } from '@/lib/schemas/trap-tag';
import { normalizeCharSizeMm, normalizeCopies, type TrapTagCharSizeMm, type TrapTagCopies } from '@/lib/trap-tag';

// Only the offered options are accepted, so a saved session holding anything else
// is reported rather than rounded down to a default without a word. These must
// list exactly the options of lib/trap-tag.ts: SavedState types the persisted
// storage, so adding a size or a count there and not here fails to compile.
const savedCharSizeSchema = z.union([z.literal(10), z.literal(12), z.literal(15)]);
const savedCopiesSchema = z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6)]);

const savedSchema = z.object({
  purpose: trapTagPurposeSchema,
  charSizeMm: savedCharSizeSchema,
  copies: savedCopiesSchema,
  remember: z.boolean(),
  fields: trapTagDraftSchema.optional(),
  // Added on 2026-09-24. A session saved before then printed every item on one side, which is what
  // their absence means.
  blanks: z.array(z.enum(TRAP_TAG_FIELDS.combined)).optional(),
  twoSided: z.boolean().optional(),
});
type SavedState = z.infer<typeof savedSchema>;

interface TrapTagStore {
  purpose: TrapTagPurpose;
  charSizeMm: TrapTagCharSizeMm;
  copies: TrapTagCopies;
  remember: boolean;
  fields: TrapTagDraft;
  /** Items printed as empty boxes, to be written by hand. */
  blanks: TrapTagFieldKey[];
  /** Species on the back, for a permit or combined tag. */
  twoSided: boolean;
  setPurpose: (purpose: TrapTagPurpose) => void;
  setCharSizeMm: (charSizeMm: TrapTagCharSizeMm) => void;
  setCopies: (copies: TrapTagCopies) => void;
  setRemember: (remember: boolean) => void;
  setField: (field: TrapTagFieldKey, value: string) => void;
  toggleBlank: (field: TrapTagFieldKey) => void;
  setTwoSided: (twoSided: boolean) => void;
  clearSaved: () => boolean;
}

export const initialTrapTagState = {
  purpose: 'hunting' as TrapTagPurpose,
  charSizeMm: 10 as TrapTagCharSizeMm,
  copies: 1 as TrapTagCopies,
  remember: false,
  fields: emptyTrapTagDraft,
  blanks: [] as TrapTagFieldKey[],
  twoSided: false,
};

export const TRAP_TAG_STORAGE_KEY = 'nilay-labs-trap-tag-v1';

// Only the switch is read out of a session another tab wrote. Its input stays in
// that tab, so a form in use here is never replaced. Null means the session was
// deleted, and undefined means it could not be read.
const switchSchema = z.object({ state: z.object({ remember: z.boolean() }) });
export function readSavedRemember(value: string | null): boolean | undefined {
  if (value === null) return false;
  try {
    const parsed = switchSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data.state.remember : undefined;
  } catch {
    return undefined;
  }
}

export const useTrapTagStore = create<TrapTagStore>()(
  persist(
    (set) => ({
      ...initialTrapTagState,
      setPurpose: (purpose) => set({ purpose }),
      setCharSizeMm: (charSizeMm) => set({ charSizeMm: normalizeCharSizeMm(charSizeMm) }),
      setCopies: (copies) => set({ copies: normalizeCopies(copies) }),
      setRemember: (remember) => set({ remember }),
      setField: (field, value) => set((state) => ({ fields: { ...state.fields, [field]: value } })),
      toggleBlank: (field) =>
        set((state) => ({
          blanks: state.blanks.includes(field) ? state.blanks.filter((key) => key !== field) : [...state.blanks, field],
        })),
      setTwoSided: (twoSided) => set({ twoSided }),
      clearSaved: () => {
        set({ remember: false, fields: { ...emptyTrapTagDraft } });
        void useTrapTagStore.persist.clearStorage();
        // The write above can fail on its own, and the shared status flag follows the last write
        // rather than this removal, so the removal is checked here and answers for itself.
        return readStoredText(TRAP_TAG_STORAGE_KEY) === null;
      },
    }),
    {
      name: TRAP_TAG_STORAGE_KEY,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({
        purpose: state.purpose,
        charSizeMm: state.charSizeMm,
        copies: state.copies,
        remember: state.remember,
        blanks: state.blanks,
        twoSided: state.twoSided,
        // The tag carries a home address and a name, so the input is written to
        // this device only while the person asks for it.
        ...(state.remember ? { fields: state.fields } : {}),
      }),
      merge: (saved, current) => {
        // A first visit has nothing stored, and persist still calls merge.
        if (saved === undefined) return current;
        const parsed = savedSchema.safeParse(saved);
        if (!parsed.success) {
          // Starting over silently would look like the settings vanished.
          reportDiscardedSave(TRAP_TAG_STORAGE_KEY);
          return current;
        }
        return {
          ...current,
          purpose: parsed.data.purpose,
          charSizeMm: parsed.data.charSizeMm,
          copies: parsed.data.copies,
          remember: parsed.data.remember,
          fields: parsed.data.remember && parsed.data.fields ? parsed.data.fields : current.fields,
          blanks: parsed.data.blanks ?? [],
          twoSided: parsed.data.twoSided ?? false,
        };
      },
    },
  ),
);
