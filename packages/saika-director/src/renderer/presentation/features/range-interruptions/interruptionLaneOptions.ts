import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

import type { RangeInterruptionLaneOption } from './interruptionPresentationTypes';

/** A Lane as the interruption forms offer it, with its retained interruption state and current series snapshot. */
export function interruptionLaneOption(lane: DirectorLaneSnapshotDto, label: string): RangeInterruptionLaneOption {
  return {
    laneId: lane.laneId,
    label,
    firingPointNumber: lane.firingPointNumber,
    ...(lane.assignment?.athlete ? { athleteName: lane.assignment.athlete.name } : {}),
    ...(lane.competitionState?.interruption ? { interruption: lane.competitionState.interruption } : {}),
    ...(lane.competitionState
      ? {
          seriesSnapshot: {
            stageIndex: lane.competitionState.currentStage.index,
            seriesIndex: lane.competitionState.currentSeries.index,
            recordedShots: lane.competitionState.currentSeries.shotsRecorded,
            maxShots: lane.competitionState.currentSeries.maxShots,
            seriesComplete: lane.competitionState.phase === 'SERIES_COMPLETE',
            capturedAt: lane.competitionState.publishedAt,
          },
        }
      : {}),
  };
}
