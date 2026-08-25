import { create } from 'zustand';
import type {
  ChampionshipDto,
  ChampionshipDetailResponse,
  ParticipantDto,
  FiringPointAssignmentDto,
} from '@/shared/ipc/contracts/championship.contract';

interface ChampionshipState {
  championships: ChampionshipDto[];
  selectedChampionship: ChampionshipDetailResponse | null;
  selectedEventId: string | null;
  participants: ParticipantDto[];
  firingPointAssignments: FiringPointAssignmentDto[];

  setChampionships: (championships: ChampionshipDto[]) => void;
  setSelectedChampionship: (championship: ChampionshipDetailResponse | null) => void;
  setSelectedEventId: (eventId: string | null) => void;
  setParticipants: (participants: ParticipantDto[]) => void;
  setFiringPointAssignments: (assignments: FiringPointAssignmentDto[]) => void;
  reset: () => void;
}

const initialState = {
  championships: [] as ChampionshipDto[],
  selectedChampionship: null as ChampionshipDetailResponse | null,
  selectedEventId: null as string | null,
  participants: [] as ParticipantDto[],
  firingPointAssignments: [] as FiringPointAssignmentDto[],
};

export const useChampionshipStore = create<ChampionshipState>((set) => ({
  ...initialState,
  setChampionships: (championships) => set({ championships }),
  setSelectedChampionship: (championship) =>
    set((state) => {
      const selectedEventStillExists =
        championship !== null &&
        state.selectedChampionship?.id === championship.id &&
        state.selectedEventId !== null &&
        championship.events.some((event) => event.id === state.selectedEventId);

      if (selectedEventStillExists) {
        return { selectedChampionship: championship };
      }

      return {
        selectedChampionship: championship,
        selectedEventId: null,
        participants: [],
        firingPointAssignments: [],
      };
    }),
  setSelectedEventId: (eventId) =>
    set((state) => {
      if (state.selectedEventId === eventId) return state;
      return {
        selectedEventId: eventId,
        participants: [],
        firingPointAssignments: [],
      };
    }),
  setParticipants: (participants) => set({ participants }),
  setFiringPointAssignments: (assignments) => set({ firingPointAssignments: assignments }),
  reset: () => set(initialState),
}));
