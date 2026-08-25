import { create } from 'zustand';

export interface ShootoffRoundData {
  roundNumber: number;
  shots: Array<{ participantId: string; laneId: string; score: number }>;
}

export interface ActiveShootoff {
  id: string;
  targetLaneIds: string[];
  contestedRank: number;
  rounds: ShootoffRoundData[];
  isResolved: boolean;
  winnerLaneId?: string;
}

interface ShootoffState {
  activeShootoff: ActiveShootoff | null;
  currentRoundScores: Map<string, number>;
  timerSeconds: number;
  timerRunning: boolean;

  setActiveShootoff: (shootoff: ActiveShootoff | null) => void;
  setRoundScore: (laneId: string, score: number) => void;
  removeRoundScore: (laneId: string) => void;
  clearCurrentRound: () => void;
  clearAll: () => void;
  setTimer: (seconds: number) => void;
  setTimerRunning: (running: boolean) => void;
  addRound: (round: ShootoffRoundData) => void;
  resolveShootoff: (winnerLaneId: string) => void;
}

export const useShootoffStore = create<ShootoffState>((set) => ({
  activeShootoff: null,
  currentRoundScores: new Map(),
  timerSeconds: 50,
  timerRunning: false,

  setActiveShootoff: (shootoff) =>
    set({
      activeShootoff: shootoff,
      currentRoundScores: new Map(),
      timerSeconds: 50,
      timerRunning: false,
    }),

  setRoundScore: (laneId, score) =>
    set((state) => {
      const newScores = new Map(state.currentRoundScores);
      newScores.set(laneId, score);
      return { currentRoundScores: newScores };
    }),

  removeRoundScore: (laneId) =>
    set((state) => {
      const newScores = new Map(state.currentRoundScores);
      newScores.delete(laneId);
      return { currentRoundScores: newScores };
    }),

  clearCurrentRound: () =>
    set({
      currentRoundScores: new Map(),
      timerSeconds: 50,
      timerRunning: false,
    }),

  clearAll: () =>
    set({
      activeShootoff: null,
      currentRoundScores: new Map(),
      timerSeconds: 50,
      timerRunning: false,
    }),

  setTimer: (seconds) => set({ timerSeconds: seconds }),

  setTimerRunning: (running) => set({ timerRunning: running }),

  addRound: (round) =>
    set((state) => {
      if (!state.activeShootoff) return {};
      return {
        activeShootoff: {
          ...state.activeShootoff,
          rounds: [...state.activeShootoff.rounds, round],
        },
        currentRoundScores: new Map(),
        timerSeconds: 50,
        timerRunning: false,
      };
    }),

  resolveShootoff: (winnerLaneId) =>
    set((state) => {
      if (!state.activeShootoff) return {};
      return {
        activeShootoff: {
          ...state.activeShootoff,
          isResolved: true,
          winnerLaneId,
        },
      };
    }),
}));
