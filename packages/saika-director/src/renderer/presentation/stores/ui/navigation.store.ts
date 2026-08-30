import { create } from 'zustand';

export type ActiveScreen = 'tournament' | 'control' | 'examinations' | 'interruptions' | 'settings';

interface NavigationState {
  activeScreen: ActiveScreen;
  setActiveScreen: (screen: ActiveScreen) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activeScreen: 'control',
  setActiveScreen: (screen) => set({ activeScreen: screen }),
}));
