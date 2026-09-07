import type { CompetitionTypeDefinition } from '@/shared/competitionTypes';

export interface ObservedQualificationSeries {
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly scoresX10: readonly number[];
  readonly totalX10: number;
}

/** Keep absent shot slots in their own series. Zero placeholders carry no invented shot evidence. */
export function layoutQualificationScoreSeries(
  definition: CompetitionTypeDefinition,
  observed: readonly ObservedQualificationSeries[],
): ObservedQualificationSeries[] {
  const layout = definition.config.stages.flatMap((stage, stageIndex) =>
    stage.type !== 'match'
      ? []
      : stage.series.flatMap((series, seriesIndex) =>
          series.purpose === 'POSITION_CHANGE_AND_SIGHTING' ? [] : [{ stageIndex, seriesIndex, shots: series.shots }],
        ),
  );
  if (
    layout.length !== definition.resultFormat.totalSeries ||
    layout.some((series) => !Number.isInteger(series.shots) || series.shots < 1) ||
    layout.reduce((sum, series) => sum + series.shots, 0) !== definition.resultFormat.totalShots
  )
    throw new Error('The Qualification Rule Pack has an inconsistent result layout');
  const key = (series: { stageIndex: number; seriesIndex: number }) => `${series.stageIndex}:${series.seriesIndex}`;
  const expected = new Set(layout.map(key));
  const byPosition = new Map<string, ObservedQualificationSeries>();
  for (const series of observed) {
    const position = key(series);
    if (!expected.has(position) || byPosition.has(position))
      throw new Error('Lane score contains an unknown or duplicate Qualification series');
    byPosition.set(position, series);
  }
  return layout.map((series) => {
    const current = byPosition.get(key(series));
    const scoresX10 = [...(current?.scoresX10 ?? [])];
    if (scoresX10.length > series.shots) throw new Error('Lane score exceeds the declared series shot limit');
    while (scoresX10.length < series.shots) scoresX10.push(0);
    return {
      stageIndex: series.stageIndex,
      seriesIndex: series.seriesIndex,
      scoresX10,
      totalX10: current?.totalX10 ?? 0,
    };
  });
}
