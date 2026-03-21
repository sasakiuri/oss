// SPDX-License-Identifier: MIT
export interface ScoreDiscrepancyRecord {
  timestamp: Date;
  sessionId: string;
  discipline: string;
  mode: string;
  deviceScore: number;
  appScore: number;
  diff: number;
  distance: number;
  x: number;
  y: number;
}

export interface IScoreDiscrepancyLogger {
  log(record: ScoreDiscrepancyRecord): void;
}
