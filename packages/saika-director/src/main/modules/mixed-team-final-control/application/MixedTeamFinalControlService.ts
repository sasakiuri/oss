import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type {
  AssessMixedTeamFinalPayload,
  MixedTeamFinalAssessmentDto,
  MixedTeamFinalDecisionDto,
  RecordMixedTeamFinalCommandBatchPayload,
  RecordMixedTeamFinalDecisionPayload,
  VoidMixedTeamFinalDecisionPayload,
} from '@/shared/ipc/contracts';
import type { IMixedTeamFinalControlRepository } from '../domain/IMixedTeamFinalControlRepository';
import { MixedTeamFinalCheckpointPolicy } from '../domain/MixedTeamFinalCheckpointPolicy';

export class MixedTeamFinalControlService {
  constructor(
    private readonly repository: IMixedTeamFinalControlRepository,
    private readonly competitionTypes: CompetitionTypeRegistry,
    private readonly policy = new MixedTeamFinalCheckpointPolicy(),
  ) {}
  list(competitionId: string): MixedTeamFinalDecisionDto[] {
    return this.repository.findByCompetition(competitionId);
  }
  assess(input: AssessMixedTeamFinalPayload): MixedTeamFinalAssessmentDto {
    const completedRanks = new Set(
      this.list(input.competitionId)
        .filter((decision) => !decision.voided && decision.commandCompleted)
        .map((decision) => decision.rank),
    );
    return this.policy.assess(this.competitionTypes.get(input.competitionTypeId), {
      teams: input.teams,
      completedRanks,
    });
  }
  recordDecision(input: RecordMixedTeamFinalDecisionPayload): MixedTeamFinalDecisionDto {
    const assessment = this.assess(input);
    if (assessment.status !== 'READY' && assessment.status !== 'TIE') throw new Error(assessment.guidance);
    if (assessment.afterShot === null || assessment.expectedRank === null)
      throw new Error('No team elimination is due');
    if (
      this.list(input.competitionId).some((decision) => !decision.voided && decision.rank === assessment.expectedRank)
    ) {
      throw new Error(`Rank ${assessment.expectedRank} already has a current Mixed Team decision`);
    }
    if (!assessment.candidateTeamIds.includes(input.selectedTeamId)) {
      throw new Error('The selected team is not among the lowest-score candidates');
    }
    const selectedTeam = input.teams.find((team) => team.teamId === input.selectedTeamId)!;
    const memberLaneIds = selectedTeam.members.map((member) => member.laneId);
    if (memberLaneIds.length !== 2) throw new Error('The selected Mixed Team must have two Lane members');
    const resolutionStatement = input.resolutionStatement?.trim() || null;
    if (assessment.status === 'READY' && input.resolution !== 'CLEAR_LOWEST') {
      throw new Error('A clear lowest team must use CLEAR_LOWEST');
    }
    if (assessment.status === 'TIE') {
      if (input.resolution === 'CLEAR_LOWEST')
        throw new Error('A tied team checkpoint requires a shoot-off or Jury decision');
      if (!resolutionStatement) throw new Error('A tied team checkpoint requires a resolution statement');
    }
    const decision = {
      id: input.id ?? crypto.randomUUID(),
      competitionId: input.competitionId,
      eventId: input.eventId ?? null,
      competitionTypeId: input.competitionTypeId,
      afterShot: assessment.afterShot,
      rank: assessment.expectedRank,
      selectedTeamId: selectedTeam.teamId,
      memberLaneIds: memberLaneIds as [string, string],
      scoreSnapshot: input.teams,
      tiedTeamIds: assessment.status === 'TIE' ? assessment.candidateTeamIds : [],
      resolution: input.resolution,
      resolutionStatement,
      officialName: input.officialName.trim(),
      ruleReference: 'ISSF 6.18.3, 6.18.3.6',
      recordedAt: input.recordedAt ?? new Date().toISOString(),
    } satisfies Omit<
      MixedTeamFinalDecisionDto,
      'voided' | 'commandCompleted' | 'latestLaneStatuses' | 'commandAttempts'
    >;
    this.repository.appendDecision(decision);
    return this.requireDecision(decision.id);
  }
  recordCommandBatch(input: RecordMixedTeamFinalCommandBatchPayload): MixedTeamFinalDecisionDto {
    const decision = this.requireDecision(input.decisionId);
    if (decision.voided) throw new Error('Cannot append Lane results to a voided team decision');
    const ids = input.laneResults.map((result) => result.laneId);
    if (new Set(ids).size !== ids.length || ids.some((laneId) => !decision.memberLaneIds.includes(laneId))) {
      throw new Error('Command results must identify unique members of the selected team');
    }
    const duplicateCommand = input.laneResults.find((result) =>
      decision.commandAttempts.some((attempt) =>
        attempt.laneResults.some((prior) => prior.commandId === result.commandId),
      ),
    );
    if (duplicateCommand) throw new Error(`Command ${duplicateCommand.commandId} is already recorded`);
    this.repository.appendEntry({
      id: input.id ?? crypto.randomUUID(),
      decisionId: decision.id,
      entryType: 'COMMAND_BATCH',
      commandResults: input.laneResults,
      statement: input.statement.trim(),
      officialName: input.officialName.trim(),
      recordedAt: input.recordedAt ?? new Date().toISOString(),
    });
    return this.requireDecision(decision.id);
  }
  voidDecision(input: VoidMixedTeamFinalDecisionPayload): MixedTeamFinalDecisionDto {
    const decision = this.requireDecision(input.decisionId);
    if (decision.voided) return decision;
    if (Object.values(decision.latestLaneStatuses).includes('DONE')) {
      throw new Error('A team decision cannot be voided after either Lane has completed retirement');
    }
    this.repository.appendEntry({
      id: input.id ?? crypto.randomUUID(),
      decisionId: decision.id,
      entryType: 'VOID',
      commandResults: null,
      statement: input.reason.trim(),
      officialName: input.officialName.trim(),
      recordedAt: input.recordedAt ?? new Date().toISOString(),
    });
    return this.requireDecision(decision.id);
  }
  private requireDecision(id: string): MixedTeamFinalDecisionDto {
    const decision = this.repository.findById(id);
    if (!decision) throw new Error(`Mixed Team Final decision not found: ${id}`);
    return decision;
  }
}
