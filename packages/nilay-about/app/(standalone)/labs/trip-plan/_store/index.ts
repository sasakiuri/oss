import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { TRIP_NOTE_MAX, TRIP_TEXT_MAX, type TripPlan } from '@/lib/trip-plan';

export const storageKey = 'nilay-labs-trip-plan-v1';

const text = z.string().max(TRIP_TEXT_MAX);
const note = z.string().max(TRIP_NOTE_MAX);
export const tripPlanSchema = z.object({
  hunter: text,
  companions: text,
  area: text,
  route: note,
  departAt: z.string().max(16),
  returnBy: z.string().max(16),
  vehicle: text,
  radio: text,
  gear: note,
  contactName: text,
  contactPhone: text,
  ifLate: note,
  notes: note,
});

/** Names and a phone number are personal, so nothing is kept unless the reader asks for it. */
const savedSchema = z.object({ saveOnDevice: z.boolean(), plan: tripPlanSchema.nullable() });
type SavedState = z.infer<typeof savedSchema>;

interface TripPlanStore extends TripPlan {
  saveOnDevice: boolean;
  edit: (changes: Partial<TripPlan>) => void;
  setSaveOnDevice: (save: boolean) => void;
  reset: () => void;
}

export const emptyPlan: TripPlan = {
  hunter: '',
  companions: '',
  area: '',
  route: '',
  departAt: '',
  returnBy: '',
  vehicle: '',
  radio: '',
  gear: '',
  contactName: '',
  contactPhone: '',
  ifLate: '',
  notes: '',
};

const pickPlan = (state: TripPlan): TripPlan =>
  Object.fromEntries(Object.keys(emptyPlan).map((key) => [key, state[key as keyof TripPlan]])) as unknown as TripPlan;

export const useTripPlanStore = create<TripPlanStore>()(
  persist(
    (set) => ({
      ...emptyPlan,
      saveOnDevice: false,
      edit: (changes) => set(changes),
      setSaveOnDevice: (saveOnDevice) => set({ saveOnDevice }),
      reset: () => set({ ...emptyPlan }),
    }),
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      // Turning saving off writes an empty record, which deletes what was kept.
      partialize: (state) => ({ saveOnDevice: state.saveOnDevice, plan: state.saveOnDevice ? pickPlan(state) : null }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) return { ...current, saveOnDevice: parsed.data.saveOnDevice, ...(parsed.data.plan ?? {}) };
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
