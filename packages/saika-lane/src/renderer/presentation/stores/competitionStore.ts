// SPDX-License-Identifier: MIT

import { create } from 'zustand';

import type { CompetitionStateDto } from '@/shared/ipc/contracts';
import type { ScoringGaugeProfileId, TargetScoringProfileId } from '@/shared/target';
import type { Phase } from '@/shared/types/Phase';

export type { Phase } from '@/shared/types/Phase';

interface CompetitionState {
  athleteTargetControl: CompetitionStateDto['athleteTargetControl'];
  athleteTargetControlPending: boolean;
  phase: Phase;
  stageIndex: number;
  seriesIndex: number;
  currentStageName: string;
  scored: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  isTimerRunning: boolean;
  isTimerExpired: boolean;
  shotsPerSeries: number;
  /** Scoring method (RING=integer score, DECIMAL=decimal score) */
  acc: 'RING' | 'DECIMAL';
  competitionId: string | null;
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
  setAthleteTargetControl: (control: CompetitionStateDto['athleteTargetControl']) => void;
  setPhase: (phase: Phase, stageIndex: number, seriesIndex: number, stageName: string, scored: boolean) => void;
  updateTimer: (remaining: number, total: number) => void;
  setTimerRunning: (running: boolean) => void;
  setTimerExpired: (expired: boolean) => void;
  advanceStage: (stageIndex: number, stageName: string, scored: boolean) => void;
  advanceSeries: (seriesIndex: number) => void;
  setShotsPerSeries: (shots: number) => void;
  setAcc: (acc: 'RING' | 'DECIMAL') => void;
  setCompetitionId: (id: string | null) => void;
  setSavedCompetitionTypeId: (id: string | null) => void;
  /** Set the stage-authoritative target scoring profile. */
  setTargetProfileId: (id?: TargetScoringProfileId) => void;
  /** Set the event-authoritative scoring gauge independently from the face. */
  setScoringGaugeProfileId: (id?: ScoringGaugeProfileId) => void;
  setInterruption: (interruption: CompetitionState['interruption']) => void;
  applyPhaseChange: (
    phase: Phase,
    stageIndex: number,
    seriesIndex: number,
    stageName: string,
    scored: boolean,
    targetProfileId?: TargetScoringProfileId,
    scoringGaugeProfileId?: ScoringGaugeProfileId,
  ) => void;
  resetCompetition: () => void;
}

const initialState: CompetitionState = {
  athleteTargetControl: null,
  athleteTargetControlPending: false,
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

  setAthleteTargetControl: (athleteTargetControl) => set({ athleteTargetControl, athleteTargetControlPending: false }),

  setPhase: (phase, stageIndex, seriesIndex, stageName, scored) => {
    set({ phase, stageIndex, seriesIndex, currentStageName: stageName, scored, athleteTargetControl: null });
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
    set({ stageIndex, currentStageName: stageName, scored, seriesIndex: 0, athleteTargetControl: null });
  },

  advanceSeries: (seriesIndex) => {
    set({ seriesIndex, athleteTargetControl: null });
  },

  setShotsPerSeries: (shots) => {
    set({ shotsPerSeries: shots });
  },

  setAcc: (acc) => {
    set({ acc });
  },

  setCompetitionId: (id) => {
    set({ competitionId: id, athleteTargetControl: null });
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
      athleteTargetControl: null,
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
