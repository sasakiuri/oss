import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { snareGaugeSettingsSchema, type SnareGaugeSettings } from '@/lib/schemas/snare-gauge';
import {
  defaultSnareGaugeSize,
  getSnareRequirements,
  todayInJapan,
  keepSnareGaugeSize,
  type SnareGaugeSizeMm,
  type SnareTargetSpecies,
} from '@/lib/snare-gauge';

export const SNARE_GAUGE_STORAGE_KEY = 'nilay-labs-snare-gauge-v1';

const savedSchema = z.object({ settings: snareGaugeSettingsSchema });
type SavedState = z.infer<typeof savedSchema>;

interface SnareGaugeStore extends SnareGaugeSettings {
  setPrefecture: (prefecture: string) => void;
  setSpecies: (species: SnareTargetSpecies) => void;
  setGaugeMm: (gaugeMm: SnareGaugeSizeMm) => void;
  reset: () => void;
}

export const initialSnareGaugeSettings: SnareGaugeSettings = {
  prefecture: 'national',
  species: 'boar',
  gaugeMm: 120,
};

export const useSnareGaugeStore = create<SnareGaugeStore>()(
  persist(
    (set, get) => {
      // A new prefecture or species resets the gauge to the statutory size.
      const choose = (prefecture: string, species: SnareTargetSpecies) => {
        set({ prefecture, species, gaugeMm: defaultSnareGaugeSize() });
      };
      return {
        ...initialSnareGaugeSettings,
        setPrefecture: (prefecture) => choose(prefecture, get().species),
        setSpecies: (species) => choose(get().prefecture, species),
        setGaugeMm: (gaugeMm) => set({ gaugeMm }),
        reset: () => set({ ...initialSnareGaugeSettings }),
      };
    },
    {
      name: SNARE_GAUGE_STORAGE_KEY,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({
        settings: { prefecture: state.prefecture, species: state.species, gaugeMm: state.gaugeMm },
      }),
      merge: (saved, current) => {
        // A first visit has nothing stored, and persist still calls merge.
        if (saved === undefined) return current;
        const parsed = savedSchema.safeParse(saved);
        if (!parsed.success) {
          // Starting over silently would look like the choice vanished.
          reportDiscardedSave(SNARE_GAUGE_STORAGE_KEY);
          return current;
        }
        const { prefecture, species, gaugeMm } = parsed.data.settings;
        // A size saved for another choice is brought back in line, as a change of choice would.
        const requirements = getSnareRequirements(prefecture, species, todayInJapan(new Date()));
        return { ...current, prefecture, species, gaugeMm: keepSnareGaugeSize(gaugeMm, requirements) };
      },
    },
  ),
);
