import { createStore } from 'zustand/vanilla';

import { createCustomDiscipline, disciplines } from './disciplines';
import type { Discipline, Language, Length, TargetMeasurements } from './model';

interface HomeTargetState extends TargetMeasurements {
  language: Language;
}

interface HomeTargetActions {
  setLanguage: (language: Language) => void;
  setHeightOfEye: (heightOfEye: Length) => void;
  setDistanceToTarget: (distanceToTarget: Length) => void;
  setDiscipline: (discipline: Discipline) => void;
  selectDiscipline: (key: string) => void;
  reset: () => void;
}

function initialState(): HomeTargetState {
  return {
    language: 'ja',
    heightOfEye: { number: 170, unit: 'cm' },
    distanceToTarget: { number: 5, unit: 'm' },
    discipline: createCustomDiscipline(),
  };
}

/** Each calculator owns its store, so navigation and concurrent renders cannot share form state. */
export function createHomeTargetStore() {
  return createStore<HomeTargetState & HomeTargetActions>()((set) => ({
    ...initialState(),
    setLanguage: (language) => set({ language }),
    setHeightOfEye: (heightOfEye) => set({ heightOfEye }),
    setDistanceToTarget: (distanceToTarget) => set({ distanceToTarget }),
    setDiscipline: (discipline) => set({ discipline }),
    selectDiscipline: (key) => {
      if (key === 'CUSTOM') {
        set(({ discipline }) => ({ discipline: { ...discipline, name: 'Custom', key } }));
        return;
      }
      const discipline = disciplines.get(key);
      if (!discipline) throw new Error(`Unknown discipline: ${key}`);
      set({ discipline: structuredClone(discipline) });
    },
    reset: () => set(initialState()),
  }));
}
