import type { AppendQualificationMalfunctionEntryPayload } from '@/shared/ipc/contracts';

import type { IQualificationMalfunctionPolicyResolver } from './IQualificationMalfunctionPolicyResolver';
import type { QualificationMalfunctionSignalSnapshot } from './IQualificationMalfunctionSignalSource';
import {
  latestQualificationMalfunctionClassification,
  type QualificationMalfunctionCase,
  type QualificationMalfunctionEntry,
  type QualificationMalfunctionRemedy,
  type QualificationMalfunctionStatus,
} from './QualificationMalfunctionCase';

// Rules a Qualification malfunction case follows: its context checks, entry order and policy-driven remedies.

export function assertSignalPolicyContext(
  signal: QualificationMalfunctionSignalSnapshot,
  policy: ReturnType<IQualificationMalfunctionPolicyResolver['resolve']>,
): void {
  if (
    signal.phase !== policy.phase ||
    signal.seriesShotLimit !== policy.seriesShotLimit ||
    signal.timedTargetProgramId !== policy.timedTargetProgramId
  ) {
    throw new Error('Lane declaration context does not match the event Rule Pack');
  }
}

export function assertExceptionalPartSupported(
  capability: QualificationMalfunctionCase['policySnapshot'],
  part: 1 | 2 | undefined,
): void {
  if (part === undefined) return;
  if (capability.claimLimit?.exceptionalTwoPartMaximumPerPart === undefined) {
    throw new Error('This malfunction policy does not support exceptional two-part claim limits');
  }
}

export function assertQualificationMalfunctionTransition(
  status: QualificationMalfunctionStatus,
  next: AppendQualificationMalfunctionEntryPayload['type'],
): void {
  if (status === 'VOID') throw new Error('A void qualification malfunction case cannot be changed');
  if (next === 'NOTE') return;
  if (next === 'VOID') return;
  if (next === 'SCORE_REOPENED') {
    if (!['SETTLED', 'COMPLETED'].includes(status)) throw new Error('Only settled scoring may be reopened');
    return;
  }
  if (status === 'COMPLETED') {
    throw new Error('A completed qualification malfunction case only accepts notes or a void correction');
  }
  if (next === 'INSPECTION_RECORDED' && status !== 'OPEN' && status !== 'INSPECTED') {
    throw new Error('Inspection must be recorded before classification');
  }
  if (next === 'CLASSIFIED' && status !== 'INSPECTED' && status !== 'CLASSIFIED') {
    throw new Error('Classification requires a recorded inspection');
  }
  if (next === 'REPAIR_STARTED' && status !== 'CLASSIFIED') {
    throw new Error('Repair may start only after classification');
  }
  if (next === 'REPAIR_EXTENDED' && status !== 'REPAIRING') {
    throw new Error('Only an active repair may be extended');
  }
  if (next === 'REPAIR_COMPLETED' && status !== 'REPAIRING') {
    throw new Error('Only an active repair may be completed');
  }
  if (next === 'REMEDY_AUTHORIZED' && !['CLASSIFIED', 'REPAIRED', 'RECOVERY_AUTHORIZED'].includes(status)) {
    throw new Error('Classification is required before authorizing a remedy');
  }
  if (next === 'EXECUTION_RECORDED' && status !== 'RECOVERY_AUTHORIZED') {
    throw new Error('A remedy must be authorized before recording execution');
  }
  if (next === 'SCORE_SETTLED' && status !== 'EXECUTED') {
    throw new Error('Recovery execution must be recorded before score settlement');
  }
  if (next === 'COMPLETED' && status !== 'SETTLED') {
    throw new Error('Score settlement is required before completing the case');
  }
}

export function assertQualificationMalfunctionPolicyEntry(
  value: QualificationMalfunctionCase,
  entries: readonly QualificationMalfunctionEntry[],
  input: AppendQualificationMalfunctionEntryPayload,
): void {
  if (input.type === 'CLASSIFIED') {
    const cause = value.policySnapshot.causes.find((candidate) => candidate.code === input.causeCode);
    if (!cause || cause.classification !== input.classification) {
      throw new Error('Cause code and malfunction classification must match the policy snapshot');
    }
    const roles =
      value.policySnapshot.determinationAuthority === 'RANGE_OFFICER'
        ? ['RANGE_OFFICER', 'CRO']
        : ['RANGE_OFFICER', 'CRO', 'JURY_MEMBER'];
    if (!roles.includes(input.officialRole)) {
      throw new Error('The selected official role may not determine this malfunction');
    }
  }
  if (input.type === 'REPAIR_STARTED' && latestQualificationMalfunctionClassification(entries) !== 'ALLOWABLE') {
    throw new Error('Only an allowable malfunction may enter the repair workflow');
  }
  if (input.type === 'REPAIR_EXTENDED') {
    if (!value.policySnapshot.repair.juryMayExtend)
      throw new Error('This malfunction repair period may not be extended');
    if (input.officialRole !== 'JURY_MEMBER') throw new Error('Only a Jury member may extend the repair period');
  }
  if (input.type === 'REMEDY_AUTHORIZED') {
    const classification = latestQualificationMalfunctionClassification(entries);
    if (!classification) throw new Error('A remedy requires a malfunction classification');
    const expected = expectedRemedy(value, classification);
    if (input.remedy !== expected.remedy || input.shotsToFire !== expected.shotsToFire) {
      throw new Error(`The policy requires ${expected.remedy} with ${expected.shotsToFire} shots to fire`);
    }
  }
  if (
    (input.type === 'EXECUTION_RECORDED' || input.type === 'SCORE_SETTLED' || input.type === 'SCORE_REOPENED') &&
    !input.artifactId
  ) {
    throw new Error(`${input.type} requires an immutable artifact reference`);
  }
  if (
    (input.type === 'SCORE_SETTLED' || input.type === 'SCORE_REOPENED') &&
    !['RTS_OFFICER', 'JURY_MEMBER'].includes(input.officialRole)
  ) {
    throw new Error('Score settlement must be recorded by RTS or a Jury member');
  }
}

function expectedRemedy(
  value: QualificationMalfunctionCase,
  classification: 'ALLOWABLE' | 'NON_ALLOWABLE',
): { remedy: QualificationMalfunctionRemedy; shotsToFire: number } {
  if (value.claimMode === 'DOCUMENTATION_ONLY') return { remedy: 'NO_FURTHER_ACTION', shotsToFire: 0 };
  if (classification === 'NON_ALLOWABLE') return { remedy: 'SCORE_UNFIRED_AS_MISS', shotsToFire: 0 };
  if (value.phase === 'SIGHTING') return { remedy: 'CONTINUE_WITHIN_ORIGINAL_TIME', shotsToFire: 0 };
  const stage = value.policySnapshot.stages.find((candidate) => candidate.stageId === value.stageId);
  if (!stage) throw new Error(`Policy snapshot has no treatment for stage ${value.stageId ?? value.stageIndex}`);
  switch (stage.allowableTreatment.type) {
    case 'CONTINUE_WITHIN_ORIGINAL_TIME':
      return { remedy: 'CONTINUE_WITHIN_ORIGINAL_TIME', shotsToFire: 0 };
    case 'REPEAT_FULL_SERIES':
      return { remedy: 'REPEAT_FULL_SERIES', shotsToFire: stage.allowableTreatment.shots };
    case 'COMPLETE_REMAINING_SHOTS': {
      if (value.seriesShotLimit === null) throw new Error('Completion treatment requires a finite series shot limit');
      return {
        remedy: 'COMPLETE_REMAINING_SHOTS',
        shotsToFire: value.seriesShotLimit - value.recordedShots,
      };
    }
  }
}

/** The entry's rule reference: the given one, or the policy snapshot's reference for the entry. */
export function defaultQualificationMalfunctionRuleReference(
  value: QualificationMalfunctionCase,
  input: AppendQualificationMalfunctionEntryPayload,
): string | undefined {
  if (input.ruleReference) return input.ruleReference;
  if (input.type === 'CLASSIFIED') {
    return value.policySnapshot.causes.find((candidate) => candidate.code === input.causeCode)?.ruleReference;
  }
  if (input.type === 'REMEDY_AUTHORIZED') {
    if (input.remedy === 'SCORE_UNFIRED_AS_MISS') return value.policySnapshot.nonAllowableTreatment.ruleReference;
    return value.policySnapshot.stages.find((candidate) => candidate.stageId === value.stageId)?.ruleReference;
  }
  if (input.type.startsWith('REPAIR_')) return value.policySnapshot.repair.ruleReferences.join(', ');
  return undefined;
}
