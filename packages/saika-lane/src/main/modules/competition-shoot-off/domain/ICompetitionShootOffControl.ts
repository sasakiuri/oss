// SPDX-License-Identifier: MIT

export interface CompetitionShootOffWindow {
  readonly competitionId: string;
  readonly runId: string;
  readonly iteration: number;
  readonly timerStartAt: string;
  readonly timerDurationSeconds: number;
  readonly status: 'OPEN' | 'SHOT_RECORDED';
  readonly shotId: string | null;
}

export interface OpenCompetitionShootOffWindowInput {
  readonly competitionId: string;
  readonly runId: string;
  readonly iteration: number;
  readonly timerStartAt: string;
  readonly timerDurationSeconds: number;
}

export interface ICompetitionShootOffControl {
  open(input: OpenCompetitionShootOffWindowInput): CompetitionShootOffWindow;
  close(competitionId: string, runId: string, iteration: number): void;
  getState(): CompetitionShootOffWindow | null;
  canAcceptShot(competitionId: string, at: Date): boolean;
  recordShot(competitionId: string, shotId: string, at: Date): CompetitionShootOffWindow;
}
