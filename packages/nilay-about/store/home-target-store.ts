import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

// Types
export type LengthUnit = "mm" | "cm" | "m";

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

export type Language = "ja" | "en";

// State interface (persisted data)
interface HomeTargetState {
  language: Language;
  heightOfEye: Length;
  distanceToTarget: Length;
  discipline: Discipline;
  isReadonly: boolean;
}

// UI state (not persisted)
interface HomeTargetUIState {
  isDownloading: boolean;
  isDisciplineDialogOpen: boolean;
}

// Actions interface
interface HomeTargetActions {
  setLanguage: (lang: Language) => void;
  setHeightOfEye: (height: Length) => void;
  setDistanceToTarget: (distance: Length) => void;
  setDiscipline: (discipline: Discipline) => void;
  setIsReadonly: (readonly: boolean) => void;
  setIsDownloading: (downloading: boolean) => void;
  setIsDisciplineDialogOpen: (open: boolean) => void;
  reset: () => void;
}

// Combined store type
type HomeTargetStore = HomeTargetState & HomeTargetUIState & HomeTargetActions;

// Initial state (useful for testing and reset)
export const initialHomeTargetState: HomeTargetState = {
  language: "ja",
  heightOfEye: { number: 170, unit: "cm" },
  distanceToTarget: { number: 5, unit: "m" },
  discipline: {
    name: "Custom",
    key: "CUSTOM",
    distance: { number: 50, unit: "m" },
    heightOfTarget: { number: 75, unit: "cm" },
    blackAreaSize: { number: 11.24, unit: "cm" },
  },
  isReadonly: false,
};

const initialUIState: HomeTargetUIState = {
  isDownloading: false,
  isDisciplineDialogOpen: false,
};

// Store with persistence for user preferences
export const useHomeTargetStore = create<HomeTargetStore>()(
  persist(
    (set) => ({
      ...initialHomeTargetState,
      ...initialUIState,

      setLanguage: (language) => set({ language }),
      setHeightOfEye: (heightOfEye) => set({ heightOfEye }),
      setDistanceToTarget: (distanceToTarget) => set({ distanceToTarget }),
      setDiscipline: (discipline) => set({ discipline }),
      setIsReadonly: (isReadonly) => set({ isReadonly }),
      setIsDownloading: (isDownloading) => set({ isDownloading }),
      setIsDisciplineDialogOpen: (isDisciplineDialogOpen) =>
        set({ isDisciplineDialogOpen }),
      reset: () => set({ ...initialHomeTargetState, ...initialUIState }),
    }),
    {
      name: "home-target-storage",
      // Only persist user preferences, not UI state
      partialize: (state) => ({
        language: state.language,
        heightOfEye: state.heightOfEye,
        distanceToTarget: state.distanceToTarget,
        discipline: state.discipline,
        isReadonly: state.isReadonly,
      }),
    }
  )
);

// Computed values as pure functions (testable, memoizable)
export function calculateHeightOfTarget(
  heightOfEye: Length,
  distanceToTarget: Length,
  discipline: Discipline
): number {
  return (
    discipline.heightOfTarget.number *
    (1 -
      (1 - heightOfEye.number / discipline.heightOfTarget.number) *
        (1 - distanceToTarget.number / discipline.distance.number))
  );
}

export function calculateBlackAreaSize(
  distanceToTarget: Length,
  discipline: Discipline
): number {
  return (
    (discipline.blackAreaSize.number * distanceToTarget.number) /
    discipline.distance.number
  );
}

// Selectors
export const useHomeTargetCalculations = () =>
  useHomeTargetStore(
    useShallow((state) => ({
      heightOfTarget: calculateHeightOfTarget(
        state.heightOfEye,
        state.distanceToTarget,
        state.discipline
      ),
      blackAreaSize: calculateBlackAreaSize(
        state.distanceToTarget,
        state.discipline
      ),
    }))
  );

export const useHomeTargetActions = () =>
  useHomeTargetStore(
    useShallow((state) => ({
      setLanguage: state.setLanguage,
      setHeightOfEye: state.setHeightOfEye,
      setDistanceToTarget: state.setDistanceToTarget,
      setDiscipline: state.setDiscipline,
      setIsReadonly: state.setIsReadonly,
      setIsDownloading: state.setIsDownloading,
      setIsDisciplineDialogOpen: state.setIsDisciplineDialogOpen,
      reset: state.reset,
    }))
  );

export const useHomeTargetSettings = () =>
  useHomeTargetStore(
    useShallow((state) => ({
      language: state.language,
      heightOfEye: state.heightOfEye,
      distanceToTarget: state.distanceToTarget,
      discipline: state.discipline,
      isReadonly: state.isReadonly,
    }))
  );

export const useHomeTargetUIState = () =>
  useHomeTargetStore(
    useShallow((state) => ({
      isDownloading: state.isDownloading,
      isDisciplineDialogOpen: state.isDisciplineDialogOpen,
    }))
  );
