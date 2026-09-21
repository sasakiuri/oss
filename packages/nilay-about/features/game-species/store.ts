import { createStore } from 'zustand/vanilla';

import type { Quiz } from './model';

interface GameSpeciesState {
  quizList: Quiz[];
  currentIndex: number;
  showingAnswer: boolean;
  autoPlay: boolean;
}

interface GameSpeciesActions {
  showAnswer: () => void;
  setAutoPlay: (autoPlay: boolean) => void;
  nextQuiz: () => void;
  restart: (quizList: Quiz[]) => void;
}

export function createGameSpeciesStore() {
  return createStore<GameSpeciesState & GameSpeciesActions>()((set) => ({
    quizList: [],
    currentIndex: 0,
    showingAnswer: false,
    autoPlay: false,
    showAnswer: () => set({ showingAnswer: true }),
    setAutoPlay: (autoPlay) => set({ autoPlay }),
    nextQuiz: () =>
      set((state) =>
        state.currentIndex < state.quizList.length - 1
          ? { currentIndex: state.currentIndex + 1, showingAnswer: false }
          : {},
      ),
    restart: (quizList) => set({ quizList: [...quizList], currentIndex: 0, showingAnswer: false }),
  }));
}
