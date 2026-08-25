import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ChampionshipResultContext {
  eventId: string;
  relayNumber: number;
}

interface CompetitionControlState {
  resultContexts: Record<string, ChampionshipResultContext>;
  getResultContext: (competitionId: string) => ChampionshipResultContext | null;
  setResultContext: (competitionId: string, context: ChampionshipResultContext) => void;
  clearResultContext: (competitionId: string) => void;
  reset: () => void;
}

export const useCompetitionControlStore = create<CompetitionControlState>()(
  persist(
    (set, get) => ({
      resultContexts: {},
      getResultContext: (competitionId) => get().resultContexts[competitionId] ?? null,
      setResultContext: (competitionId, context) =>
        set((state) => ({
          resultContexts: { ...state.resultContexts, [competitionId]: context },
        })),
      clearResultContext: (competitionId) =>
        set((state) => {
          const resultContexts = { ...state.resultContexts };
          delete resultContexts[competitionId];
          return { resultContexts };
        }),
      reset: () => set({ resultContexts: {} }),
    }),
    { name: 'saika-director-competition-control' },
  ),
);
