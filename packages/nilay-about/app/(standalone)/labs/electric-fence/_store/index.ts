import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { applyPreset, findPreset, presetsFor } from '@/lib/electric-fence';
import {
  electricFenceSettingsSchema,
  MAX_WIRE_ROWS,
  type ElectricFenceSettings,
  type FenceSpecies,
  type OuterWire,
  type WireRow,
} from '@/lib/schemas/electric-fence';

export const storageKey = 'nilay-labs-electric-fence-v1';

const savedSchema = z.object({
  settings: electricFenceSettingsSchema.nullable(),
});
type SavedState = z.infer<typeof savedSchema>;

type Layout = Pick<
  ElectricFenceSettings,
  'perimeterM' | 'gates' | 'corners' | 'roughLengthM' | 'postSpacingM' | 'roughPostSpacingM' | 'sparePercent'
>;

interface ElectricFenceStore extends ElectricFenceSettings {
  lastValidSettings: ElectricFenceSettings;
  setSpecies: (species: FenceSpecies) => void;
  choosePreset: (presetId: string) => void;
  setRow: (index: number, row: WireRow) => void;
  addRow: () => void;
  removeRow: (index: number) => void;
  setOuterWire: (outerWire: OuterWire) => void;
  setLayout: (layout: Partial<Layout>) => void;
  toggleChecked: (id: string) => void;
}

const defaultPreset = findPreset('tottori-deer-boar')!;

// Rows and post spacing come from the Tottori manual (six rows, the short end of 3–4 m). No source
// gives figures for uneven ground, so it starts at 0 m with the same 3 m spacing.
export const initialElectricFenceSettings: ElectricFenceSettings = {
  ...applyPreset(defaultPreset, {
    outerWire: { enabled: false, heightCm: 20, offsetCm: 30 },
    postSpacingM: 3,
  }),
  perimeterM: 200,
  gates: 1,
  corners: 4,
  roughLengthM: 0,
  roughPostSpacingM: 3,
  sparePercent: 0,
  checked: [],
};

export const useElectricFenceStore = create<ElectricFenceStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<ElectricFenceSettings>) => {
        const parsed = electricFenceSettingsSchema.safeParse({ ...get(), ...changes });
        // Keep the last complete settings while a numeric field is being edited.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialElectricFenceSettings,
        lastValidSettings: initialElectricFenceSettings,
        setSpecies: (species) => {
          const [first] = presetsFor(species);
          if (first) edit(applyPreset(first, get()));
        },
        choosePreset: (presetId) => {
          const preset = findPreset(presetId);
          if (preset) edit(applyPreset(preset, get()));
        },
        setRow: (index, row) => edit({ rows: get().rows.map((current, i) => (i === index ? row : current)) }),
        addRow: () => {
          const { rows } = get();
          if (rows.length >= MAX_WIRE_ROWS) return;
          // A new row goes on top, 20 cm above the highest, as a place to start from; the reader sets it.
          const top = rows.reduce((max, row) => (Number.isFinite(row.heightCm) ? Math.max(max, row.heightCm) : max), 0);
          edit({ rows: [...rows, { heightCm: top + 20, energized: true }] });
        },
        removeRow: (index) => edit({ rows: get().rows.filter((_, i) => i !== index) }),
        setOuterWire: (outerWire) => edit({ outerWire }),
        setLayout: (layout) => edit(layout),
        toggleChecked: (id) => {
          const { checked } = get();
          edit({ checked: checked.includes(id) ? checked.filter((item) => item !== id) : [...checked, id] });
        },
      };
    },
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ settings: state.lastValidSettings }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success)
          return {
            ...current,
            ...parsed.data.settings,
            lastValidSettings: parsed.data.settings ?? current.lastValidSettings,
          };
        // A first visit stores nothing, but unreadable data is a loss the tool has to own up to.
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
