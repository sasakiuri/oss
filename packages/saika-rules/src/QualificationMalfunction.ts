export type QualificationMalfunctionClassification = 'ALLOWABLE' | 'NON_ALLOWABLE';

export interface QualificationMalfunctionCauseRule {
  readonly code: string;
  readonly classification: QualificationMalfunctionClassification;
  readonly label: string;
  readonly ruleReference: string;
}

export interface QualificationMalfunctionClaimLimit {
  readonly sightingClaims: 'PROHIBITED';
  readonly maximum: number;
  readonly scope: 'EACH_30_SHOT_STAGE' | 'SIXTY_SHOT_MATCH';
  readonly exceptionalTwoPartMaximumPerPart?: number;
}

export interface QualificationMalfunctionRepairPolicy {
  /** Null means that the original competition clock remains authoritative. */
  readonly maximumSeconds: number | null;
  readonly juryMayExtend: boolean;
  readonly completionScheduling: 'WITHIN_ORIGINAL_COMPETITION_TIME' | 'JURY_DETERMINED_TIME_AND_PLACE';
  readonly replacement: {
    readonly sameTypeAndCalibreRequired: true;
    readonly sameMechanismRequired?: true;
    readonly targetedTestingRequired: true;
  };
  readonly additionalSighting:
    | { readonly policy: 'JURY_MAY_ALLOW'; readonly shots: null }
    | { readonly policy: 'JURY_MUST_ALLOW_SERIES'; readonly shots: number };
  readonly ruleReferences: readonly string[];
}

export type QualificationMalfunctionAllowableTreatment =
  | {
      readonly type: 'CONTINUE_WITHIN_ORIGINAL_TIME';
    }
  | {
      readonly type: 'REPEAT_FULL_SERIES';
      readonly shots: number;
      readonly scoreCombination: 'LOWEST_PER_TARGET' | 'LOWEST_OVERALL';
      readonly scoreCount: number;
      readonly secondMalfunction: 'ZERO_FILL_ROW_WITH_MOST_RECORDED_SHOTS';
      readonly incidentForm: 'RFPM' | 'STDP';
    }
  | {
      readonly type: 'COMPLETE_REMAINING_SHOTS';
      readonly execution:
        | { readonly mode: 'SECONDS_PER_SHOT'; readonly secondsPerShot: number }
        | { readonly mode: 'FIRST_EXPOSURE_OF_NEXT_SERIES' };
      readonly scoreCombination: 'NORMAL_SERIES';
      readonly incidentForm: 'IR';
    };

export interface QualificationMalfunctionStageRule {
  readonly stageId: string;
  readonly allowableTreatment: QualificationMalfunctionAllowableTreatment;
  readonly ruleReference: string;
}

export interface QualificationMalfunctionDocumentationPolicy {
  readonly incidentRecords: readonly ('RANGE_INCIDENT_REPORT' | 'RFPM' | 'STDP')[];
  readonly selection: 'ONE_OF' | 'REQUIRED_FORM';
  readonly rangeRegisterRequired: true;
  readonly ruleReferences: readonly string[];
}

/**
 * Application-neutral firearm-malfunction policy for Elimination and Qualification.
 * It describes the rule but never classifies a real incident or authorizes firing.
 */
export interface QualificationMalfunctionCapability {
  readonly determinationAuthority: 'RANGE_OFFICER' | 'RANGE_OR_JURY_OFFICIAL';
  readonly causes: readonly QualificationMalfunctionCauseRule[];
  /** Omitted when the governing rule specifies no numeric claim allowance. */
  readonly claimLimit?: QualificationMalfunctionClaimLimit;
  readonly repair: QualificationMalfunctionRepairPolicy;
  readonly nonAllowableTreatment: {
    readonly unfiredShots: 'MISS';
    readonly refirePermitted: false;
    readonly completionPermitted: false;
    readonly ruleReference: string;
  };
  readonly stages: readonly QualificationMalfunctionStageRule[];
  readonly documentation: QualificationMalfunctionDocumentationPolicy;
  readonly ruleReferences: readonly string[];
}

export interface QualificationMalfunctionClaimFacts {
  readonly phase: 'SIGHTING' | 'MATCH';
  /** Number of non-void claims already counted in the policy's normal scope. */
  readonly existingClaimsInScope: number;
  /** Present only when the 60-shot match is exceptionally conducted in two parts. */
  readonly exceptionalPart?: {
    readonly existingClaimsInPart: number;
  };
}

export interface QualificationMalfunctionClaimAssessment {
  readonly allowed: boolean;
  readonly maximumInScope: number | null;
  readonly maximumInExceptionalPart: number | null;
  readonly reason:
    'NO_NUMERIC_LIMIT' | 'SIGHTING_CLAIM_PROHIBITED' | 'AVAILABLE' | 'SCOPE_LIMIT_REACHED' | 'PART_LIMIT_REACHED';
}

export interface QualificationMalfunctionSeriesShot {
  readonly shotId: string;
  readonly scoreX10: number;
  /** Required for LOWEST_PER_TARGET and zero-based within the target group. */
  readonly targetIndex?: number;
}

export interface QualificationMalfunctionSeriesRow {
  readonly row: 'ORIGINAL' | 'REPEAT';
  readonly shots: readonly QualificationMalfunctionSeriesShot[];
}

export interface QualificationMalfunctionCountedShot {
  readonly row: QualificationMalfunctionSeriesRow['row'];
  readonly shotId: string | null;
  readonly scoreX10: number;
  readonly targetIndex: number | null;
  readonly addedZero: boolean;
}

export interface QualificationMalfunctionRepeatSettlement {
  readonly scoreCombination: 'LOWEST_PER_TARGET' | 'LOWEST_OVERALL';
  readonly countedShots: readonly QualificationMalfunctionCountedShot[];
  readonly discardedShotIds: readonly string[];
  readonly addedZeros: readonly QualificationMalfunctionCountedShot[];
  readonly totalX10: number;
}

/** Checks a rule-defined claim limit without opening, consuming, or authorizing a claim. */
export function assessQualificationMalfunctionClaim(
  capability: QualificationMalfunctionCapability,
  facts: QualificationMalfunctionClaimFacts,
): QualificationMalfunctionClaimAssessment {
  nonNegativeInteger(facts.existingClaimsInScope, 'existingClaimsInScope');
  if (facts.exceptionalPart) {
    nonNegativeInteger(facts.exceptionalPart.existingClaimsInPart, 'exceptionalPart.existingClaimsInPart');
  }
  const limit = capability.claimLimit;
  if (!limit) {
    return Object.freeze({
      allowed: true,
      maximumInScope: null,
      maximumInExceptionalPart: null,
      reason: 'NO_NUMERIC_LIMIT',
    });
  }
  if (facts.phase === 'SIGHTING') {
    return Object.freeze({
      allowed: false,
      maximumInScope: limit.maximum,
      maximumInExceptionalPart: limit.exceptionalTwoPartMaximumPerPart ?? null,
      reason: 'SIGHTING_CLAIM_PROHIBITED',
    });
  }
  if (facts.existingClaimsInScope >= limit.maximum) {
    return Object.freeze({
      allowed: false,
      maximumInScope: limit.maximum,
      maximumInExceptionalPart: limit.exceptionalTwoPartMaximumPerPart ?? null,
      reason: 'SCOPE_LIMIT_REACHED',
    });
  }
  if (
    facts.exceptionalPart &&
    limit.exceptionalTwoPartMaximumPerPart !== undefined &&
    facts.exceptionalPart.existingClaimsInPart >= limit.exceptionalTwoPartMaximumPerPart
  ) {
    return Object.freeze({
      allowed: false,
      maximumInScope: limit.maximum,
      maximumInExceptionalPart: limit.exceptionalTwoPartMaximumPerPart,
      reason: 'PART_LIMIT_REACHED',
    });
  }
  return Object.freeze({
    allowed: true,
    maximumInScope: limit.maximum,
    maximumInExceptionalPart: limit.exceptionalTwoPartMaximumPerPart ?? null,
    reason: 'AVAILABLE',
  });
}

/**
 * Applies the mechanical RFPM/STDP comparison after an official has already
 * classified an allowable malfunction and authorized the repeat series.
 */
export function settleQualificationMalfunctionRepeat(
  treatment: Extract<QualificationMalfunctionAllowableTreatment, { type: 'REPEAT_FULL_SERIES' }>,
  rows: readonly [QualificationMalfunctionSeriesRow, QualificationMalfunctionSeriesRow],
  secondMalfunctionZeroFillRow?: QualificationMalfunctionSeriesRow['row'],
): QualificationMalfunctionRepeatSettlement {
  const byName = new Map(rows.map((row) => [row.row, row]));
  if (byName.size !== 2 || !byName.has('ORIGINAL') || !byName.has('REPEAT')) {
    throw new Error('Repeat settlement requires one ORIGINAL row and one REPEAT row');
  }
  for (const row of rows) validateSeriesRow(row, treatment);
  const recordedShotIds = rows.flatMap((row) => row.shots.map((shot) => shot.shotId));
  if (new Set(recordedShotIds).size !== recordedShotIds.length) {
    throw new Error('Repeat settlement shot IDs must be unique across both rows');
  }

  const working = rows.map((row) => ({
    row: row.row,
    shots: row.shots.map((shot) => countedShot(row.row, shot)),
  }));
  const repeat = working.find((row) => row.row === 'REPEAT')!;
  if (!secondMalfunctionZeroFillRow && repeat.shots.length !== treatment.shots) {
    throw new Error('A completed repeat row must contain the required number of shots');
  }

  const addedZeros: QualificationMalfunctionCountedShot[] = [];
  if (secondMalfunctionZeroFillRow) {
    const selected = working.find((row) => row.row === secondMalfunctionZeroFillRow)!;
    const other = working.find((row) => row.row !== secondMalfunctionZeroFillRow)!;
    if (selected.shots.length < other.shots.length) {
      throw new Error('Second-malfunction zeros must be added to a row with the most recorded shots');
    }
    if (selected.shots.length >= treatment.scoreCount) {
      throw new Error('Second-malfunction zero fill requires an incomplete selected row');
    }
    if (treatment.scoreCombination === 'LOWEST_PER_TARGET') {
      const occupied = new Set(selected.shots.map((shot) => shot.targetIndex));
      for (let targetIndex = 0; targetIndex < treatment.scoreCount; targetIndex += 1) {
        if (occupied.has(targetIndex)) continue;
        const zero = addedZero(selected.row, targetIndex);
        selected.shots.push(zero);
        addedZeros.push(zero);
      }
    } else {
      while (selected.shots.length < treatment.scoreCount) {
        const zero = addedZero(selected.row, null);
        selected.shots.push(zero);
        addedZeros.push(zero);
      }
    }
  }

  const allShots = working.flatMap((row) => row.shots);
  let countedShots: QualificationMalfunctionCountedShot[];
  if (treatment.scoreCombination === 'LOWEST_PER_TARGET') {
    countedShots = Array.from({ length: treatment.scoreCount }, (_, targetIndex) => {
      const candidates = allShots.filter((shot) => shot.targetIndex === targetIndex);
      if (candidates.length === 0) throw new Error(`No score is available for target ${targetIndex + 1}`);
      return [...candidates].sort(compareCountedShots)[0]!;
    });
  } else {
    if (allShots.length < treatment.scoreCount) {
      throw new Error(`At least ${treatment.scoreCount} scores are required for LOWEST_OVERALL`);
    }
    countedShots = [...allShots].sort(compareCountedShots).slice(0, treatment.scoreCount);
  }

  const countedIds = new Set(countedShots.flatMap((shot) => (shot.shotId ? [shot.shotId] : [])));
  return Object.freeze({
    scoreCombination: treatment.scoreCombination,
    countedShots: Object.freeze(countedShots),
    discardedShotIds: Object.freeze(
      allShots.flatMap((shot) => (shot.shotId && !countedIds.has(shot.shotId) ? [shot.shotId] : [])),
    ),
    addedZeros: Object.freeze(addedZeros),
    totalX10: countedShots.reduce((total, shot) => total + shot.scoreX10, 0),
  });
}

interface QualificationMalfunctionValidationContext {
  readonly round: 'ELIMINATION' | 'QUALIFICATION' | 'FINAL';
  readonly stages: readonly {
    readonly id: string;
    readonly phase: 'PREPARATION' | 'MATCH';
    readonly series: readonly { readonly timedTargetProgramId?: string }[];
  }[];
}

export function validateQualificationMalfunctionCapability(
  capability: QualificationMalfunctionCapability,
  context: QualificationMalfunctionValidationContext,
): void {
  if (context.round === 'FINAL') throw new Error('qualificationMalfunction is not valid for a Final Rule Pack');
  if (capability.causes.length === 0) throw new Error('qualificationMalfunction.causes must not be empty');
  const causeCodes = new Set<string>();
  for (const cause of capability.causes) {
    text(cause.code, 'qualificationMalfunction cause code');
    text(cause.label, `qualificationMalfunction cause ${cause.code} label`);
    text(cause.ruleReference, `qualificationMalfunction cause ${cause.code} ruleReference`);
    if (causeCodes.has(cause.code)) throw new Error('qualificationMalfunction cause codes must be unique');
    causeCodes.add(cause.code);
  }

  const claimLimit = capability.claimLimit;
  if (claimLimit) {
    positiveInteger(claimLimit.maximum, 'qualificationMalfunction.claimLimit.maximum');
    if (claimLimit.exceptionalTwoPartMaximumPerPart !== undefined) {
      positiveInteger(
        claimLimit.exceptionalTwoPartMaximumPerPart,
        'qualificationMalfunction.claimLimit.exceptionalTwoPartMaximumPerPart',
      );
      if (claimLimit.scope !== 'SIXTY_SHOT_MATCH') {
        throw new Error('qualificationMalfunction exceptional two-part limit requires SIXTY_SHOT_MATCH scope');
      }
    }
  }

  const repair = capability.repair;
  if (repair.maximumSeconds !== null) {
    positiveInteger(repair.maximumSeconds, 'qualificationMalfunction.repair.maximumSeconds');
  }
  if (repair.additionalSighting.policy === 'JURY_MUST_ALLOW_SERIES') {
    positiveInteger(repair.additionalSighting.shots, 'qualificationMalfunction.repair.additionalSighting.shots');
  }
  requireReferences(repair.ruleReferences, 'qualificationMalfunction.repair.ruleReferences');

  if (capability.stages.length === 0) throw new Error('qualificationMalfunction.stages must not be empty');
  const stageIds = new Set<string>();
  for (const stageRule of capability.stages) {
    text(stageRule.stageId, 'qualificationMalfunction stageId');
    text(stageRule.ruleReference, `qualificationMalfunction stage ${stageRule.stageId} ruleReference`);
    if (stageIds.has(stageRule.stageId)) throw new Error('qualificationMalfunction stage IDs must be unique');
    stageIds.add(stageRule.stageId);
    const stage = context.stages.find((candidate) => candidate.id === stageRule.stageId);
    if (!stage || stage.phase !== 'MATCH') {
      throw new Error(`Qualification malfunction stage ${stageRule.stageId} must reference a MATCH stage`);
    }
    const treatment = stageRule.allowableTreatment;
    if (treatment.type !== 'CONTINUE_WITHIN_ORIGINAL_TIME') {
      if (!stage.series.some((series) => series.timedTargetProgramId)) {
        throw new Error(`Qualification malfunction stage ${stageRule.stageId} requires a timed-target series`);
      }
      if (treatment.type === 'REPEAT_FULL_SERIES') {
        positiveInteger(treatment.shots, `qualificationMalfunction stage ${stageRule.stageId} shots`);
        positiveInteger(treatment.scoreCount, `qualificationMalfunction stage ${stageRule.stageId} scoreCount`);
      } else if (treatment.execution.mode === 'SECONDS_PER_SHOT') {
        positiveInteger(
          treatment.execution.secondsPerShot,
          `qualificationMalfunction stage ${stageRule.stageId} secondsPerShot`,
        );
      }
    }
  }

  requireReferences(capability.documentation.ruleReferences, 'qualificationMalfunction.documentation.ruleReferences');
  if (capability.documentation.incidentRecords.length === 0) {
    throw new Error('qualificationMalfunction.documentation.incidentRecords must not be empty');
  }
  requireReferences(capability.ruleReferences, 'qualificationMalfunction.ruleReferences');
  text(capability.nonAllowableTreatment.ruleReference, 'qualificationMalfunction.nonAllowableTreatment.ruleReference');
}

function requireReferences(values: readonly string[], name: string): void {
  if (values.length === 0) throw new Error(`${name} must not be empty`);
  values.forEach((value) => text(value, name));
}

function text(value: string, name: string): void {
  if (value.trim().length === 0) throw new Error(`${name} must not be empty`);
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

function nonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}

function validateSeriesRow(
  row: QualificationMalfunctionSeriesRow,
  treatment: Extract<QualificationMalfunctionAllowableTreatment, { type: 'REPEAT_FULL_SERIES' }>,
): void {
  if (row.shots.length > treatment.shots) throw new Error(`${row.row} row exceeds the series shot limit`);
  const ids = new Set<string>();
  const targets = new Set<number>();
  for (const shot of row.shots) {
    text(shot.shotId, `${row.row} shotId`);
    if (ids.has(shot.shotId)) throw new Error(`${row.row} shot IDs must be unique`);
    ids.add(shot.shotId);
    nonNegativeInteger(shot.scoreX10, `${row.row} scoreX10`);
    if (treatment.scoreCombination === 'LOWEST_PER_TARGET') {
      if (
        shot.targetIndex === undefined ||
        !Number.isInteger(shot.targetIndex) ||
        shot.targetIndex < 0 ||
        shot.targetIndex >= treatment.scoreCount
      ) {
        throw new Error(`${row.row} targetIndex must identify a target in the score group`);
      }
      if (targets.has(shot.targetIndex)) throw new Error(`${row.row} target indices must be unique`);
      targets.add(shot.targetIndex);
    } else if (shot.targetIndex !== undefined) {
      throw new Error('LOWEST_OVERALL shots must not contain targetIndex');
    }
  }
}

function countedShot(
  row: QualificationMalfunctionSeriesRow['row'],
  shot: QualificationMalfunctionSeriesShot,
): QualificationMalfunctionCountedShot {
  return Object.freeze({
    row,
    shotId: shot.shotId,
    scoreX10: shot.scoreX10,
    targetIndex: shot.targetIndex ?? null,
    addedZero: false,
  });
}

function addedZero(
  row: QualificationMalfunctionSeriesRow['row'],
  targetIndex: number | null,
): QualificationMalfunctionCountedShot {
  return Object.freeze({ row, shotId: null, scoreX10: 0, targetIndex, addedZero: true });
}

function compareCountedShots(
  left: QualificationMalfunctionCountedShot,
  right: QualificationMalfunctionCountedShot,
): number {
  if (left.scoreX10 !== right.scoreX10) return left.scoreX10 - right.scoreX10;
  if (left.addedZero !== right.addedZero) return left.addedZero ? -1 : 1;
  if (left.row !== right.row) return left.row === 'ORIGINAL' ? -1 : 1;
  return (left.targetIndex ?? 0) - (right.targetIndex ?? 0) || (left.shotId ?? '').localeCompare(right.shotId ?? '');
}
