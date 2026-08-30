// SPDX-License-Identifier: MIT
import type { RulePack, RuleStage } from '@sasakiuri/saika-rules';

import type { CompetitionTypeDefinition, SeriesDefinition } from './CompetitionTypeDefinition';

/** Adapts application-neutral rule capabilities to Lane's local state machine. */
export function competitionTypeFromRulePack(pack: RulePack): CompetitionTypeDefinition {
  const stages = pack.capabilities.courseOfFire.stages;
  const shotsPerSeries = stages
    .filter((stage) => stage.phase === 'MATCH')
    .flatMap((stage) => stage.series)
    .find((series) => series.shots > 0)?.shots;
  if (shotsPerSeries === undefined) throw new Error(`Rule Pack ${pack.id} has no scored series`);

  return {
    id: pack.eventCode,
    name: pack.displayName,
    rulePackId: pack.id,
    discipline: pack.discipline,
    config: {
      name: pack.round === 'QUALIFICATION' ? 'Qualification' : 'Final',
      shotsPerSeries,
      acc: pack.capabilities.scoring.mode,
      stages: stages.map((stage) => ({
        name: stage.name,
        scored: stage.phase === 'MATCH',
        series: stage.series.map((series) => toSeriesDefinition(stage, series.shots)),
        ...(stage.timer.mode === 'stage' ? { timer: { durationSeconds: stage.timer.durationSeconds } } : {}),
        requiresNewSession: stage.requiresNewSession,
      })),
    },
  };
}

function toSeriesDefinition(stage: RuleStage, maxShots: number): SeriesDefinition {
  switch (stage.timer.mode) {
    case 'series':
      return { maxShots, timer: { durationSeconds: stage.timer.durationSeconds } };
    case 'shot':
      return { maxShots, shotTimer: { durationSeconds: stage.timer.durationSeconds } };
    case 'stage':
      return { maxShots };
  }
}
