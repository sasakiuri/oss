import { create } from 'zustand';
import type {
  ChampionshipDto,
  ChampionshipDetailDto,
  ParticipantDto,
  FiringPointAssignmentDto,
} from '@/shared/ipc/contracts';

interface ChampionshipState {
  championships: ChampionshipDto[];
  selectedChampionship: ChampionshipDetailDto | null;
  selectedEventId: string | null;
  participants: ParticipantDto[];
  firingPointAssignments: FiringPointAssignmentDto[];

  setChampionships: (championships: ChampionshipDto[]) => void;
  setSelectedChampionship: (championship: ChampionshipDetailDto | null) => void;
  setSelectedEventId: (eventId: string | null) => void;
  setParticipants: (participants: ParticipantDto[]) => void;
  setFiringPointAssignments: (assignments: FiringPointAssignmentDto[]) => void;
  reset: () => void;
}

const initialState = {
  championships: [] as ChampionshipDto[],
  selectedChampionship: null as ChampionshipDetailDto | null,
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
