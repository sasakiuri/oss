import type { EventTransformer } from '@/main/shared-infra/ipc/EventForwardingRule';
import { eventsContract } from '@/shared/ipc/contracts';
import type { LaneControlIpcPayload } from '@/shared/types/LaneControlIpcPayload';

import type { LaneControlUpdated } from '../domain/events';

import { DiffCalculator } from './DiffCalculator';

const MAX_SEQ = 0xffffffff;

/** Sends a Lane's full state once, then only the changed fields with a per-Lane sequence number. */
export class LaneControlUpdatedTransformer implements EventTransformer<'LaneControlUpdated'> {
  private diffCalculator = new DiffCalculator<LaneControlIpcPayload>();
  private seqMap = new Map<string, number>();

  forward(e: LaneControlUpdated, send: (ch: string, data: unknown) => void): void {
    const current = this.extractPayload(e);
    const { isInitial, patch } = this.diffCalculator.calculateDiff(e.laneId, current);

    if (isInitial) {
      send(eventsContract.channels.laneControlUpdated, {
        laneId: e.laneId,
        ...current,
      });
    } else if (Object.keys(patch).length > 0) {
      const seq = this.getNextSequenceNumber(e.laneId);
      send(eventsContract.channels.laneControlPatched, {
        laneId: e.laneId,
        seq,
        patch,
      });
    }
  }

  cleanup(): void {
    this.diffCalculator.clearAll();
    this.seqMap.clear();
  }

  private extractPayload(event: LaneControlIpcPayload): LaneControlIpcPayload {
    return {
      channel: event.channel,
      playerName: event.playerName,
      affiliation: event.affiliation,
      participantId: event.participantId,
      relayNumber: event.relayNumber,
      phase: event.phase,
      remainingTime: event.remainingTime,
      shotNumber: event.shotNumber,
      lastScore: event.lastScore,
      lastShotTime: event.lastShotTime,
      seriesScores: event.seriesScores,
      totalScore: event.totalScore,
      recentShots: event.recentShots,
      matchShots: event.matchShots,
      stageIndex: event.stageIndex,
      seriesIndex: event.seriesIndex,
      roundType: event.roundType,
      unifiedPhase: event.unifiedPhase,
      stageName: event.stageName,
      stage1Total: event.stage1Total,
      stage2Total: event.stage2Total,
      eliminated: event.eliminated,
      eliminationRank: event.eliminationRank,
    };
  }

  private getNextSequenceNumber(laneId: string): number {
    const seq = ((this.seqMap.get(laneId) ?? 0) + 1) % MAX_SEQ;
    this.seqMap.set(laneId, seq);
    return seq;
  }
}
