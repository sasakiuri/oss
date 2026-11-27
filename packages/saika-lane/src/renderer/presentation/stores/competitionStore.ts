// SPDX-License-Identifier: MIT

import { create } from 'zustand';

import type { CompetitionStateDto } from '@/shared/ipc/contracts';
import type { ScoringAcc } from '@/shared/ipc/schemas/common';
import type { ScoringGaugeProfileId, TargetScoringProfileId } from '@/shared/target';
import type { Phase } from '@/shared/types/Phase';

interface CompetitionState {
  athleteTargetControl: CompetitionStateDto['athleteTargetControl'];
  athleteTargetControlPending: boolean;
  athleteTargetControlLoaded: boolean;
  phase: Phase;
  stageIndex: number;
  seriesIndex: number;
  scored: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  waitingForDirector: boolean;
  isTimerExpired: boolean;
  shotsPerSeries: number;
  acc: ScoringAcc;
  competitionId: string | null;
  savedCompetitionTypeId: string | null;
  /** The running interruption as the competition reports it, without the restart hold its events omit. */
  interruption: Omit<NonNullable<CompetitionStateDto['interruption']>, 'restartHold'> | null;
  targetProfileId?: TargetScoringProfileId;
  scoringGaugeProfileId?: ScoringGaugeProfileId;
}

interface CompetitionActions {
  setAthleteTargetControl: (control: CompetitionStateDto['athleteTargetControl']) => void;
  updateTimer: (remaining: number, total: number) => void;
  setTimerExpired: (expired: boolean) => void;
  advanceSeries: (seriesIndex: number) => void;
  setShotsPerSeries: (shots: number) => void;
  setAcc: (acc: ScoringAcc) => void;
  setCompetitionId: (id: string | null) => void;
  setSavedCompetitionTypeId: (id: string | null) => void;
  /** Set the stage-authoritative target scoring profile. */
  setTargetProfileId: (id?: TargetScoringProfileId) => void;
  setInterruption: (interruption: CompetitionState['interruption']) => void;
  applyPhaseChange: (
    phase: Phase,
    stageIndex: number,
    seriesIndex: number,
    scored: boolean,
    targetProfileId?: TargetScoringProfileId,
    scoringGaugeProfileId?: ScoringGaugeProfileId,
  ) => void;
  resetCompetition: () => void;
}

/** The competition coordinates a response or a pending confirmation belongs to. */
interface CompetitionPosition {
  competitionId: string | null;
  phase: string;
  stageIndex: number;
  seriesIndex: number;
}

export function isSameCompetitionPosition(a: CompetitionPosition, b: CompetitionPosition): boolean {
  return (
    a.competitionId === b.competitionId &&
    a.phase === b.phase &&
    a.stageIndex === b.stageIndex &&
    a.seriesIndex === b.seriesIndex
  );
}

/** Drops the athlete target control of a previous position; the next query loads the new one. */
export const clearedAthleteTargetControl = { athleteTargetControl: null, athleteTargetControlLoaded: false } as const;

const initialState: CompetitionState = {
  athleteTargetControl: null,
  athleteTargetControlPending: false,
  athleteTargetControlLoaded: false,
  phase: 'IDLE',
  stageIndex: 0,
  seriesIndex: 0,
  scored: false,
  remainingSeconds: 0,
  totalSeconds: 0,
  waitingForDirector: false,
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

  setAthleteTargetControl: (athleteTargetControl) =>
    set({ athleteTargetControl, athleteTargetControlPending: false, athleteTargetControlLoaded: true }),

  updateTimer: (remaining, total) => {
    set({ remainingSeconds: remaining, totalSeconds: total });
  },

  setTimerExpired: (expired) => {
    set({ isTimerExpired: expired });
  },

  advanceSeries: (seriesIndex) => {
    set((state) => ({
      seriesIndex,
      ...(state.seriesIndex !== seriesIndex ? clearedAthleteTargetControl : {}),
    }));
  },

  setShotsPerSeries: (shots) => {
    set({ shotsPerSeries: shots });
  },

  setAcc: (acc) => {
    set({ acc });
  },

  setCompetitionId: (id) => {
    set((state) => ({
      competitionId: id,
      ...(state.competitionId !== id ? clearedAthleteTargetControl : {}),
    }));
  },

  setSavedCompetitionTypeId: (id) => {
    set({ savedCompetitionTypeId: id });
  },

  setTargetProfileId: (id) => {
    set({ targetProfileId: id });
  },

  setInterruption: (interruption) => {
    set({ interruption });
  },

  applyPhaseChange: (phase, stageIndex, seriesIndex, scored, targetProfileId, scoringGaugeProfileId) => {
    set((state) => ({
      waitingForDirector: false,
      ...(state.phase !== phase || state.stageIndex !== stageIndex || state.seriesIndex !== seriesIndex
        ? clearedAthleteTargetControl
        : {}),
      phase,
      stageIndex,
      seriesIndex,
      scored,
      targetProfileId,
      scoringGaugeProfileId,
      ...(phase === 'ACTIVE' ? { isTimerExpired: false } : {}),
    }));
  },

  resetCompetition: () => {
    set({ ...initialState });
  },
}));
