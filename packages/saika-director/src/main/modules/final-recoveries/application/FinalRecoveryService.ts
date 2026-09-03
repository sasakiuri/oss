import type {
  AppendFinalRecoveryEntryPayload,
  CreateFinalRecoveryCasePayload,
  FinalRecoveryCaseDto,
} from '@/shared/ipc/contracts';

import {
  FinalRecoveryCase,
  FinalRecoveryEntry,
  finalRecoveryStatus,
  type FinalRecoveryStatus,
} from '../domain/FinalRecoveryCase';
import type { IFinalRecoveryRepository } from '../domain/IFinalRecoveryRepository';
import { getIssfFinalRecoveryGuidance } from '../domain/IssfFinalRecoveryPolicy';

export class FinalRecoveryService {
  constructor(private readonly repository: IFinalRecoveryRepository) {}

  listByCompetition(competitionId: string): FinalRecoveryCaseDto[] {
    return this.project(this.repository.findCasesByCompetition(competitionId));
  }

  listByEvent(eventId: string): FinalRecoveryCaseDto[] {
    return this.project(this.repository.findCasesByEvent(eventId));
  }

  create(input: CreateFinalRecoveryCasePayload): FinalRecoveryCaseDto {
    assert25mMalfunctionCaseShape(input);
    const value = FinalRecoveryCase.create({
      competitionId: input.competitionId,
      ...(input.eventId ? { eventId: input.eventId } : {}),
      ...(input.finalRunId ? { finalRunId: input.finalRunId } : {}),
      ...(input.scriptStepId ? { scriptStepId: input.scriptStepId } : {}),
      ...(input.scriptStepSnapshot ? { scriptStepSnapshot: input.scriptStepSnapshot } : {}),
      procedureProfile: input.procedureProfile,
      incidentType: input.incidentType,
      phase: input.phase,
      affectedLaneIds: input.affectedLaneIds,
      summary: input.summary,
      openedBy: input.openedBy,
      ...(input.occurredAt ? { occurredAt: new Date(input.occurredAt) } : {}),
    });
    this.repository.appendCase(value);
    return this.project([value])[0]!;
  }

  appendEntry(input: AppendFinalRecoveryEntryPayload): FinalRecoveryCaseDto {
    const value = this.repository.findCaseById(input.caseId);
    if (!value) throw new Error(`Final recovery case ${input.caseId} not found`);
    const entries = this.repository.findEntries([value.id]).get(value.id) ?? [];
    assertTransition(finalRecoveryStatus(entries), input.type);
    assertPolicySelection(value, input);
    assert25mMalfunctionClaimAvailable(value, input, this.repository);
    this.repository.appendEntry(
      FinalRecoveryEntry.create({
        caseId: value.id,
        type: input.type,
        statement: input.statement,
        officialName: input.officialName,
        ...(input.ruleReference ? { ruleReference: input.ruleReference } : {}),
        ...(input.classification ? { classification: input.classification } : {}),
        ...(input.remedy ? { remedy: input.remedy } : {}),
        ...(input.remainingTimeSeconds !== undefined ? { remainingTimeSeconds: input.remainingTimeSeconds } : {}),
        ...(input.grantedTimeSeconds !== undefined ? { grantedTimeSeconds: input.grantedTimeSeconds } : {}),
        ...(input.shotCount !== undefined ? { shotCount: input.shotCount } : {}),
        ...(input.occurredAt ? { occurredAt: new Date(input.occurredAt) } : {}),
      }),
    );
    return this.project([value])[0]!;
  }

  private project(cases: readonly FinalRecoveryCase[]): FinalRecoveryCaseDto[] {
    const entriesByCase = this.repository.findEntries(cases.map((value) => value.id));
    return cases.map((value) => {
      const entries = entriesByCase.get(value.id) ?? [];
      return {
        id: value.id,
        competitionId: value.competitionId,
        eventId: value.eventId,
        finalRunId: value.finalRunId,
        scriptStepId: value.scriptStepId,
        scriptStepSnapshot: value.scriptStepSnapshot,
        procedureProfile: value.procedureProfile,
        incidentType: value.incidentType,
        phase: value.phase,
        affectedLaneIds: [...value.affectedLaneIds],
        summary: value.summary,
        openedBy: value.openedBy,
        occurredAt: value.occurredAt.toISOString(),
        createdAt: value.createdAt.toISOString(),
        status: finalRecoveryStatus(entries),
        guidance: getIssfFinalRecoveryGuidance(value.procedureProfile, value.incidentType, value.phase),
        entries: entries.map((entry) => ({
          id: entry.id,
          caseId: entry.caseId,
          type: entry.type,
          statement: entry.statement,
          officialName: entry.officialName,
          ruleReference: entry.ruleReference,
          classification: entry.classification,
          remedy: entry.remedy,
          remainingTimeSeconds: entry.remainingTimeSeconds,
          grantedTimeSeconds: entry.grantedTimeSeconds,
          shotCount: entry.shotCount,
          occurredAt: entry.occurredAt.toISOString(),
          recordedAt: entry.recordedAt.toISOString(),
        })),
      };
    });
  }
}

function assert25mMalfunctionCaseShape(input: CreateFinalRecoveryCasePayload): void {
  if (!is25mMalfunction(input.procedureProfile, input.incidentType)) return;
  if (input.affectedLaneIds.length !== 1) {
    throw new Error('A 25m Final malfunction recovery case requires exactly one affected Lane');
  }
}

function assert25mMalfunctionClaimAvailable(
  value: FinalRecoveryCase,
  input: AppendFinalRecoveryEntryPayload,
  repository: IFinalRecoveryRepository,
): void {
  if (
    !is25mMalfunction(value.procedureProfile, value.incidentType) ||
    input.type !== 'JURY_RULING' ||
    (input.classification !== 'ALLOWABLE_MALFUNCTION' && input.classification !== 'NON_ALLOWABLE_MALFUNCTION')
  ) {
    return;
  }
  if (value.phase === 'SIGHTING') {
    throw new Error('A malfunction during a 25m Final sighting series may not be claimed');
  }

  const cases = repository.findCasesByCompetition(value.competitionId);
  const entriesByCase = repository.findEntries(cases.map((candidate) => candidate.id));
  const laneId = value.affectedLaneIds[0]!;
  const priorClaim = cases.some((candidate) => {
    if (
      candidate.id === value.id ||
      candidate.incidentType !== 'MALFUNCTION' ||
      !is25mProfile(candidate.procedureProfile) ||
      !candidate.affectedLaneIds.includes(laneId) ||
      (value.finalRunId && candidate.finalRunId && candidate.finalRunId !== value.finalRunId)
    ) {
      return false;
    }
    const entries = entriesByCase.get(candidate.id) ?? [];
    if (finalRecoveryStatus(entries) === 'VOID') return false;
    return entries.some(
      (entry) =>
        entry.type === 'JURY_RULING' &&
        (entry.classification === 'ALLOWABLE_MALFUNCTION' || entry.classification === 'NON_ALLOWABLE_MALFUNCTION'),
    );
  });
  if (priorClaim) {
    throw new Error('Only one ALLOWABLE or NON-ALLOWABLE malfunction may be claimed per Lane in a 25m Final');
  }
}

function is25mMalfunction(
  profile: CreateFinalRecoveryCasePayload['procedureProfile'],
  incidentType: CreateFinalRecoveryCasePayload['incidentType'],
): boolean {
  return incidentType === 'MALFUNCTION' && is25mProfile(profile);
}

function is25mProfile(profile: FinalRecoveryCase['procedureProfile']): boolean {
  return profile === 'PISTOL_25M_RAPID_FIRE' || profile === 'PISTOL_25M_WOMEN';
}

function assertPolicySelection(value: FinalRecoveryCase, input: AppendFinalRecoveryEntryPayload): void {
  const guidance = getIssfFinalRecoveryGuidance(value.procedureProfile, value.incidentType, value.phase);
  if (input.classification && !guidance.classifications.includes(input.classification)) {
    throw new Error(
      `Classification ${input.classification} is not available for ${value.procedureProfile} ${value.incidentType} ${value.phase}`,
    );
  }
  if (input.remedy && !guidance.remedies.includes(input.remedy)) {
    throw new Error(
      `Remedy ${input.remedy} is not available for ${value.procedureProfile} ${value.incidentType} ${value.phase}`,
    );
  }
}

function assertTransition(status: FinalRecoveryStatus, next: AppendFinalRecoveryEntryPayload['type']): void {
  if (status === 'VOID') throw new Error('A void Final recovery case cannot be changed');
  if (next === 'NOTE') return;
  if (next === 'VOID') return;
  if (next === 'STOP_RECORDED' && status !== 'OPEN') throw new Error('Only an open recovery case can record the stop');
  if (next === 'JURY_RULING' && status !== 'OPEN' && status !== 'STOPPED') {
    throw new Error('Record the Jury ruling before authorizing recovery');
  }
  if (next === 'REMEDY_AUTHORIZED' && status !== 'RULING_RECORDED' && status !== 'RECOVERY_AUTHORIZED') {
    throw new Error('A Jury ruling is required before authorizing recovery');
  }
  if (next === 'RESUMED' && status !== 'RECOVERY_AUTHORIZED') {
    throw new Error('Recovery must be authorized before recording resumption');
  }
  if (next === 'COMPLETED' && status !== 'RECOVERY_AUTHORIZED' && status !== 'RESUMED') {
    throw new Error('Recovery must be authorized before completing the case');
  }
  if (status === 'COMPLETED') throw new Error('A completed recovery case only accepts notes or a void correction');
}
