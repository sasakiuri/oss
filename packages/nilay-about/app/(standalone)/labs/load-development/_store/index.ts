import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { LOAD_STEP_LIMIT } from '@/lib/load-development';
import {
  loadDevelopmentSettingsSchema,
  type ImpactMode,
  type LoadDevelopmentSettings,
  type LoadStep,
  type SpeedUnit,
  type StepUnit,
} from '@/lib/schemas/load-development';

export const storageKey = 'nilay-labs-load-development-v1';

const savedSchema = z.object({
  settings: loadDevelopmentSettingsSchema.nullable(),
});
type SavedState = z.infer<typeof savedSchema>;

interface LoadDevelopmentStore extends LoadDevelopmentSettings {
  lastValidSettings: LoadDevelopmentSettings;
  setStepUnit: (unit: StepUnit) => void;
  setSpeedUnit: (unit: SpeedUnit) => void;
  setImpactMode: (mode: ImpactMode) => void;
  setVelocityThreshold: (value: number) => void;
  setMovementThreshold: (value: number) => void;
  updateStep: (id: string, changes: Partial<Omit<LoadStep, 'id'>>) => void;
  addStep: () => void;
  removeStep: (id: string) => void;
}

/** The next id not in use: numbered rather than random, so a saved series reads the same every time. */
export function nextStepId(steps: readonly LoadStep[]): string {
  const used = steps.map((step) => Number(step.id.replace(/^s/u, ''))).filter((value) => Number.isFinite(value));
  return `s${used.length === 0 ? 1 : Math.max(...used) + 1}`;
}

/**
 * What the tool opens on: an illustrative series of six charges, three rounds each.
 *
 * It is not a published load and not a recommendation for any cartridge. It is there so the first
 * visit shows the point of the tool: the middle steps look flat on their averages, and three shots a
 * step are not enough to say that they are.
 */
export const initialLoadDevelopmentSettings: LoadDevelopmentSettings = {
  stepUnit: 'gr',
  speedUnit: 'mps',
  impactMode: 'vertical',
  steps: [
    { id: 's1', value: 40.0, velocities: '790\n794\n787', impacts: '12\n18\n9' },
    { id: 's2', value: 40.3, velocities: '798\n802\n795', impacts: '20\n26\n17' },
    { id: 's3', value: 40.6, velocities: '803\n806\n801', impacts: '24\n22\n28' },
    { id: 's4', value: 40.9, velocities: '805\n808\n803', impacts: '25\n21\n27' },
    { id: 's5', value: 41.2, velocities: '807\n804\n809', impacts: '22\n27\n24' },
    { id: 's6', value: 41.5, velocities: '816\n819\n813', impacts: '37\n33\n40' },
  ],
  velocityThreshold: 5,
  movementThreshold: 5,
};

export const useLoadDevelopmentStore = create<LoadDevelopmentStore>()(
  persist(
    (set, get) => {
      const edit = (changes: Partial<LoadDevelopmentSettings>) => {
        const parsed = loadDevelopmentSettingsSchema.safeParse({ ...get(), ...changes });
        // Keep the last complete settings while a numeric field is being edited.
        set({ ...changes, ...(parsed.success ? { lastValidSettings: parsed.data } : {}) });
      };
      return {
        ...initialLoadDevelopmentSettings,
        lastValidSettings: initialLoadDevelopmentSettings,
        setStepUnit: (stepUnit) => edit({ stepUnit }),
        // Readings are reread in the new unit, not converted.
        setSpeedUnit: (speedUnit) => edit({ speedUnit }),
        setImpactMode: (impactMode) => edit({ impactMode }),
        setVelocityThreshold: (velocityThreshold) => edit({ velocityThreshold }),
        setMovementThreshold: (movementThreshold) => edit({ movementThreshold }),
        updateStep: (id, changes) =>
          edit({ steps: get().steps.map((step) => (step.id === id ? { ...step, ...changes } : step)) }),
        addStep: () => {
          const { steps } = get();
          if (steps.length >= LOAD_STEP_LIMIT) return;
          const last = steps.at(-1);
          const previous = steps.at(-2);
          // The next value continues the spacing of the last two.
          const spacing =
            last && previous && Number.isFinite(last.value - previous.value) ? last.value - previous.value : 0;
          const value = last && Number.isFinite(last.value) ? Math.round((last.value + spacing) * 1000) / 1000 : NaN;
          edit({ steps: [...steps, { id: nextStepId(steps), value, velocities: '', impacts: '' }] });
        },
        removeStep: (id) => {
          const { steps } = get();
          if (steps.length <= 1) return;
          edit({ steps: steps.filter((step) => step.id !== id) });
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
        // Report saved data that could not be read; a first visit has none.
        if (saved !== undefined) reportDiscardedSave(storageKey);
        return current;
      },
    },
  ),
);
