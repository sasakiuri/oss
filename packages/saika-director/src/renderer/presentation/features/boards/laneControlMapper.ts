import type { InferOutput } from '@sasakiuri/saika-ipc';

import type { laneControlContract } from '@/shared/ipc/contracts';
import type { LanePhase } from '@/shared/constants/competition';

import type { FinalBoardLaneData } from './types';

/** One Lane as `laneControl.getAll` returns it; main validates the response against the contract. */
export type LaneControlStateDto = Extract<
  InferOutput<typeof laneControlContract.procedures.getAll>,
  { success: true }
>['data'][number];

export interface LaneControlDto {
  id: string;
  channel: number;
  playerName: string | null;
  affiliation: string | null;
  participantId?: string;
  phase: LanePhase;
  remainingTime: number;
  shotNumber: number;
  lastScore: number | null;
  lastShotTime: number | null;
  seriesScores: number[];
  totalScore: number;
  recentShots: number[];
  unifiedPhase: string;
  stageIndex: number;
  seriesIndex: number;
  roundType: string;
  stageName: string;
  stage1Total: number;
  stage2Total: number;
  eliminated: boolean;
  eliminationRank: number | null;
  relayNumber: number;
}

export function mapResponseToLaneControlDto(data: LaneControlStateDto): LaneControlDto {
  return {
    id: data.id,
    channel: data.channel,
    playerName: data.player?.name ?? null,
    affiliation: data.player?.affiliation ?? null,
    participantId: data.player?.participantId,
    phase: data.phase,
    remainingTime: data.remainingTime,
    shotNumber: data.shotNumber,
    lastScore: data.lastScore,
    lastShotTime: data.lastShotTime,
    seriesScores: data.seriesScores,
    totalScore: data.totalScore,
    recentShots: data.recentShots,
    unifiedPhase: data.unifiedPhase,
    stageIndex: data.stageIndex,
    seriesIndex: data.seriesIndex,
    roundType: data.roundType,
    stageName: data.stageName,
    stage1Total: data.stage1Total,
    stage2Total: data.stage2Total,
    eliminated: data.eliminated,
    eliminationRank: data.eliminationRank,
    relayNumber: data.relayNumber,
  };
}

export function mapResponseToFinalBoardLaneData(data: LaneControlStateDto): FinalBoardLaneData {
  return {
    id: data.id,
    channel: data.channel,
    playerName: data.player?.name ?? 'Unregistered',
    affiliation: data.player?.affiliation ?? '',
    unifiedPhase: data.unifiedPhase,
    stageName: data.stageName,
    stageIndex: data.stageIndex,
    remainingTime: data.remainingTime,
    stage1Shots: data.matchShots.slice(0, 10),
    stage2Shots: data.matchShots.slice(10),
    preparationShots: data.preparationShots,
    shootoffShots: data.shootoffShots,
    stage1Total: data.stage1Total,
    stage2Total: data.stage2Total,
    totalScore: data.totalScore,
    eliminated: data.eliminated,
    eliminationRank: data.eliminationRank,
  };
}
