import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import type { Point } from '@/lib/photo-measure';

export const storageKey = 'nilay-labs-photo-measure-v1';

export type Subject = 'boar' | 'deer' | 'other';
export type Sex = 'male' | 'female';
/** What a tap on the photo does. */
export type PointerMode = 'referenceA' | 'referenceB' | 'body' | 'antler' | 'outline';

export interface ImageSize {
  width: number;
  height: number;
}

/** A tap that steers the outline: on the animal, or on something to leave out. */
export interface OutlinePrompt extends Point {
  foreground: boolean;
}

const savedSchema = z.object({
  referenceCm: z.number().finite().positive(),
  subject: z.enum(['boar', 'deer', 'other']),
  sex: z.enum(['male', 'female']),
});
type SavedState = z.infer<typeof savedSchema>;

/** A 30 cm ruler is the reference most people have at hand. */
export const defaultReferenceCm = 30;

interface PhotoMeasureStore extends SavedState {
  imageSize: ImageSize | null;
  referenceA: Point | null;
  referenceB: Point | null;
  body: Point[];
  /** Each antler, or each part of one, as its own traced path. The last one is the one being traced. */
  antlers: Point[][];
  prompts: OutlinePrompt[];
  mode: PointerMode;
  lastValidReferenceCm: number;
  setImage: (size: ImageSize | null) => void;
  setReferenceCm: (value: number) => void;
  setSubject: (subject: Subject) => void;
  setSex: (sex: Sex) => void;
  setMode: (mode: PointerMode) => void;
  pick: (point: Point, foreground: boolean) => void;
  setBody: (points: Point[]) => void;
  undo: () => void;
  clearMode: () => void;
  startAntler: () => void;
  reset: () => void;
}

const photoState = {
  referenceA: null,
  referenceB: null,
  body: [],
  antlers: [[]],
  prompts: [],
  mode: 'referenceA' as PointerMode,
};

const initialSettings: SavedState = { referenceCm: defaultReferenceCm, subject: 'boar', sex: 'male' };

export const usePhotoMeasureStore = create<PhotoMeasureStore>()(
  persist(
    (set, get) => ({
      ...initialSettings,
      ...photoState,
      imageSize: null,
      lastValidReferenceCm: defaultReferenceCm,
      // Every point belongs to the photo it was placed on, so a new photo starts them over.
      setImage: (imageSize) => set({ imageSize, ...photoState }),
      setReferenceCm: (referenceCm) =>
        set({
          referenceCm,
          ...(Number.isFinite(referenceCm) && referenceCm > 0 ? { lastValidReferenceCm: referenceCm } : {}),
        }),
      setSubject: (subject) => set({ subject }),
      setSex: (sex) => set({ sex }),
      setMode: (mode) => set({ mode }),
      pick: (point, foreground) => {
        const { mode, antlers, body, prompts } = get();
        if (mode === 'referenceA') set({ referenceA: point });
        else if (mode === 'referenceB') set({ referenceB: point });
        else if (mode === 'body') set({ body: [...body, point] });
        else if (mode === 'antler') set({ antlers: [...antlers.slice(0, -1), [...(antlers.at(-1) ?? []), point]] });
        else set({ prompts: [...prompts, { ...point, foreground }] });
      },
      setBody: (body) => set({ body, mode: 'body' }),
      undo: () => {
        const { mode, antlers, body, prompts } = get();
        if (mode === 'body') set({ body: body.slice(0, -1) });
        else if (mode === 'antler') {
          const current = antlers.at(-1) ?? [];
          // An empty path that was just started is taken away first, back to the one before it.
          if (current.length === 0 && antlers.length > 1) set({ antlers: antlers.slice(0, -1) });
          else set({ antlers: [...antlers.slice(0, -1), current.slice(0, -1)] });
        } else if (mode === 'outline') set({ prompts: prompts.slice(0, -1) });
      },
      clearMode: () => {
        const { mode } = get();
        if (mode === 'body') set({ body: [] });
        else if (mode === 'antler') set({ antlers: [[]] });
        else if (mode === 'outline') set({ prompts: [] });
        else set({ referenceA: null, referenceB: null, mode: 'referenceA' });
      },
      startAntler: () => {
        const { antlers } = get();
        if ((antlers.at(-1) ?? []).length > 0) set({ antlers: [...antlers, []], mode: 'antler' });
        else set({ mode: 'antler' });
      },
      reset: () =>
        set({ ...initialSettings, ...photoState, imageSize: null, lastValidReferenceCm: defaultReferenceCm }),
    }),
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      // The photo and the points on it stay in the page; only the reference and the animal are kept.
      partialize: (state) => ({ referenceCm: state.lastValidReferenceCm, subject: state.subject, sex: state.sex }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) return { ...current, ...parsed.data, lastValidReferenceCm: parsed.data.referenceCm };
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
