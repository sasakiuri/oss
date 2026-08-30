import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type {
  AssessFinalCheckpointPayload,
  FinalCheckpointAssessmentDto,
  FinalControlDecisionDto,
  RecordFinalControlCommandResultPayload,
  RecordFinalControlDecisionPayload,
  VoidFinalControlDecisionPayload,
} from '@/shared/ipc/contracts';
import { FinalCheckpointPolicy } from '../domain/FinalCheckpointPolicy';
import type { IFinalControlRepository } from '../domain/IFinalControlRepository';

export class FinalControlService {
  constructor(
    private readonly repository: IFinalControlRepository,
    private readonly competitionTypes: CompetitionTypeRegistry,
    private readonly policy = new FinalCheckpointPolicy(),
  ) {}

  list(competitionId: string): FinalControlDecisionDto[] {
    return this.repository.findByCompetition(competitionId);
  }

  assess(input: AssessFinalCheckpointPayload): FinalCheckpointAssessmentDto {
    const completedRanks = new Set(
      this.list(input.competitionId)
        .filter((decision) => !decision.voided && decision.commandCompleted)
        .map((decision) => decision.rank),
    );
    return this.policy.assess(this.competitionTypes.get(input.competitionTypeId), {
      participantCount: input.participantCount,
      lanes: input.lanes,
      completedRanks,
    });
  }

  recordDecision(input: RecordFinalControlDecisionPayload): FinalControlDecisionDto {
    const existing = this.list(input.competitionId);
    const participantCounts = new Set(
      existing.filter((decision) => !decision.voided).map((decision) => decision.participantCount),
    );
    if (participantCounts.size > 0 && !participantCounts.has(input.participantCount)) {
      throw new Error('Final participant count cannot change after control decisions have been recorded');
    }
    const assessment = this.assess(input);
    if (assessment.status !== 'READY' && assessment.status !== 'TIE') {
      throw new Error(assessment.guidance);
    }
    if (assessment.afterShot === null || assessment.expectedRank === null) {
      throw new Error('The Final checkpoint has no elimination decision');
    }
    const existingRank = existing.find((decision) => decision.rank === assessment.expectedRank && !decision.voided);
    if (existingRank) throw new Error(`Rank ${assessment.expectedRank} already has a current decision`);
    if (!assessment.candidateLaneIds.includes(input.selectedLaneId)) {
      throw new Error('The selected Lane is not among the lowest-score checkpoint candidates');
    }
    const resolutionStatement = input.resolutionStatement?.trim() || null;
    if (assessment.status === 'READY' && input.resolution !== 'CLEAR_LOWEST') {
      throw new Error('A clear lowest score must use CLEAR_LOWEST');
    }
    if (assessment.status === 'TIE') {
      if (input.resolution === 'CLEAR_LOWEST')
        throw new Error('A tied checkpoint requires a shoot-off or Jury decision');
      if (!resolutionStatement) throw new Error('A tied checkpoint requires a resolution statement');
    }
    const decision = {
      id: input.id ?? crypto.randomUUID(),
      competitionId: input.competitionId,
      eventId: input.eventId ?? null,
      competitionTypeId: input.competitionTypeId,
      participantCount: input.participantCount,
      afterShot: assessment.afterShot,
      rank: assessment.expectedRank,
      selectedLaneId: input.selectedLaneId,
      scoreSnapshot: input.lanes,
      tiedLaneIds: assessment.status === 'TIE' ? assessment.candidateLaneIds : [],
      resolution: input.resolution,
      resolutionStatement,
      officialName: input.officialName.trim(),
      ruleReference: 'ISSF 6.17.2',
      recordedAt: input.recordedAt ?? new Date().toISOString(),
    } satisfies Omit<FinalControlDecisionDto, 'voided' | 'commandCompleted' | 'commandAttempts'>;
    this.repository.appendDecision(decision);
    return this.requireDecision(decision.id);
  }

  recordCommandResult(input: RecordFinalControlCommandResultPayload): FinalControlDecisionDto {
    const decision = this.requireDecision(input.decisionId);
    const duplicate = decision.commandAttempts.find((attempt) => attempt.commandId === input.commandId);
    if (duplicate) {
      if (duplicate.status !== input.status)
        throw new Error('The command result was already recorded with another status');
      return decision;
    }
    if (decision.voided) throw new Error('Cannot append a command result to a voided Final decision');
    this.repository.appendEntry({
      id: input.id ?? crypto.randomUUID(),
      decisionId: decision.id,
      entryType: 'COMMAND_RESULT',
      commandId: input.commandId,
      commandStatus: input.status,
      statement: input.statement.trim(),
      officialName: input.officialName.trim(),
      recordedAt: input.recordedAt ?? new Date().toISOString(),
    });
    return this.requireDecision(decision.id);
  }

  voidDecision(input: VoidFinalControlDecisionPayload): FinalControlDecisionDto {
    const decision = this.requireDecision(input.decisionId);
    if (decision.voided) return decision;
    if (decision.commandCompleted) {
      throw new Error('A decision whose Lane command completed cannot be voided; record a Jury correction separately');
    }
    this.repository.appendEntry({
      id: input.id ?? crypto.randomUUID(),
      decisionId: decision.id,
      entryType: 'VOID',
      commandId: null,
      commandStatus: null,
      statement: input.reason.trim(),
      officialName: input.officialName.trim(),
      recordedAt: input.recordedAt ?? new Date().toISOString(),
    });
    return this.requireDecision(decision.id);
  }

  private requireDecision(id: string): FinalControlDecisionDto {
    const decision = this.repository.findById(id);
    if (!decision) throw new Error(`Final control decision not found: ${id}`);
    return decision;
  }
}
