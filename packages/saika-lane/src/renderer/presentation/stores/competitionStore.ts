// SPDX-License-Identifier: MIT

import { create } from 'zustand';

import type { ScoringGaugeProfileId, TargetScoringProfileId } from '@/shared/target';
import type { Phase } from '@/shared/types/Phase';

export type { Phase } from '@/shared/types/Phase';

interface CompetitionState {
  /** Current phase */
  phase: Phase;
  /** Current stage index */
  stageIndex: number;
  /** Current series index */
  seriesIndex: number;
  /** Current stage name */
  currentStageName: string;
  /** Whether it is a scoring stage */
  scored: boolean;
  /** Timer remaining seconds */
  remainingSeconds: number;
  /** Timer total seconds */
  totalSeconds: number;
  /** Timer running flag */
  isTimerRunning: boolean;
  /** Timer expired flag */
  isTimerExpired: boolean;
  /** Shots per series */
  shotsPerSeries: number;
  /** Scoring method (RING=integer score, DECIMAL=decimal score) */
  acc: 'RING' | 'DECIMAL';
  /** Competition ID */
  competitionId: string | null;
  /** Saved competition type ID */
  savedCompetitionTypeId: string | null;
  interruption: {
    interruptionId: string;
    status: 'PAUSED' | 'RESUME_PENDING' | 'SIGHTING' | 'RUNNING_MATCH';
    remainingSeconds: number;
    unlimitedSightingShots: boolean;
  } | null;
  targetProfileId?: TargetScoringProfileId;
  scoringGaugeProfileId?: ScoringGaugeProfileId;
}

interface CompetitionActions {
  /** Set phase */
  setPhase: (phase: Phase, stageIndex: number, seriesIndex: number, stageName: string, scored: boolean) => void;
  /** Update timer */
  updateTimer: (remaining: number, total: number) => void;
  /** Set timer running state */
  setTimerRunning: (running: boolean) => void;
  /** Set timer expired state */
  setTimerExpired: (expired: boolean) => void;
  /** Advance stage */
  advanceStage: (stageIndex: number, stageName: string, scored: boolean) => void;
  /** Advance series */
  advanceSeries: (seriesIndex: number) => void;
  /** Set shots per series */
  setShotsPerSeries: (shots: number) => void;
  /** Set scoring method */
  setAcc: (acc: 'RING' | 'DECIMAL') => void;
  /** Set competition ID */
  setCompetitionId: (id: string | null) => void;
  /** Set saved competition type ID */
  setSavedCompetitionTypeId: (id: string | null) => void;
  /** Set the stage-authoritative target scoring profile. */
  setTargetProfileId: (id?: TargetScoringProfileId) => void;
  /** Set the event-authoritative scoring gauge independently from the face. */
  setScoringGaugeProfileId: (id?: ScoringGaugeProfileId) => void;
  setInterruption: (interruption: CompetitionState['interruption']) => void;
  /** Apply phase change all at once */
  applyPhaseChange: (
    phase: Phase,
    stageIndex: number,
    seriesIndex: number,
    stageName: string,
    scored: boolean,
    targetProfileId?: TargetScoringProfileId,
    scoringGaugeProfileId?: ScoringGaugeProfileId,
  ) => void;
  /** Reset competition state */
  resetCompetition: () => void;
}

const initialState: CompetitionState = {
  phase: 'IDLE',
  stageIndex: 0,
  seriesIndex: 0,
  currentStageName: '',
  scored: false,
  remainingSeconds: 0,
  totalSeconds: 0,
  isTimerRunning: false,
  isTimerExpired: false,
  shotsPerSeries: 10,
  acc: 'DECIMAL',
  competitionId: null,
  savedCompetitionTypeId: null,
  interruption: null,
  targetProfileId: undefined,
  scoringGaugeProfileId: undefined,
};

export const useCompetitionStore = create<CompetitionState & CompetitionActions>((set) => ({
  ...initialState,

  setPhase: (phase, stageIndex, seriesIndex, stageName, scored) => {
    set({ phase, stageIndex, seriesIndex, currentStageName: stageName, scored });
  },

  updateTimer: (remaining, total) => {
    set({ remainingSeconds: remaining, totalSeconds: total });
  },

  setTimerRunning: (running) => {
    set({ isTimerRunning: running });
  },

  setTimerExpired: (expired) => {
    set({ isTimerExpired: expired });
  },

  advanceStage: (stageIndex, stageName, scored) => {
    set({ stageIndex, currentStageName: stageName, scored, seriesIndex: 0 });
  },

  advanceSeries: (seriesIndex) => {
    set({ seriesIndex });
  },

  setShotsPerSeries: (shots) => {
    set({ shotsPerSeries: shots });
  },

  setAcc: (acc) => {
    set({ acc });
  },

  setCompetitionId: (id) => {
    set({ competitionId: id });
  },

  setSavedCompetitionTypeId: (id) => {
    set({ savedCompetitionTypeId: id });
  },

  setTargetProfileId: (id) => {
    set({ targetProfileId: id });
  },

  setScoringGaugeProfileId: (id) => {
    set({ scoringGaugeProfileId: id });
  },

  setInterruption: (interruption) => {
    set({ interruption });
  },

  applyPhaseChange: (phase, stageIndex, seriesIndex, stageName, scored, targetProfileId, scoringGaugeProfileId) => {
    set({
      phase,
      stageIndex,
      seriesIndex,
      currentStageName: stageName,
      scored,
      targetProfileId,
      scoringGaugeProfileId,
      isTimerRunning: phase === 'ACTIVE',
      ...(phase === 'ACTIVE' ? { isTimerExpired: false } : {}),
    });
  },

  resetCompetition: () => {
    set({ ...initialState });
  },
}));
