import { create } from 'zustand';
import type { LanePhase } from '@/shared/constants/competition';

interface TimerState {
  remainingTime: number;
  phase: LanePhase;
  isRunning: boolean;

  setTimer: (remainingTime: number, phase: LanePhase) => void;
  setExpired: (phase: LanePhase) => void;
  reset: () => void;
}

export const useTimerStore = create<TimerState>((set) => ({
  remainingTime: 0,
  phase: 'IDLE',
  isRunning: false,

  setTimer: (remainingTime, phase) => set({ remainingTime, phase, isRunning: remainingTime > 0 }),
  setExpired: (phase) => set({ remainingTime: 0, phase, isRunning: false }),
  reset: () => set({ remainingTime: 0, phase: 'IDLE', isRunning: false }),
}));
