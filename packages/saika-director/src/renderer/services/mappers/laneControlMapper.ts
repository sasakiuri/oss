import type { LaneControlDto } from '@/renderer/presentation/stores/domain/laneControl.store';
import type { LanePhase } from '@/shared/constants/competition';
import type { FinalBoardLaneData } from '@/renderer/presentation/features/boards/types';

export function mapResponseToLaneControlDto(data: Record<string, unknown>): LaneControlDto {
  const player = data.player as { name: string; affiliation: string; participantId?: string } | null;
  return {
    id: data.id as string,
    channel: data.channel as number,
    playerName: player?.name ?? null,
    affiliation: player?.affiliation ?? null,
    participantId: player?.participantId,
    phase: data.phase as LanePhase,
    remainingTime: data.remainingTime as number,
    shotNumber: data.shotNumber as number,
    lastScore: data.lastScore as number | null,
    lastShotTime: data.lastShotTime as number | null,
    seriesScores: (data.seriesScores as number[]) ?? [],
    totalScore: data.totalScore as number,
    recentShots: (data.recentShots as number[]) ?? [],
    unifiedPhase: (data.unifiedPhase as string) ?? 'IDLE',
    stageIndex: (data.stageIndex as number) ?? 0,
    seriesIndex: (data.seriesIndex as number) ?? 0,
    roundType: (data.roundType as string) ?? 'Qualification',
    stageName: (data.stageName as string) ?? '',
    stage1Total: (data.stage1Total as number) ?? 0,
    stage2Total: (data.stage2Total as number) ?? 0,
    eliminated: (data.eliminated as boolean) ?? false,
    eliminationRank: (data.eliminationRank as number | null) ?? null,
    relayNumber: (data.relayNumber as number) ?? 1,
  };
}

export function mapResponseToFinalBoardLaneData(data: Record<string, unknown>): FinalBoardLaneData {
  const player = data.player as { name: string; affiliation: string } | null;
  const matchShots = (data.matchShots as number[]) ?? [];
  return {
    id: data.id as string,
    channel: data.channel as number,
    playerName: player?.name ?? 'Unregistered',
    affiliation: player?.affiliation ?? '',
    unifiedPhase: (data.unifiedPhase as string) ?? 'IDLE',
    stageName: (data.stageName as string) ?? '',
    stageIndex: (data.stageIndex as number) ?? 0,
    remainingTime: (data.remainingTime as number) ?? 0,
    stage1Shots: matchShots.slice(0, 10),
    stage2Shots: matchShots.slice(10),
    preparationShots: (data.preparationShots as number[]) ?? [],
    shootoffShots: (data.shootoffShots as number[]) ?? [],
    stage1Total: (data.stage1Total as number) ?? 0,
    stage2Total: (data.stage2Total as number) ?? 0,
    totalScore: (data.totalScore as number) ?? 0,
    eliminated: (data.eliminated as boolean) ?? false,
    eliminationRank: (data.eliminationRank as number | null) ?? null,
  };
}
