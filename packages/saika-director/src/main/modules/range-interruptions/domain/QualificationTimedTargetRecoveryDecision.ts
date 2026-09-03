import type {
  QualificationTimedTargetInterruptionRecommendation,
  QualificationTimedTargetSeriesRecoveryRecommendation,
} from '@sasakiuri/saika-rules';

export interface QualificationTimedTargetAuthorizedRecovery {
  readonly extraSightingSeriesShots: number;
  readonly seriesRecovery: QualificationTimedTargetSeriesRecoveryRecommendation;
}

export class QualificationTimedTargetRecoveryDecision {
  private constructor(
    readonly id: string,
    readonly caseId: string,
    readonly supersedesDecisionId: string | null,
    readonly recommendation: QualificationTimedTargetInterruptionRecommendation,
    readonly authorizedRecovery: QualificationTimedTargetAuthorizedRecovery,
    readonly followsRecommendation: boolean,
    readonly statement: string,
    readonly officialName: string,
    readonly incidentReportReference: string,
    readonly ruleReference: string,
    readonly decidedAt: Date,
    readonly recordedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    caseId: string;
    supersedesDecisionId?: string;
    recommendation: QualificationTimedTargetInterruptionRecommendation;
    authorizedRecovery: QualificationTimedTargetAuthorizedRecovery;
    statement: string;
    officialName: string;
    incidentReportReference: string;
    ruleReference: string;
    decidedAt?: Date;
    recordedAt?: Date;
  }): QualificationTimedTargetRecoveryDecision {
    const recommendation = deepFreeze(clone(props.recommendation));
    const authorizedRecovery = validateAuthorizedRecovery(props.authorizedRecovery);
    return new QualificationTimedTargetRecoveryDecision(
      props.id ? requiredText(props.id, 'id') : crypto.randomUUID(),
      requiredText(props.caseId, 'caseId'),
      optionalText(props.supersedesDecisionId),
      recommendation,
      authorizedRecovery,
      authorizationMatchesRecommendation(authorizedRecovery, recommendation),
      requiredText(props.statement, 'statement'),
      requiredText(props.officialName, 'officialName'),
      requiredText(props.incidentReportReference, 'incidentReportReference'),
      requiredText(props.ruleReference, 'ruleReference'),
      validDate(props.decidedAt ?? new Date(), 'decidedAt'),
      validDate(props.recordedAt ?? new Date(), 'recordedAt'),
    );
  }

  static reconstruct(props: {
    id: string;
    caseId: string;
    supersedesDecisionId: string | null;
    recommendation: QualificationTimedTargetInterruptionRecommendation;
    authorizedRecovery: QualificationTimedTargetAuthorizedRecovery;
    followsRecommendation: boolean;
    statement: string;
    officialName: string;
    incidentReportReference: string;
    ruleReference: string;
    decidedAt: Date;
    recordedAt: Date;
  }): QualificationTimedTargetRecoveryDecision {
    const value = QualificationTimedTargetRecoveryDecision.create({
      id: props.id,
      caseId: props.caseId,
      ...(props.supersedesDecisionId ? { supersedesDecisionId: props.supersedesDecisionId } : {}),
      recommendation: props.recommendation,
      authorizedRecovery: props.authorizedRecovery,
      statement: props.statement,
      officialName: props.officialName,
      incidentReportReference: props.incidentReportReference,
      ruleReference: props.ruleReference,
      decidedAt: props.decidedAt,
      recordedAt: props.recordedAt,
    });
    if (value.followsRecommendation !== props.followsRecommendation) {
      throw new Error(`Stored Qualification recovery decision ${props.id} has inconsistent recommendation state`);
    }
    return value;
  }
}

function validateAuthorizedRecovery(
  input: QualificationTimedTargetAuthorizedRecovery,
): QualificationTimedTargetAuthorizedRecovery {
  const value = clone(input);
  nonNegativeInteger(value.extraSightingSeriesShots, 'extraSightingSeriesShots');
  const recovery = value.seriesRecovery;
  switch (recovery.treatment) {
    case 'KEEP_RECORDED_SERIES':
      if (recovery.shotsToFire !== 0 || recovery.execution !== null) {
        throw new Error('KEEP_RECORDED_SERIES must not authorize recovery shots');
      }
      break;
    case 'ANNUL_AND_REPEAT':
      positiveInteger(recovery.shotsToFire, 'seriesRecovery.shotsToFire');
      if (recovery.execution.mode !== 'SAME_TIMED_TARGET_PROGRAM') {
        throw new Error('ANNUL_AND_REPEAT must use the same timed-target program');
      }
      break;
    case 'COMPLETE_REMAINING_SHOTS':
      nonNegativeInteger(recovery.shotsToFire, 'seriesRecovery.shotsToFire');
      if (recovery.execution.mode === 'SECONDS_PER_SHOT') {
        positiveInteger(recovery.execution.secondsPerShot, 'seriesRecovery.execution.secondsPerShot');
        if (recovery.execution.totalSeconds !== recovery.execution.secondsPerShot * recovery.shotsToFire) {
          throw new Error('seriesRecovery.execution.totalSeconds must equal secondsPerShot multiplied by shotsToFire');
        }
      }
      break;
  }
  return deepFreeze(value);
}

function authorizationMatchesRecommendation(
  authorized: QualificationTimedTargetAuthorizedRecovery,
  recommendation: QualificationTimedTargetInterruptionRecommendation,
): boolean {
  return (
    authorized.extraSightingSeriesShots === recommendation.extraSighting.shots &&
    JSON.stringify(authorized.seriesRecovery) === JSON.stringify(recommendation.seriesRecovery)
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function optionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

function nonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}
