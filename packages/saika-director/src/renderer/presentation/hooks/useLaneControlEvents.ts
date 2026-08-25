import { useCallback, useRef } from 'react';
import { useEvent } from './useEvent';
import { useLaneControlStore } from '@/renderer/presentation/stores/domain/laneControl.store';
import type { LaneControlDto } from '@/renderer/presentation/stores/domain/laneControl.store';
import type { LanePhase } from '@/shared/constants/competition';
import { Logger } from '@/shared/utils/Logger';

const logger = Logger.create('useLaneControlEvents');

/**
 * Hook that subscribes to lane-control IPC events and updates the
 * unified lane control store.
 *
 * Extracted to centralise event handling.
 * Covers:
 *  - laneControlUpdated  -> store.updateLane
 *  - laneControlPatched  -> store.patchLane (with sequence tracking)
 *  - laneTimerTick       -> store.updateLaneTimer
 *  - laneTimerExpired    -> store.updateLaneTimer(0)
 */
export function useLaneControlEvents(loadState: () => Promise<void>): void {
  const updateLane = useLaneControlStore((s) => s.updateLane);
  const updateLaneTimer = useLaneControlStore((s) => s.updateLaneTimer);
  const patchLane = useLaneControlStore((s) => s.patchLane);
  const getLaneById = useLaneControlStore((s) => s.getLaneById);

  const lastSeqByLaneRef = useRef(new Map<string, number>());

  const performFullSync = useCallback(
    async (reason: string) => {
      logger.info(`Triggering full sync: ${reason}`);
      try {
        await loadState();
        logger.info('Full sync completed.');
      } catch (error) {
        logger.error('Full sync failed:', error);
      }
    },
    [loadState],
  );

  // --- laneTimerTick ---
  useEvent('laneTimerTick', async (data) => {
    const result = updateLaneTimer(data.laneId, data.remainingTime, data.phase as LanePhase);
    if (result.needsFullSync) {
      await performFullSync(`Lane ${data.laneId} not found during timer tick`);
    }
  });

  // --- laneTimerExpired ---
  useEvent('laneTimerExpired', async (data) => {
    const result = updateLaneTimer(data.laneId, 0, data.phase as LanePhase);
    if (result.needsFullSync) {
      await performFullSync(`Lane ${data.laneId} not found during timer expired`);
    }
  });

  // --- laneControlUpdated ---
  useEvent('laneControlUpdated', (data) => {
    const existingLane = getLaneById(data.laneId);
    const participantId =
      data.participantId === undefined ? existingLane?.participantId : (data.participantId ?? undefined);

    updateLane({
      id: data.laneId,
      channel: data.channel,
      playerName: data.playerName,
      affiliation: data.affiliation,
      participantId,
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
      relayNumber: data.relayNumber ?? existingLane?.relayNumber ?? 1,
    });
  });

  // --- laneControlPatched ---
  useEvent('laneControlPatched', async (data) => {
    // Skip patches without unified model fields unless the lane exists in the store
    if (data.patch.unifiedPhase === undefined && data.patch.stageIndex === undefined) {
      const existing = getLaneById(data.laneId);
      if (!existing) return;
    }

    const receivedSeq = data.seq;
    const lastSeq = lastSeqByLaneRef.current.get(data.laneId);

    if (lastSeq !== undefined && lastSeq + 1 !== receivedSeq) {
      logger.warn(`Patch sequence gap for lane ${data.laneId}: expected ${lastSeq + 1}, received ${receivedSeq}`);
      await performFullSync(`Sequence gap detected for lane ${data.laneId}`);
    } else {
      const { participantId, ...rest } = data.patch;
      const normalizedPatch: Partial<LaneControlDto> = {
        ...rest,
        ...(participantId !== undefined ? { participantId: participantId ?? undefined } : {}),
      };
      const result = patchLane(data.laneId, normalizedPatch);
      if (result.needsFullSync) {
        await performFullSync(`Lane ${data.laneId} not found during patch`);
      }
    }

    lastSeqByLaneRef.current.set(data.laneId, receivedSeq);
  });
}
