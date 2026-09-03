// SPDX-License-Identifier: MIT

import type { RoundConfig } from '@/main/modules/competition/domain/CompetitionTypeDefinition';
import type { Shot } from '@/main/modules/session/domain/Shot';

export interface CompetitionShotPlacement {
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly shotNumberInSeries: number;
}

/**
 * Resolves MQTT competition coordinates from immutable session history.
 * Shot.shotNumber is session-global, so it must never be exposed as a
 * shotNumberInSeries value.
 */
export function resolveCompetitionShotPlacement(
  shot: Shot,
  allShots: readonly Shot[],
  config: RoundConfig,
  fallbackStageIndex: number,
  fallbackSeriesIndex: number,
): CompetitionShotPlacement {
  const shotsInSeries = allShots
    .filter((candidate) => candidate.mode.value === shot.mode.value && candidate.seriesNumber === shot.seriesNumber)
    .sort((left, right) => left.shotNumber - right.shotNumber);
  const historyIndex = shotsInSeries.findIndex((candidate) => candidate.id === shot.id);
  const shotNumberInSeries = historyIndex >= 0 ? historyIndex + 1 : Math.max(1, shotsInSeries.length);

  if (!shot.mode.isMatch() || shot.seriesNumber < 1) {
    return { stageIndex: fallbackStageIndex, seriesIndex: fallbackSeriesIndex, shotNumberInSeries };
  }

  let remainingSeriesIndex = shot.seriesNumber - 1;
  for (let stageIndex = 0; stageIndex < config.stages.length; stageIndex += 1) {
    const stage = config.stages[stageIndex]!;
    if (!stage.scored) continue;
    for (let seriesIndex = 0; seriesIndex < stage.series.length; seriesIndex += 1) {
      const series = stage.series[seriesIndex]!;
      if (series.maxShots === 0 || series.purpose === 'POSITION_CHANGE_AND_SIGHTING') continue;
      if (remainingSeriesIndex === 0) return { stageIndex, seriesIndex, shotNumberInSeries };
      remainingSeriesIndex -= 1;
    }
  }

  return { stageIndex: fallbackStageIndex, seriesIndex: fallbackSeriesIndex, shotNumberInSeries };
}
