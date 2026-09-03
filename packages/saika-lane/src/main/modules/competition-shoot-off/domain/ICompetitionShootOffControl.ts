// SPDX-License-Identifier: MIT

export interface CompetitionShootOffWindow {
  readonly competitionId: string;
  readonly runId: string;
  readonly iteration: number;
  readonly timerStartAt: string;
  readonly timerDurationSeconds: number;
  readonly shotsPerLane: number;
  /** Present when shot acceptance is additionally gated by a RulePack timed-target sequence. */
  readonly timedTargetProgramId?: string;
  readonly status: 'OPEN' | 'COMPLETE';
  readonly recordedShotIds: readonly string[];
}

export interface OpenCompetitionShootOffWindowInput {
  readonly competitionId: string;
  readonly runId: string;
  readonly iteration: number;
  readonly timerStartAt: string;
  readonly timerDurationSeconds: number;
  readonly shotsPerLane: number;
  readonly timedTargetProgramId?: string;
}

export interface ICompetitionShootOffControl {
  open(input: OpenCompetitionShootOffWindowInput): CompetitionShootOffWindow;
  close(competitionId: string, runId: string, iteration: number): void;
  getState(): CompetitionShootOffWindow | null;
  canAcceptShot(competitionId: string, at: Date): boolean;
  recordShot(competitionId: string, shotId: string, at: Date): CompetitionShootOffWindow;
}
