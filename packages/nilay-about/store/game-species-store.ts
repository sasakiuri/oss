import { create } from "zustand";

export interface Quiz {
  image: string;
  answer: string;
}

interface GameSpeciesState {
  quizList: Quiz[];
  currentIndex: number;
  showingAnswer: boolean;
  autoPlay: boolean;
  setQuizList: (list: Quiz[]) => void;
  setCurrentIndex: (index: number) => void;
  setShowingAnswer: (showing: boolean) => void;
  setAutoPlay: (autoPlay: boolean) => void;
  nextQuiz: () => void;
  reset: (shuffledList: Quiz[]) => void;
}

export const useGameSpeciesStore = create<GameSpeciesState>((set, get) => ({
  quizList: [],
  currentIndex: 0,
  showingAnswer: false,
  autoPlay: false,

  setQuizList: (quizList) => set({ quizList }),

  setCurrentIndex: (currentIndex) => set({ currentIndex }),

  setShowingAnswer: (showingAnswer) => set({ showingAnswer }),

  setAutoPlay: (autoPlay) => set({ autoPlay }),

  nextQuiz: () => {
    const { currentIndex, quizList } = get();
    if (currentIndex < quizList.length - 1) {
      set({ currentIndex: currentIndex + 1, showingAnswer: false });
    }
  },

  reset: (shuffledList) =>
    set({
      quizList: shuffledList,
      currentIndex: 0,
      showingAnswer: false,
    }),
}));
