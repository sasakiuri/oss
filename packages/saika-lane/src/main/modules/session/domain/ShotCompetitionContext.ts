// SPDX-License-Identifier: MIT

/** Competition coordinates captured before shot recording changes its progress. */
export interface ShotCompetitionContext {
  readonly competitionId: string;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  /** Only normal ATHLETE classification may supply an observed target mode. */
  readonly athleteModeObserved?: true;
}

export function parseShotCompetitionContext(value: unknown): ShotCompetitionContext {
  if (typeof value !== 'object' || value === null) throw new Error('Shot competition context is invalid');
  const context = value as Record<string, unknown>;
  if (
    typeof context.competitionId !== 'string' ||
    context.competitionId.length === 0 ||
    !Number.isInteger(context.stageIndex) ||
    (context.stageIndex as number) < 0 ||
    !Number.isInteger(context.seriesIndex) ||
    (context.seriesIndex as number) < 0 ||
    (context.athleteModeObserved !== undefined && context.athleteModeObserved !== true)
  )
    throw new Error('Shot competition context is invalid');
  return Object.freeze({
    competitionId: context.competitionId,
    stageIndex: context.stageIndex as number,
    seriesIndex: context.seriesIndex as number,
    ...(context.athleteModeObserved === true ? { athleteModeObserved: true as const } : {}),
  });
}
