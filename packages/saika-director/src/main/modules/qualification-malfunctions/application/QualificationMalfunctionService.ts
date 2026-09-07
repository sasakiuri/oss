import { assessQualificationMalfunctionClaim } from '@sasakiuri/saika-rules';
import type {
  AppendQualificationMalfunctionEntryPayload,
  CreateQualificationMalfunctionCasePayload,
  QualificationMalfunctionCaseDto,
} from '@/shared/ipc/contracts';

import type { IQualificationMalfunctionPolicyResolver } from '../domain/IQualificationMalfunctionPolicyResolver';
import type { IQualificationMalfunctionRepository } from '../domain/IQualificationMalfunctionRepository';
import type {
  IQualificationMalfunctionSignalSource,
  QualificationMalfunctionSignalSnapshot,
} from '../domain/IQualificationMalfunctionSignalSource';
import type { IQualificationMalfunctionSubjectResolver } from '../domain/IQualificationMalfunctionSubjectResolver';
import {
  QualificationMalfunctionCase,
  QualificationMalfunctionEntry,
  latestQualificationMalfunctionClassification,
  qualificationMalfunctionStatus,
  type QualificationMalfunctionRemedy,
  type QualificationMalfunctionStatus,
} from '../domain/QualificationMalfunctionCase';

export class QualificationMalfunctionService {
  constructor(
    private readonly repository: IQualificationMalfunctionRepository,
    private readonly policies: IQualificationMalfunctionPolicyResolver,
    private readonly subjects: IQualificationMalfunctionSubjectResolver,
    private readonly signals: IQualificationMalfunctionSignalSource,
  ) {}

  listByCompetition(competitionId: string): QualificationMalfunctionCaseDto[] {
    return this.project(this.repository.findCasesByCompetition(competitionId));
  }

  listByEvent(eventId: string): QualificationMalfunctionCaseDto[] {
    return this.project(this.repository.findCasesByEvent(eventId));
  }

  getById(caseId: string): QualificationMalfunctionCaseDto {
    const value = this.repository.findCaseById(caseId);
    if (!value) throw new Error(`Qualification malfunction case ${caseId} not found`);
    return this.project([value])[0]!;
  }

  create(input: CreateQualificationMalfunctionCasePayload): QualificationMalfunctionCaseDto {
    const created = this.repository.executeInTransaction(() => {
      const sourceSignal = resolveSourceSignal(this.signals, input);
      const policy = this.policies.resolve({
        eventId: input.eventId,
        stageIndex: input.stageIndex,
        seriesIndex: input.seriesIndex,
      });
      if (sourceSignal) assertSignalPolicyContext(sourceSignal, policy);
      assertExceptionalPartSupported(policy.capability, input.exceptionalMatchPart);
      if (input.exposureIndex !== undefined && !policy.timedTargetProgramId) {
        throw new Error('An exposure index requires a timed-target series');
      }
      const subject = this.subjects.resolve({
        eventId: input.eventId,
        participantId: input.participantId,
        laneId: input.laneId,
        laneChannel: input.laneChannel,
        relayNumber: input.relayNumber,
        stageIndex: input.stageIndex,
        seriesIndex: input.seriesIndex,
        recordedShots: input.recordedShots,
        reportSource: input.reportSource,
      });
      const prior = activeClaims(
        this.repository,
        input.eventId,
        input.participantId,
        policy.capability.claimLimit?.scope === 'EACH_30_SHOT_STAGE' ? policy.stageId : null,
      );
      const existingClaimsInScope = prior.length;
      const existingClaimsInPart =
        input.exceptionalMatchPart === undefined
          ? null
          : prior.filter((candidate) => candidate.exceptionalMatchPart === input.exceptionalMatchPart).length;
      const claimAssessment = assessQualificationMalfunctionClaim(policy.capability, {
        phase: policy.phase,
        existingClaimsInScope,
        ...(existingClaimsInPart === null ? {} : { exceptionalPart: { existingClaimsInPart } }),
      });
      const value = QualificationMalfunctionCase.create({
        competitionId: input.competitionId,
        eventId: input.eventId,
        competitionTypeId: policy.competitionTypeId,
        rulePackIdentity: policy.rulePackIdentity,
        policySnapshot: policy.capability,
        participantId: input.participantId,
        participantNameSnapshot: subject.participantName,
        startNumberSnapshot: subject.startNumber,
        laneId: input.laneId,
        laneChannelSnapshot: input.laneChannel,
        relayNumberSnapshot: input.relayNumber,
        reportSource: input.reportSource,
        ...(input.sourceSignalId ? { sourceSignalId: input.sourceSignalId } : {}),
        claimMode: input.claimMode,
        phase: policy.phase,
        stageId: policy.stageId,
        stageIndex: policy.stageIndex,
        seriesIndex: policy.seriesIndex,
        seriesShotLimit: policy.seriesShotLimit,
        recordedShots: input.recordedShots,
        timedTargetProgramId: policy.timedTargetProgramId,
        ...(input.exposureIndex !== undefined ? { exposureIndex: input.exposureIndex } : {}),
        ...(input.laneSessionId ? { laneSessionId: input.laneSessionId } : {}),
        laneSnapshotCapturedAt: subject.laneSnapshotCapturedAt,
        ...(input.exceptionalMatchPart !== undefined ? { exceptionalMatchPart: input.exceptionalMatchPart } : {}),
        existingClaimsInScope,
        ...(existingClaimsInPart === null ? {} : { existingClaimsInPart }),
        claimAssessment,
        summary: input.summary,
        openedBy: input.openedBy,
        ...(sourceSignal
          ? { occurredAt: sourceSignal.signalledAt }
          : input.occurredAt
            ? { occurredAt: new Date(input.occurredAt) }
            : {}),
      });
      this.repository.appendCase(value);
      return value;
    });
    return this.project([created])[0]!;
  }

  appendEntry(input: AppendQualificationMalfunctionEntryPayload): QualificationMalfunctionCaseDto {
    const value = this.repository.findCaseById(input.caseId);
    if (!value) throw new Error(`Qualification malfunction case ${input.caseId} not found`);
    const entries = this.repository.findEntries([value.id]).get(value.id) ?? [];
    const status = qualificationMalfunctionStatus(entries);
    assertTransition(status, input.type);
    assertPolicyEntry(value, entries, input);
    const entry = QualificationMalfunctionEntry.create({
      caseId: value.id,
      type: input.type,
      statement: input.statement,
      officialName: input.officialName,
      officialRole: input.officialRole,
      ...(defaultRuleReference(value, input) ? { ruleReference: defaultRuleReference(value, input) } : {}),
      ...(input.classification ? { classification: input.classification } : {}),
      ...(input.causeCode ? { causeCode: input.causeCode } : {}),
      ...(input.remedy ? { remedy: input.remedy } : {}),
      ...(input.shotsToFire !== undefined ? { shotsToFire: input.shotsToFire } : {}),
      ...(input.repairSeconds !== undefined ? { repairSeconds: input.repairSeconds } : {}),
      ...(input.artifactId ? { artifactId: input.artifactId } : {}),
      ...(input.occurredAt ? { occurredAt: new Date(input.occurredAt) } : {}),
    });
    this.repository.appendEntry(entry);
    return this.getById(value.id);
  }

  private project(cases: readonly QualificationMalfunctionCase[]): QualificationMalfunctionCaseDto[] {
    const entriesByCase = this.repository.findEntries(cases.map((value) => value.id));
    return cases.map((value) => {
      const entries = entriesByCase.get(value.id) ?? [];
      return {
        id: value.id,
        competitionId: value.competitionId,
        eventId: value.eventId,
        competitionTypeId: value.competitionTypeId,
        rulePackIdentity: value.rulePackIdentity,
        policySnapshot: structuredClone(value.policySnapshot) as QualificationMalfunctionCaseDto['policySnapshot'],
        participantId: value.participantId,
        participantNameSnapshot: value.participantNameSnapshot,
        startNumberSnapshot: value.startNumberSnapshot,
        laneId: value.laneId,
        laneChannelSnapshot: value.laneChannelSnapshot,
        relayNumberSnapshot: value.relayNumberSnapshot,
        reportSource: value.reportSource,
        sourceSignalId: value.sourceSignalId,
        claimMode: value.claimMode,
        phase: value.phase,
        stageId: value.stageId,
        stageIndex: value.stageIndex,
        seriesIndex: value.seriesIndex,
        seriesShotLimit: value.seriesShotLimit,
        recordedShots: value.recordedShots,
        timedTargetProgramId: value.timedTargetProgramId,
        exposureIndex: value.exposureIndex,
        laneSessionId: value.laneSessionId,
        laneSnapshotCapturedAt: value.laneSnapshotCapturedAt?.toISOString() ?? null,
        exceptionalMatchPart: value.exceptionalMatchPart,
        existingClaimsInScope: value.existingClaimsInScope,
        existingClaimsInPart: value.existingClaimsInPart,
        claimAssessment: value.claimAssessment,
        summary: value.summary,
        openedBy: value.openedBy,
        occurredAt: value.occurredAt.toISOString(),
        createdAt: value.createdAt.toISOString(),
        status: qualificationMalfunctionStatus(entries),
        entries: entries.map((entry) => ({
          id: entry.id,
          caseId: entry.caseId,
          type: entry.type,
          statement: entry.statement,
          officialName: entry.officialName,
          officialRole: entry.officialRole,
          ruleReference: entry.ruleReference,
          classification: entry.classification,
          causeCode: entry.causeCode,
          remedy: entry.remedy,
          shotsToFire: entry.shotsToFire,
          repairSeconds: entry.repairSeconds,
          artifactId: entry.artifactId,
          occurredAt: entry.occurredAt.toISOString(),
          recordedAt: entry.recordedAt.toISOString(),
        })),
      };
    });
  }
}

function resolveSourceSignal(
  signals: IQualificationMalfunctionSignalSource,
  input: CreateQualificationMalfunctionCasePayload,
): QualificationMalfunctionSignalSnapshot | null {
  if (input.reportSource === 'DIRECTOR_MANUAL') return null;
  if (!input.sourceSignalId) throw new Error('A Lane signal case requires sourceSignalId');
  const signal = signals.findById(input.sourceSignalId);
  if (!signal) throw new Error(`Lane declaration ${input.sourceSignalId} has not been observed by Director`);
  const expected = {
    competitionId: input.competitionId,
    participantId: input.participantId,
    laneId: input.laneId,
    stageIndex: input.stageIndex,
    seriesIndex: input.seriesIndex,
    recordedShots: input.recordedShots,
    sessionId: input.laneSessionId ?? null,
    exposureIndex: input.exposureIndex ?? null,
  };
  const observed = {
    competitionId: signal.competitionId,
    participantId: signal.participantId,
    laneId: signal.laneId,
    stageIndex: signal.stageIndex,
    seriesIndex: signal.seriesIndex,
    recordedShots: signal.recordedShots,
    sessionId: signal.sessionId,
    exposureIndex: signal.exposureIndex,
  };
  if (JSON.stringify(expected) !== JSON.stringify(observed)) {
    throw new Error('Lane declaration context does not match the requested malfunction case');
  }
  if (input.occurredAt && new Date(input.occurredAt).getTime() !== signal.signalledAt.getTime()) {
    throw new Error('Lane declaration time does not match the requested malfunction case');
  }
  return signal;
}

function assertSignalPolicyContext(
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

function activeClaims(
  repository: IQualificationMalfunctionRepository,
  eventId: string,
  participantId: string,
  stageId: string | null,
): QualificationMalfunctionCase[] {
  const cases = repository.findCasesByEventAndParticipant(eventId, participantId);
  const entries = repository.findEntries(cases.map((value) => value.id));
  return cases.filter(
    (value) =>
      value.claimMode === 'CLAIM' &&
      (stageId === null || value.stageId === stageId) &&
      qualificationMalfunctionStatus(entries.get(value.id) ?? []) !== 'VOID',
  );
}

function assertExceptionalPartSupported(
  capability: QualificationMalfunctionCase['policySnapshot'],
  part: 1 | 2 | undefined,
): void {
  if (part === undefined) return;
  if (capability.claimLimit?.exceptionalTwoPartMaximumPerPart === undefined) {
    throw new Error('This malfunction policy does not support exceptional two-part claim limits');
  }
}

function assertTransition(
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

function assertPolicyEntry(
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

function defaultRuleReference(
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
