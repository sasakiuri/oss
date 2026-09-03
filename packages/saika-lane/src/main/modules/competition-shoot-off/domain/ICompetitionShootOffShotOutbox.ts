// SPDX-License-Identifier: MIT
import type { CompetitionShootOffShotPayload } from '@/shared/mqtt/CompetitionShootOffShot';

export interface ICompetitionShootOffShotOutbox {
  enqueue(payload: CompetitionShootOffShotPayload): void;
  findByRound(runId: string, iteration: number, laneId: string): CompetitionShootOffShotPayload[];
  findPending(limit?: number): CompetitionShootOffShotPayload[];
  markPublished(shotId: string, publishedAt: Date): void;
}
