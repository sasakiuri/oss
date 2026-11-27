import type { RulePack } from '../RulePack';

import { validateNonNegativeInteger, validatePositiveInteger, validateText } from './primitives';

export function validateCourseOfFire(pack: RulePack): void {
  const stages = pack.capabilities.courseOfFire.stages;
  if (stages.length === 0) throw new Error('courseOfFire.stages must not be empty');
  for (const stage of stages) {
    validateText(stage.id, 'stage.id');
    validateText(stage.name, 'stage.name');
    if (stage.series.length === 0) throw new Error(`Stage ${stage.id} must contain a series`);
    validatePositiveInteger(stage.timer.durationSeconds, `Stage ${stage.id} timer duration`);
    for (const series of stage.series) {
      validateNonNegativeInteger(series.shots, `Stage ${stage.id} series shots`);
      if (series.label !== undefined) validateText(series.label, `Stage ${stage.id} series label`);
      if (stage.phase === 'MATCH' && series.shots === 0 && series.purpose !== 'POSITION_CHANGE_AND_SIGHTING') {
        throw new Error(`Match stage ${stage.id} can use zero shots only for position change and sighting`);
      }
      if (series.purpose === 'POSITION_CHANGE_AND_SIGHTING') {
        if (stage.phase !== 'MATCH' || series.shots !== 0 || !series.position) {
          throw new Error(`Stage ${stage.id} position-change series requires a MATCH stage, zero shots, and position`);
        }
      }
      if (series.timedTargetProgramId !== undefined) {
        validateText(series.timedTargetProgramId, `Stage ${stage.id} timedTargetProgramId`);
      }
    }
    if (stage.targetProfileId !== undefined) validateText(stage.targetProfileId, `Stage ${stage.id} targetProfileId`);
    if (stage.scoringGaugeProfileId !== undefined) {
      validateText(stage.scoringGaugeProfileId, `Stage ${stage.id} scoringGaugeProfileId`);
    }
    if (stage.sightingTimedTargetProgramId !== undefined) {
      validateText(stage.sightingTimedTargetProgramId, `Stage ${stage.id} sightingTimedTargetProgramId`);
    }
    if (stage.elimination) {
      validatePositiveInteger(stage.elimination.athletesPerCheckpoint, `Stage ${stage.id} athletesPerCheckpoint`);
      if (stage.elimination.checkpointEverySeries !== undefined) {
        validatePositiveInteger(stage.elimination.checkpointEverySeries, `Stage ${stage.id} checkpointEverySeries`);
      }
    }
  }

  const totalShots = stages
    .filter((stage) => stage.phase === 'MATCH')
    .flatMap((stage) => stage.series)
    .reduce((sum, series) => sum + series.shots, 0);
  const totalSeries = stages
    .filter((stage) => stage.phase === 'MATCH')
    .flatMap((stage) => stage.series)
    .filter((series) => (series.purpose ?? 'MATCH') === 'MATCH').length;
  if (pack.capabilities.ranking.totalShots !== totalShots) {
    throw new Error(`ranking.totalShots must equal the course of fire total (${totalShots})`);
  }
  if (pack.capabilities.ranking.totalSeries !== totalSeries) {
    throw new Error(`ranking.totalSeries must equal the course of fire total (${totalSeries})`);
  }
}
