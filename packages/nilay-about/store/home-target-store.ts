import { create } from "zustand";

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

// State interface
interface HomeTargetState {
  language: Language;
  heightOfEye: Length;
  distanceToTarget: Length;
  discipline: Discipline;
  isReadonly: boolean;
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
type HomeTargetStore = HomeTargetState & HomeTargetActions;

// Initial state
const initialState: HomeTargetState = {
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
  isDownloading: false,
  isDisciplineDialogOpen: false,
};

// Simple store without persistence
export const useHomeTargetStore = create<HomeTargetStore>((set) => ({
  ...initialState,

  setLanguage: (language) => set({ language }),
  setHeightOfEye: (heightOfEye) => set({ heightOfEye }),
  setDistanceToTarget: (distanceToTarget) => set({ distanceToTarget }),
  setDiscipline: (discipline) => set({ discipline }),
  setIsReadonly: (isReadonly) => set({ isReadonly }),
  setIsDownloading: (isDownloading) => set({ isDownloading }),
  setIsDisciplineDialogOpen: (isDisciplineDialogOpen) =>
    set({ isDisciplineDialogOpen }),
  reset: () => set(initialState),
}));

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
