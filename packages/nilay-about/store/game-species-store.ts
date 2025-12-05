import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

// Types
export interface Quiz {
  image: string;
  answer: string;
}

interface GameSpeciesState {
  // State
  quizList: Quiz[];
  currentIndex: number;
  showingAnswer: boolean;
  autoPlay: boolean;
}

interface GameSpeciesActions {
  // Actions
  setShowingAnswer: (showing: boolean) => void;
  setAutoPlay: (autoPlay: boolean) => void;
  nextQuiz: () => void;
  reset: (shuffledList: Quiz[]) => void;
}

type GameSpeciesStore = GameSpeciesState & GameSpeciesActions;

// Initial state (useful for testing)
export const initialGameSpeciesState: GameSpeciesState = {
  quizList: [],
  currentIndex: 0,
  showingAnswer: false,
  autoPlay: false,
};

// Store
export const useGameSpeciesStore = create<GameSpeciesStore>((set, get) => ({
  ...initialGameSpeciesState,

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

// Selectors (for performance optimization)
export const useCurrentQuiz = () =>
  useGameSpeciesStore((state) =>
    state.quizList.length > 0 ? state.quizList[state.currentIndex] : null
  );

export const useQuizProgress = () =>
  useGameSpeciesStore(
    useShallow((state) => ({
      current: state.currentIndex + 1,
      total: state.quizList.length,
      percentage:
        state.quizList.length > 0
          ? (state.currentIndex / state.quizList.length) * 100
          : 0,
    }))
  );

export const useGameSpeciesActions = () =>
  useGameSpeciesStore(
    useShallow((state) => ({
      setShowingAnswer: state.setShowingAnswer,
      setAutoPlay: state.setAutoPlay,
      nextQuiz: state.nextQuiz,
      reset: state.reset,
    }))
  );
