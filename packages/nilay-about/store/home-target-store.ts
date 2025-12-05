import { create } from "zustand";

type LengthUnit = "mm" | "cm" | "m";

interface Length {
  number: number;
  unit: LengthUnit;
}

interface Discipline {
  name: string;
  key: string;
  distance: Length;
  heightOfTarget: Length;
  blackAreaSize: Length;
}

type Language = "ja" | "en";

interface HomeTargetState {
  language: Language;
  heightOfEye: Length;
  distanceToTarget: Length;
  discipline: Discipline;
  isReadonly: boolean;
  isDownloading: boolean;
  isDisciplineDialogOpen: boolean;

  setLanguage: (lang: Language) => void;
  setHeightOfEye: (height: Length) => void;
  setDistanceToTarget: (distance: Length) => void;
  setDiscipline: (discipline: Discipline) => void;
  setIsReadonly: (readonly: boolean) => void;
  setIsDownloading: (downloading: boolean) => void;
  setIsDisciplineDialogOpen: (open: boolean) => void;

  getCalculatedHeightOfTarget: () => number;
  getCalculatedBlackAreaSize: () => number;
}

export const useHomeTargetStore = create<HomeTargetState>((set, get) => ({
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

  setLanguage: (language) => set({ language }),
  setHeightOfEye: (heightOfEye) => set({ heightOfEye }),
  setDistanceToTarget: (distanceToTarget) => set({ distanceToTarget }),
  setDiscipline: (discipline) => set({ discipline }),
  setIsReadonly: (isReadonly) => set({ isReadonly }),
  setIsDownloading: (isDownloading) => set({ isDownloading }),
  setIsDisciplineDialogOpen: (isDisciplineDialogOpen) =>
    set({ isDisciplineDialogOpen }),

  getCalculatedHeightOfTarget: () => {
    const { heightOfEye, distanceToTarget, discipline } = get();
    return (
      discipline.heightOfTarget.number *
      (1 -
        (1 - heightOfEye.number / discipline.heightOfTarget.number) *
          (1 - distanceToTarget.number / discipline.distance.number))
    );
  },

  getCalculatedBlackAreaSize: () => {
    const { distanceToTarget, discipline } = get();
    return (
      (discipline.blackAreaSize.number * distanceToTarget.number) /
      discipline.distance.number
    );
  },
}));
