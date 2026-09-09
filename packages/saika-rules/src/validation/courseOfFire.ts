import type { RulePack } from '../RulePack';

import { validateText } from './primitives';

export function validateCourseOfFire(pack: RulePack): void {
  const stages = pack.capabilities.courseOfFire.stages;
  if (stages.length === 0) throw new Error('courseOfFire.stages must not be empty');
  for (const stage of stages) {
    validateText(stage.id, 'stage.id');
    validateText(stage.name, 'stage.name');
    if (stage.series.length === 0) throw new Error(`Stage ${stage.id} must contain a series`);
    if (!Number.isInteger(stage.timer.durationSeconds) || stage.timer.durationSeconds <= 0) {
      throw new Error(`Stage ${stage.id} timer duration must be a positive integer`);
    }
    for (const series of stage.series) {
      if (!Number.isInteger(series.shots) || series.shots < 0) {
        throw new Error(`Stage ${stage.id} series shots must be a non-negative integer`);
      }
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
      if (!Number.isInteger(stage.elimination.athletesPerCheckpoint) || stage.elimination.athletesPerCheckpoint <= 0) {
        throw new Error(`Stage ${stage.id} athletesPerCheckpoint must be a positive integer`);
      }
      if (
        stage.elimination.checkpointEverySeries !== undefined &&
        (!Number.isInteger(stage.elimination.checkpointEverySeries) || stage.elimination.checkpointEverySeries <= 0)
      ) {
        throw new Error(`Stage ${stage.id} checkpointEverySeries must be a positive integer`);
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
