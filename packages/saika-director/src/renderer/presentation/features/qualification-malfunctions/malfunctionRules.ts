import type {
  AppendQualificationMalfunctionEntryPayload,
  QualificationMalfunctionCaseDto,
} from '@/shared/ipc/contracts';

export type MalfunctionEntryType = AppendQualificationMalfunctionEntryPayload['type'];

/** The remedy the event rules require for a case, with the number of shots to fire. */
export interface RequiredRemedy {
  readonly remedy: NonNullable<AppendQualificationMalfunctionEntryPayload['remedy']>;
  readonly shotsToFire: number;
}

/** The entry types an official may append to a case in its current status; none once it is void. */
export function availableEntryTypes(value: QualificationMalfunctionCaseDto): MalfunctionEntryType[] {
  switch (value.status) {
    case 'OPEN':
      return ['NOTE', 'INSPECTION_RECORDED', 'VOID'];
    case 'INSPECTED':
      return ['NOTE', 'INSPECTION_RECORDED', 'CLASSIFIED', 'VOID'];
    case 'CLASSIFIED':
      return latestClassification(value) === 'ALLOWABLE'
        ? ['NOTE', 'CLASSIFIED', 'REPAIR_STARTED', 'REMEDY_AUTHORIZED', 'VOID']
        : ['NOTE', 'CLASSIFIED', 'REMEDY_AUTHORIZED', 'VOID'];
    case 'REPAIRING':
      return value.policySnapshot.repair.juryMayExtend
        ? ['NOTE', 'REPAIR_EXTENDED', 'REPAIR_COMPLETED', 'VOID']
        : ['NOTE', 'REPAIR_COMPLETED', 'VOID'];
    case 'REPAIRED':
      return ['NOTE', 'REMEDY_AUTHORIZED', 'VOID'];
    case 'RECOVERY_AUTHORIZED':
      return ['NOTE', 'REMEDY_AUTHORIZED', 'EXECUTION_RECORDED', 'VOID'];
    case 'EXECUTED':
      return ['NOTE', 'SCORE_SETTLED', 'VOID'];
    case 'SETTLED':
      return ['NOTE', 'COMPLETED', 'VOID'];
    case 'COMPLETED':
      return ['NOTE', 'VOID'];
    case 'VOID':
      return [];
  }
}

/**
 * The remedy for a case: none for a documentation-only record, a miss after a non-allowable ruling, otherwise the
 * sighting or stage treatment of an allowable ruling. `null` while the rules cannot decide yet.
 */
export function requiredRemedy(value: QualificationMalfunctionCaseDto): RequiredRemedy | null {
  if (value.claimMode === 'DOCUMENTATION_ONLY') return { remedy: 'NO_FURTHER_ACTION', shotsToFire: 0 };
  const classification = latestClassification(value);
  if (!classification) return null;
  if (classification === 'NON_ALLOWABLE') return { remedy: 'SCORE_UNFIRED_AS_MISS', shotsToFire: 0 };
  if (value.phase === 'SIGHTING') return { remedy: 'CONTINUE_WITHIN_ORIGINAL_TIME', shotsToFire: 0 };
  const treatment = value.policySnapshot.stages.find(
    (candidate) => candidate.stageId === value.stageId,
  )?.allowableTreatment;
  if (!treatment) return null;
  if (treatment.type === 'CONTINUE_WITHIN_ORIGINAL_TIME') {
    return { remedy: treatment.type, shotsToFire: 0 };
  }
  if (treatment.type === 'REPEAT_FULL_SERIES') {
    return { remedy: treatment.type, shotsToFire: treatment.shots };
  }
  if (value.seriesShotLimit === null) return null;
  return { remedy: treatment.type, shotsToFire: value.seriesShotLimit - value.recordedShots };
}

function latestClassification(value: QualificationMalfunctionCaseDto): 'ALLOWABLE' | 'NON_ALLOWABLE' | null {
  return [...value.entries].reverse().find((entry) => entry.type === 'CLASSIFIED')?.classification ?? null;
}
