import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import type { CoordinateInput } from '@/lib/coordinates';
import { coordinateInputSchema } from '@/lib/schemas/coordinate-convert';

export const storageKey = 'nilay-labs-coordinate-convert-v1';

const savedSchema = z.object({ input: coordinateInputSchema });
type SavedState = z.infer<typeof savedSchema>;

interface CoordinateConvertStore extends CoordinateInput {
  edit: (changes: Partial<CoordinateInput>) => void;
  reset: () => void;
}

/** Tokyo, the NAOJ reference point the hunting hours tool also opens on, in system IX. */
export const initialInput: CoordinateInput = {
  format: 'latlon',
  latitude: '35.6581',
  longitude: '139.7414',
  utmZone: '54',
  utmHemisphere: 'N',
  utmEasting: '',
  utmNorthing: '',
  mgrs: '',
  planeSystem: 9,
  planeX: '',
  planeY: '',
  mesh: '',
};

export const useCoordinateConvertStore = create<CoordinateConvertStore>()(
  persist(
    (set) => ({
      ...initialInput,
      edit: (changes) => set(changes),
      reset: () => set(initialInput),
    }),
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: ({ edit: _edit, reset: _reset, ...input }) => ({ input }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) return { ...current, ...parsed.data.input };
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
