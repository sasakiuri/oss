import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { paperSchema, copiesSchema, type TargetPaper, type TargetCopies } from '@/lib/schemas/home-target';

export type LengthUnit = 'mm' | 'cm' | 'm';
export interface Length {
  number: number;
  unit: LengthUnit;
}
export interface Discipline {
  name: string;
  key: string;
  distance: Length;
  heightOfTarget: Length;
  blackAreaSize: Length;
}

const lengthSchema = z.object({ number: z.number().finite().positive(), unit: z.enum(['mm', 'cm', 'm']) });
export const targetSettingsSchema = z.object({
  heightOfEye: lengthSchema,
  distanceToTarget: lengthSchema,
  discipline: z.object({
    name: z.string(),
    key: z.string(),
    distance: lengthSchema,
    heightOfTarget: lengthSchema.extend({ number: z.number().finite().nonnegative() }),
    blackAreaSize: lengthSchema,
  }),
  paper: paperSchema,
  copies: copiesSchema.default(1),
  showConditions: z.boolean().default(false),
});
export type TargetSettings = z.infer<typeof targetSettingsSchema>;
const profileSchema = z.object({ id: z.string(), name: z.string().trim().min(1), settings: targetSettingsSchema });
const savedSchema = z.object({
  settings: targetSettingsSchema.nullable(),
  profiles: z.array(profileSchema),
});
type SavedState = z.infer<typeof savedSchema>;
interface HomeTargetStore extends TargetSettings {
  lastValidSettings: TargetSettings;
  deletedProfile: { profile: z.infer<typeof profileSchema>; index: number } | null;
  profiles: z.infer<typeof profileSchema>[];
  setHeightOfEye: (height: Length) => void;
  setDistanceToTarget: (distance: Length) => void;
  setDiscipline: (discipline: Discipline) => void;
  setPaper: (paper: TargetPaper) => void;
  setCopies: (copies: TargetCopies) => void;
  setShowConditions: (showConditions: boolean) => void;
  applySettings: (settings: TargetSettings) => void;
  saveProfile: (name: string) => boolean;
  updateProfile: (id: string) => boolean;
  renameProfile: (id: string, name: string) => boolean;
  undoDelete: () => void;
  loadProfile: (id: string) => void;
  deleteProfile: (id: string) => void;
  reset: () => void;
}

export const TARGET_STORAGE_KEY = 'nilay-labs-target-v1';

export const initialTargetSettings: TargetSettings = {
  heightOfEye: { number: 170, unit: 'cm' },
  distanceToTarget: { number: 5, unit: 'm' },
  paper: 'a4',
  copies: 1,
  showConditions: false,
  // Start on the 50 m rifle by name, so a first visit shows which discipline the dimensions belong to.
  discipline: {
    name: '50m Rifle',
    key: 'FR50',
    distance: { number: 50, unit: 'm' },
    heightOfTarget: { number: 75, unit: 'cm' },
    blackAreaSize: { number: 11.24, unit: 'cm' },
  },
};

export const useHomeTargetStore = create<HomeTargetStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<TargetSettings>) => {
        const parsed = targetSettingsSchema.safeParse({ ...get(), ...changes });
        // Keep the last complete settings while a numeric field is being edited.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialTargetSettings,
        profiles: [],
        lastValidSettings: initialTargetSettings,
        deletedProfile: null,
        setHeightOfEye: (heightOfEye) => edit({ heightOfEye }),
        setDistanceToTarget: (distanceToTarget) => edit({ distanceToTarget }),
        setDiscipline: (discipline) => edit({ discipline }),
        setPaper: (paper) => edit({ paper }),
        setCopies: (copies) => edit({ copies }),
        setShowConditions: (showConditions) => edit({ showConditions }),
        applySettings: (settings) => {
          const parsed = targetSettingsSchema.safeParse(settings);
          if (parsed.success) edit(parsed.data);
        },
        saveProfile: (name) => {
          const settings = targetSettingsSchema.safeParse(get());
          const trimmed = name.trim();
          if (!settings.success || !trimmed || get().profiles.some((profile) => profile.name === trimmed)) return false;
          set((state) => ({
            profiles: [...state.profiles, { id: crypto.randomUUID(), name: trimmed, settings: settings.data }],
          }));
          return true;
        },
        updateProfile: (id) => {
          const settings = targetSettingsSchema.safeParse(get());
          if (!settings.success || !get().profiles.some((p) => p.id === id)) return false;
          set((state) => ({
            profiles: state.profiles.map((p) => (p.id === id ? { ...p, settings: settings.data } : p)),
          }));
          return true;
        },
        renameProfile: (id, name) => {
          const trimmed = name.trim();
          if (
            !trimmed ||
            !get().profiles.some((p) => p.id === id) ||
            get().profiles.some((p) => p.id !== id && p.name === trimmed)
          )
            return false;
          set((state) => ({ profiles: state.profiles.map((p) => (p.id === id ? { ...p, name: trimmed } : p)) }));
          return true;
        },
        loadProfile: (id) => {
          const profile = get().profiles.find((item) => item.id === id);
          if (profile) edit(profile.settings);
        },
        deleteProfile: (id) => {
          const index = get().profiles.findIndex((p) => p.id === id);
          const profile = get().profiles[index];
          if (!profile) return;
          set((state) => ({
            deletedProfile: { profile, index },
            profiles: state.profiles.filter((p) => p.id !== id),
          }));
        },
        undoDelete: () => {
          const deleted = get().deletedProfile;
          if (!deleted) return;
          const profiles = [...get().profiles];
          let name = deleted.profile.name;
          let suffix = 2;
          while (profiles.some((p) => p.name === name)) name = `${deleted.profile.name} (${suffix++})`;
          profiles.splice(deleted.index, 0, { ...deleted.profile, name });
          set({ profiles, deletedProfile: null });
        },
        // The site's language is not part of a target, so resetting the form leaves it alone.
        reset: () => edit(initialTargetSettings),
      };
    },
    {
      name: TARGET_STORAGE_KEY,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({
        settings: state.lastValidSettings,
        profiles: state.profiles,
      }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success)
          return {
            ...current,
            ...parsed.data.settings,
            lastValidSettings: parsed.data.settings ?? current.lastValidSettings,
            profiles: parsed.data.profiles,
          };
        // persist also calls merge with nothing stored, which is a first visit rather than a lost setup.
        if (saved !== undefined) reportDiscardedSave(TARGET_STORAGE_KEY);
        return current;
      },
    },
  ),
);

const toCm = (length: Length) => length.number * { mm: 0.1, cm: 1, m: 100 }[length.unit];
export function calculateHeightOfTarget(heightOfEye: Length, distanceToTarget: Length, discipline: Discipline): number {
  const ratio = toCm(distanceToTarget) / toCm(discipline.distance);
  return toCm(heightOfEye) + (toCm(discipline.heightOfTarget) - toCm(heightOfEye)) * ratio;
}
export function calculateBlackAreaSize(distanceToTarget: Length, discipline: Discipline): number {
  return (toCm(discipline.blackAreaSize) * toCm(distanceToTarget)) / toCm(discipline.distance);
}
