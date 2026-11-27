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
  qualificationMalfunctionStatus,
} from '../domain/QualificationMalfunctionCase';
import {
  assertExceptionalPartSupported,
  assertQualificationMalfunctionPolicyEntry,
  assertQualificationMalfunctionTransition,
  assertSignalPolicyContext,
  defaultQualificationMalfunctionRuleReference,
} from '../domain/QualificationMalfunctionWorkflow';
import { toQualificationMalfunctionCaseDto } from './QualificationMalfunctionDto';

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
    assertQualificationMalfunctionTransition(status, input.type);
    assertQualificationMalfunctionPolicyEntry(value, entries, input);
    const ruleReference = defaultQualificationMalfunctionRuleReference(value, input);
    const entry = QualificationMalfunctionEntry.create({
      caseId: value.id,
      type: input.type,
      statement: input.statement,
      officialName: input.officialName,
      officialRole: input.officialRole,
      ...(ruleReference ? { ruleReference } : {}),
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
    return cases.map((value) => toQualificationMalfunctionCaseDto(value, entriesByCase.get(value.id) ?? []));
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
