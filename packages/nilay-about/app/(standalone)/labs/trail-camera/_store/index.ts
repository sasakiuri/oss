import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';

export const storageKey = 'nilay-labs-trail-camera-v1';

/** The settings only; the photos and their counts are never saved. */
export const trailCameraSettingsSchema = z.object({
  zoneOffsetMinutes: z.number().int().min(-720).max(840),
  clockCorrectionMinutes: z.number().finite().min(-1440).max(1440),
  latitude: z.number().finite().min(-90).max(90).nullable(),
  longitude: z.number().finite().min(-180).max(180).nullable(),
});
export type TrailCameraSettings = z.infer<typeof trailCameraSettingsSchema>;

const savedSchema = z.object({ settings: trailCameraSettingsSchema });
type SavedState = z.infer<typeof savedSchema>;

interface TrailCameraStore extends TrailCameraSettings {
  lastValidSettings: TrailCameraSettings;
  edit: (changes: Partial<TrailCameraSettings>) => void;
  reset: () => void;
}

/** Japan Standard Time, no correction, and no place until one is given. */
export const initialSettings: TrailCameraSettings = {
  zoneOffsetMinutes: 540,
  clockCorrectionMinutes: 0,
  latitude: null,
  longitude: null,
};

export const useTrailCameraStore = create<TrailCameraStore>()(
  persist(
    (set, get) => ({
      ...initialSettings,
      lastValidSettings: initialSettings,
      edit: (changes) => {
        const { zoneOffsetMinutes, clockCorrectionMinutes, latitude, longitude } = { ...get(), ...changes };
        const parsed = trailCameraSettingsSchema.safeParse({
          zoneOffsetMinutes,
          clockCorrectionMinutes,
          latitude,
          longitude,
        });
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      },
      reset: () => set({ ...initialSettings, lastValidSettings: initialSettings }),
    }),
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ settings: state.lastValidSettings }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) return { ...current, ...parsed.data.settings, lastValidSettings: parsed.data.settings };
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
