import { validateEstComplaintCapability } from '../EstComplaint';
import { validateQualificationMalfunctionCapability } from '../QualificationMalfunction';
import type { RulePack } from '../RulePack';

import { validateFinalSeriesAdjudication, validateFiringWindowReview } from './adjudication';
import { validateCommands } from './commands';
import { validateCourseOfFire } from './courseOfFire';
import { validateIsoDate, validatePositiveInteger, validateText } from './primitives';
import { validateFinalRankingCheckpoints, validateShotResultProjection } from './ranking';
import { validateTimedTargetCapability } from './timedTarget';

export function defineRulePack(pack: RulePack): RulePack {
  if (pack.capabilities.estComplaints) validateEstComplaintCapability(pack.capabilities.estComplaints);
  validateText(pack.id, 'id');
  validateText(pack.eventCode, 'eventCode');
  validateText(pack.displayName, 'displayName');
  validateText(pack.discipline, 'discipline');
  validateText(pack.authority.organization, 'authority.organization');
  validateText(pack.authority.edition, 'authority.edition');
  validateText(pack.capabilities.target.scoringProfileId, 'target.scoringProfileId');
  if (pack.capabilities.target.scoringGaugeProfileId !== undefined) {
    validateText(pack.capabilities.target.scoringGaugeProfileId, 'target.scoringGaugeProfileId');
  }
  validateIsoDate(pack.authority.effectiveFrom, 'authority.effectiveFrom');
  if (pack.authority.effectiveUntil) {
    validateIsoDate(pack.authority.effectiveUntil, 'authority.effectiveUntil');
    if (pack.authority.effectiveUntil < pack.authority.effectiveFrom) {
      throw new Error('authority.effectiveUntil must not precede authority.effectiveFrom');
    }
  }

  validateCourseOfFire(pack);
  validateFinalRankingCheckpoints(pack);
  validateShotResultProjection(pack);
  const publication = pack.capabilities.publication;
  if (
    publication &&
    (!Number.isInteger(publication.scoreProtestWindowSeconds) || publication.scoreProtestWindowSeconds <= 0)
  ) {
    throw new Error('publication.scoreProtestWindowSeconds must be a positive integer');
  }
  const eliminationPlanning = pack.capabilities.outdoorEliminationPlanning;
  if (eliminationPlanning) {
    if (pack.round !== 'ELIMINATION') {
      throw new Error('outdoorEliminationPlanning is valid only for an ELIMINATION Rule Pack');
    }
    if (eliminationPlanning.minimumQualificationAthletes !== undefined) {
      validatePositiveInteger(
        eliminationPlanning.minimumQualificationAthletes,
        'outdoorEliminationPlanning.minimumQualificationAthletes',
      );
    }
    validatePositiveInteger(
      eliminationPlanning.preferredDaysBeforeQualification,
      'outdoorEliminationPlanning.preferredDaysBeforeQualification',
    );
  }
  validateCommands(pack);
  validateFiringWindowReview(pack);
  validateFinalSeriesAdjudication(pack);
  validateTimedTargetCapability(pack);
  if (pack.capabilities.qualificationMalfunction) {
    validateQualificationMalfunctionCapability(pack.capabilities.qualificationMalfunction, {
      round: pack.round,
      stages: pack.capabilities.courseOfFire.stages,
    });
  }
  return deepFreeze(pack);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
