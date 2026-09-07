// SPDX-License-Identifier: MIT
import { identifyRulePack, type RulePack, type RuleStage } from '@sasakiuri/saika-rules';

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
    rulePackIdentity: identifyRulePack(pack),
    discipline: pack.discipline,
    targetProfileId: pack.capabilities.target.scoringProfileId,
    ...(pack.capabilities.target.scoringGaugeProfileId
      ? { scoringGaugeProfileId: pack.capabilities.target.scoringGaugeProfileId }
      : {}),
    ...(pack.capabilities.timedTarget ? { timedTarget: pack.capabilities.timedTarget } : {}),
    ...(pack.capabilities.resultProjection ? { resultProjection: pack.capabilities.resultProjection } : {}),
    config: {
      round: pack.round,
      ...(pack.capabilities.estComplaints ? { estComplaints: pack.capabilities.estComplaints } : {}),
      rulePackIdentity: identifyRulePack(pack),
      ...(pack.capabilities.qualificationMalfunction
        ? { qualificationMalfunction: pack.capabilities.qualificationMalfunction }
        : {}),
      name: pack.round === 'ELIMINATION' ? 'Elimination' : pack.round === 'QUALIFICATION' ? 'Qualification' : 'Final',
      shotsPerSeries,
      acc: pack.capabilities.scoring.mode,
      targetProfileId: pack.capabilities.target.scoringProfileId,
      ...(pack.capabilities.target.scoringGaugeProfileId
        ? { scoringGaugeProfileId: pack.capabilities.target.scoringGaugeProfileId }
        : {}),
      ...(pack.capabilities.timedTarget ? { timedTarget: pack.capabilities.timedTarget } : {}),
      ...(pack.capabilities.resultProjection ? { resultProjection: pack.capabilities.resultProjection } : {}),
      stages: stages.map((stage) => ({
        id: stage.id,
        name: stage.name,
        scored: stage.phase === 'MATCH',
        series: stage.series.map((series) => toSeriesDefinition(stage, series)),
        ...(stage.timer.mode === 'stage' && !stage.series.some((series) => series.timedTargetProgramId)
          ? { timer: { durationSeconds: stage.timer.durationSeconds } }
          : {}),
        requiresNewSession: stage.requiresNewSession,
        ...(stage.seriesTransition ? { seriesTransition: stage.seriesTransition } : {}),
        ...(stage.targetProfileId ? { targetProfileId: stage.targetProfileId } : {}),
        ...(stage.scoringGaugeProfileId ? { scoringGaugeProfileId: stage.scoringGaugeProfileId } : {}),
        ...(stage.sightingTimedTargetProgramId
          ? { sightingTimedTargetProgramId: stage.sightingTimedTargetProgramId }
          : {}),
      })),
    },
  };
}

function toSeriesDefinition(stage: RuleStage, series: RuleStage['series'][number]): SeriesDefinition {
  const metadata = {
    ...(series.label ? { label: series.label } : {}),
    ...(series.position ? { position: series.position } : {}),
    ...(series.purpose ? { purpose: series.purpose } : {}),
    ...(series.targetModeControl ? { targetModeControl: series.targetModeControl } : {}),
    ...(series.timedTargetProgramId ? { timedTargetProgramId: series.timedTargetProgramId } : {}),
  };
  if (series.timedTargetProgramId) return { maxShots: series.shots, ...metadata };
  switch (stage.timer.mode) {
    case 'series':
      return { maxShots: series.shots, timer: { durationSeconds: stage.timer.durationSeconds }, ...metadata };
    case 'shot':
      return { maxShots: series.shots, shotTimer: { durationSeconds: stage.timer.durationSeconds }, ...metadata };
    case 'stage':
      return { maxShots: series.shots, ...metadata };
  }
}
