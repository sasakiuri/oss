// SPDX-License-Identifier: MIT

import type { RoundConfig } from '@/main/modules/competition/domain/CompetitionTypeDefinition';
import type { Shot } from '@/main/modules/session/domain/Shot';

export interface CompetitionShotPlacement {
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly shotNumberInSeries: number;
}

/** Uses captured competition coordinates, independently of Session score groups. */
export function resolveCompetitionShotPlacement(
  shot: Shot,
  allShots: readonly Shot[],
  competition: { id: string; config: RoundConfig },
): CompetitionShotPlacement {
  const context = shot.competitionContext;
  if (!context || context.competitionId !== competition.id) {
    throw new Error(`Shot ${shot.id} has no verified placement in competition ${competition.id}`);
  }
  const stage = competition.config.stages[context.stageIndex];
  if (!stage?.series[context.seriesIndex]) throw new Error(`Shot ${shot.id} has invalid competition coordinates`);
  const shotsInSeries = allShots
    .filter(
      (candidate) =>
        candidate.mode.value === shot.mode.value &&
        candidate.competitionContext?.competitionId === context.competitionId &&
        candidate.competitionContext.stageIndex === context.stageIndex &&
        candidate.competitionContext.seriesIndex === context.seriesIndex,
    )
    .sort((left, right) => left.shotNumber - right.shotNumber);
  const index = shotsInSeries.findIndex((candidate) => candidate.id === shot.id);
  if (index < 0) throw new Error(`Shot ${shot.id} is absent from its session history`);
  return { stageIndex: context.stageIndex, seriesIndex: context.seriesIndex, shotNumberInSeries: index + 1 };
}
