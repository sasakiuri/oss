import type { LaneInterruptionRecord } from './LaneInterruptionRecord';

export interface PauseLaneCompetitionInput {
  competitionId: string;
  interruptionId: string;
  pausedAt: Date;
}

export interface ResumeLaneCompetitionInput {
  competitionId: string;
  interruptionId: string;
  timerStartAt: Date;
  authorizedRemainingSeconds: number;
  unlimitedSightingShots: boolean;
}

export interface ResumeLaneMatchInput {
  competitionId: string;
  interruptionId: string;
}

export interface ICompetitionInterruptionControl {
  pause(input: PauseLaneCompetitionInput): Promise<LaneInterruptionRecord>;
  resume(input: ResumeLaneCompetitionInput): Promise<LaneInterruptionRecord>;
  resumeMatch(input: ResumeLaneMatchInput): Promise<LaneInterruptionRecord>;
  get(competitionId: string): LaneInterruptionRecord | null;
  clear(competitionId: string): void;
}
