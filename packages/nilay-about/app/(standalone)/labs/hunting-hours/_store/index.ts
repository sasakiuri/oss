import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  coordinatesSchema,
  savedLocationSchema,
  type Coordinates,
  type SavedLocation,
} from '@/lib/schemas/hunting-hours';

import { presetLocationMap } from '../locations';

export const STORAGE_KEY = 'nilay-labs-hunting-hours-v1';

/** Why a save was refused, so the form can name the actual problem rather than guess. */
export type SaveLocationResult = 'saved' | 'empty-name' | 'invalid-location' | 'duplicate-name';
export type { Coordinates, SavedLocation };

const savedSchema = z.object({
  presetId: z.string().nullable(),
  location: coordinatesSchema,
  locations: z.array(savedLocationSchema),
});
type SavedState = z.infer<typeof savedSchema>;

interface HuntingHoursStore extends Coordinates {
  presetId: string | null;
  lastValidLocation: Coordinates;
  locations: SavedLocation[];
  deletedLocation: { location: SavedLocation; index: number } | null;
  selectPreset: (presetId: string) => void;
  clearPreset: () => void;
  setLatitude: (latitude: number) => void;
  setLongitude: (longitude: number) => void;
  setCoordinates: (coordinates: Coordinates) => void;
  saveLocation: (name: string) => SaveLocationResult;
  loadLocation: (id: string) => void;
  deleteLocation: (id: string) => void;
  undoDelete: () => void;
  /** Puts the opening position back, and keeps the places that were saved by name. */
  reset: () => void;
}

/** Tokyo, the NAOJ reference point, so a first visit already shows a usable day. */
export const initialLocation: Coordinates = { latitude: 35.6581, longitude: 139.7414 };
export const initialPresetId = '13';

export const useHuntingHoursStore = create<HuntingHoursStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<Coordinates> & { presetId?: string | null }) => {
        const parsed = coordinatesSchema.safeParse({ ...get(), ...changes });
        // Keep the last complete position while a coordinate field is being edited.
        set({ ...changes, ...(parsed.success ? { lastValidLocation: parsed.data } : {}) });
      };
      return {
        ...initialLocation,
        presetId: initialPresetId,
        lastValidLocation: initialLocation,
        locations: [],
        deletedLocation: null,
        selectPreset: (presetId) => {
          const preset = presetLocationMap.get(presetId);
          if (preset) edit({ presetId, latitude: preset.latitude, longitude: preset.longitude });
        },
        clearPreset: () => set({ presetId: null }),
        // Editing a coordinate leaves the preset, because the point is no longer that city.
        setLatitude: (latitude) => edit({ latitude, presetId: null }),
        setLongitude: (longitude) => edit({ longitude, presetId: null }),
        setCoordinates: (coordinates) => {
          const parsed = coordinatesSchema.safeParse(coordinates);
          if (parsed.success) edit({ ...parsed.data, presetId: null });
        },
        saveLocation: (name) => {
          const trimmed = name.trim();
          if (!trimmed) return 'empty-name';
          const location = coordinatesSchema.safeParse(get());
          if (!location.success) return 'invalid-location';
          if (get().locations.some((item) => item.name === trimmed)) return 'duplicate-name';
          set((state) => ({
            locations: [
              ...state.locations,
              { id: crypto.randomUUID(), name: trimmed, presetId: state.presetId, ...location.data },
            ],
          }));
          return 'saved';
        },
        loadLocation: (id) => {
          const location = get().locations.find((item) => item.id === id);
          if (location) {
            edit({ latitude: location.latitude, longitude: location.longitude, presetId: location.presetId });
          }
        },
        deleteLocation: (id) => {
          const index = get().locations.findIndex((item) => item.id === id);
          const location = get().locations[index];
          if (!location) return;
          set((state) => ({
            deletedLocation: { location, index },
            locations: state.locations.filter((item) => item.id !== id),
          }));
        },
        reset: () => set({ ...initialLocation, presetId: initialPresetId, lastValidLocation: initialLocation }),
        undoDelete: () => {
          const deleted = get().deletedLocation;
          if (!deleted) return;
          const locations = [...get().locations];
          // A name taken while the place was gone must not collide on the way back.
          let name = deleted.location.name;
          let suffix = 2;
          while (locations.some((item) => item.name === name)) name = `${deleted.location.name} (${suffix++})`;
          locations.splice(deleted.index, 0, { ...deleted.location, name });
          set({ locations, deletedLocation: null });
        },
      };
    },
    {
      name: STORAGE_KEY,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({
        presetId: state.presetId,
        location: state.lastValidLocation,
        locations: state.locations,
      }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        // Starting over is visible to the user, so say so rather than lose the settings quietly.
        if (!parsed.success) {
          if (saved !== undefined) reportDiscardedSave(STORAGE_KEY);
          return current;
        }
        // A preset that no longer exists becomes plain coordinates rather than an empty select.
        const knownPreset = (id: string | null) => (id !== null && presetLocationMap.has(id) ? id : null);
        return {
          ...current,
          ...parsed.data.location,
          lastValidLocation: parsed.data.location,
          presetId: knownPreset(parsed.data.presetId),
          locations: parsed.data.locations.map((item) => ({ ...item, presetId: knownPreset(item.presetId) })),
        };
      },
    },
  ),
);
