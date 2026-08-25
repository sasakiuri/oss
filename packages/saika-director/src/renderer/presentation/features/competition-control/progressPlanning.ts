// SPDX-License-Identifier: MIT
import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

export interface AdvanceSeriesSource {
  stageIndex: number;
  fromSeriesIndex: number;
  resumeOnly?: boolean;
}

/**
 * Selects the oldest scored-series position that can safely resume or advance.
 *
 * After a partial broadcast, some Lanes can already be at the destination while
 * others remain at the source. A Lane can also have persisted the destination
 * while still waiting for StartNextSeries. Choosing the oldest actionable
 * position lets Lane-side preconditions advance only lagging Lanes and resume
 * only the missing transition on leading Lanes.
 */
export function findAdvanceSeriesSource(
  lanes: DirectorLaneSnapshotDto[],
  competitionId: string,
): AdvanceSeriesSource | null {
  const candidates = lanes
    .map((lane) => lane.competitionState)
    .filter(
      (state): state is NonNullable<typeof state> =>
        state?.competitionId === competitionId &&
        state.currentStage.scored &&
        (state.awaitingSeriesStart === true ||
          (state.phase === 'SERIES_COMPLETE' && state.currentSeries.index + 1 < state.currentStage.totalSeries)),
    )
    .sort((a, b) => a.currentStage.index - b.currentStage.index || a.currentSeries.index - b.currentSeries.index);

  const source = candidates[0];
  if (!source) return null;

  const resumeOnly = candidates.some(
    (candidate) =>
      candidate.currentStage.index === source.currentStage.index &&
      candidate.currentSeries.index === source.currentSeries.index &&
      candidate.awaitingSeriesStart === true,
  );
  return {
    stageIndex: source.currentStage.index,
    fromSeriesIndex: source.currentSeries.index,
    ...(resumeOnly ? { resumeOnly: true } : {}),
  };
}
