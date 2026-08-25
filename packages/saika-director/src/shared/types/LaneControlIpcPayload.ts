import type { LanePhase } from '@/shared/constants/competition';

/**
 * IPC payload shared by DomainEventForwarder and the LaneControlUpdated event contract.
 */
export interface LaneControlIpcPayload extends Record<string, unknown> {
  readonly channel: number;
  readonly playerName: string | null;
  readonly affiliation: string | null;
  readonly participantId?: string | null;
  readonly relayNumber?: number;
  readonly phase: LanePhase;
  readonly remainingTime: number;
  readonly shotNumber: number;
  readonly lastScore: number | null;
  readonly lastShotTime: number | null;
  readonly seriesScores: number[];
  readonly totalScore: number;
  readonly recentShots: number[];
  readonly matchShots: number[];
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly roundType: string;
  readonly unifiedPhase: LanePhase;
  readonly stageName: string;
  readonly stage1Total: number;
  readonly stage2Total: number;
  readonly eliminated: boolean;
  readonly eliminationRank: number | null;
}
