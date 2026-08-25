import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { LaneControl } from '../../domain/LaneControl';

export function emitLaneControlUpdated(eventBus: IEventBus, lane: LaneControl): void {
  eventBus.emit({
    type: 'LaneControlUpdated',
    timestamp: Date.now(),
    laneId: lane.id,
    channel: lane.channel.value,
    playerName: lane.player?.name ?? null,
    affiliation: lane.player?.affiliation ?? null,
    participantId: lane.player?.participantId ?? null,
    relayNumber: lane.relayNumber,
    phase: lane.phase,
    remainingTime: lane.remainingTime,
    shotNumber: lane.displayShotCount,
    lastScore: lane.lastScore,
    lastShotTime: lane.lastShotTime,
    seriesScores: lane.displaySeriesScores,
    totalScore: lane.displayTotalScore,
    recentShots: lane.recentShots,
    matchShots: lane.matchShots.map((s) => s.score.value),
    stageIndex: lane.stageIndex,
    seriesIndex: lane.seriesIndex,
    roundType: lane.config.roundType,
    unifiedPhase: lane.phase,
    stageName: lane.currentStageName,
    stage1Total: lane.stage1Total,
    stage2Total: lane.stage2Total,
    eliminated: lane.eliminated,
    eliminationRank: lane.eliminationRank,
  });
}
