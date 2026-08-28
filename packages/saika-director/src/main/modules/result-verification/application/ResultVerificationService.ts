import { createHash } from 'node:crypto';

import { GetEventByIdToken, type GetEventByIdResponse } from '@/main/modules/championship';
import type { IQualificationResultsReader } from '@/main/modules/results';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type {
  AddVerificationCheckPayload,
  ApproveResultListPayload,
  RankedResultDto,
  ResultListApprovalDto,
  ResultVerificationCheckDto,
  ResultVerificationStatusDto,
  RevokeResultListApprovalPayload,
  VerificationResultItemDto,
} from '@/shared/ipc/contracts';

import type { IResultVerificationRepository } from '../domain/IResultVerificationRepository';
import {
  ResultListApprovalEntry,
  getActiveResultListApprovals,
  type ResultApprovalScope,
} from '../domain/ResultListApprovalEntry';
import { ResultVerificationCheck } from '../domain/ResultVerificationCheck';

const SCOPE: ResultApprovalScope = 'QUALIFICATION';

/** Application service that validates checks and approvals against live result revisions. */
export class ResultVerificationService {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly results: IQualificationResultsReader,
    private readonly repository: IResultVerificationRepository,
    private readonly competitionTypes: CompetitionTypeRegistry,
  ) {}

  async getStatus(eventId: string): Promise<ResultVerificationStatusDto> {
    const event = (await this.queryBus.execute(GetEventByIdToken, { eventId })) as GetEventByIdResponse | null;
    if (!event) throw new Error(`Event ${eventId} not found`);
    const definition = this.competitionTypes.get(event.eventType);
    const policy = definition.resultVerification ?? { topIndividualResults: 0, topTeamResults: 0 };
    const results = await this.results.getByEvent(eventId);
    const snapshotRevision = calculateSnapshotRevision(eventId, policy, results);
    const requiredRankedResults = results
      .filter((result) => result.rank > 0 && result.classificationCode === null)
      .slice(0, policy.topIndividualResults);
    const requiredIds = new Set(requiredRankedResults.map((result) => result.id));
    const checks = this.repository.findChecksByEvent(eventId);

    const items: VerificationResultItemDto[] = results.map((result) => {
      const targetChecks = checks.filter((check) => check.participantId === result.participantId);
      const latest = targetChecks.at(-1) ?? null;
      const current = [...targetChecks]
        .reverse()
        .find((check) => check.resultId === result.id && check.resultRevision === result.revision);
      return {
        resultId: result.id,
        participantId: result.participantId,
        revision: result.revision,
        rank: result.rank,
        playerName: result.playerName,
        affiliation: result.affiliation,
        relayNumber: result.relayNumber,
        totalScore: result.totalScore,
        classificationCode: result.classificationCode,
        decisionCount: result.decisionCount,
        projectionIssues: result.projectionIssues,
        status: result.status,
        evidenceSummary: result.evidenceSummary,
        required: requiredIds.has(result.id),
        latestCheck: latest ? toCheckDto(latest, result) : null,
        currentCheck: current ? toCheckDto(current, result) : null,
      };
    });

    const requiredItems = items.filter((item) => item.required);
    const checkedIndividualResults = requiredItems.filter((item) => item.currentCheck?.qualifies).length;
    const allResultsConfirmed = results.length > 0 && results.every((result) => result.status === 'confirmed');
    const teamVerificationSupported = policy.topTeamResults === 0;
    const issues = buildReadinessIssues({
      resultCount: results.length,
      configuredIndividualChecks: policy.topIndividualResults,
      requiredItems,
      allResultsConfirmed,
      requiredTeamChecks: policy.topTeamResults,
      teamVerificationSupported,
    });

    const approvalEntries = this.repository.findApprovalEntriesByEvent(eventId, SCOPE);
    const activeApprovalIds = new Set(getActiveResultListApprovals(approvalEntries).map((entry) => entry.id));
    const approvalHistory = approvalEntries.map((entry) =>
      toApprovalDto(entry, activeApprovalIds.has(entry.id), snapshotRevision),
    );
    const currentApproval = [...approvalHistory]
      .reverse()
      .find((approval) => approval.type === 'APPROVAL' && approval.active && approval.current);

    return {
      eventId,
      snapshotRevision,
      configuredIndividualChecks: policy.topIndividualResults,
      requiredIndividualChecks: requiredItems.length,
      requiredTeamChecks: policy.topTeamResults,
      teamVerificationSupported,
      checkedIndividualResults,
      allResultsConfirmed,
      readyForApproval: issues.length === 0,
      issues,
      results: items,
      currentApproval: currentApproval ?? null,
      approvalHistory,
    };
  }

  async addCheck(input: AddVerificationCheckPayload): Promise<ResultVerificationCheckDto> {
    const status = await this.getStatus(input.eventId);
    const result = status.results.find((item) => item.resultId === input.resultId);
    if (!result) throw new Error(`Result ${input.resultId} is not part of event ${input.eventId}`);
    if (result.revision !== input.resultRevision) {
      throw new Error('The result changed after this verification form was opened; reload and compare it again');
    }
    if (result.rank < 1 || result.classificationCode !== null) {
      throw new Error('Only ranked qualification results can be verified');
    }
    if (result.status !== 'confirmed') throw new Error('Confirm the result before recording an RTS verification');

    const check = ResultVerificationCheck.create({
      eventId: input.eventId,
      resultId: result.resultId,
      participantId: result.participantId,
      playerName: result.playerName,
      resultRevision: result.revision,
      resultRank: result.rank,
      scoreX10: Math.round(result.totalScore * 10),
      decisionCountAtCheck: result.decisionCount,
      evidenceSource: input.evidenceSource,
      evidenceReference: input.evidenceReference,
      comparisonStatus: input.comparisonStatus,
      manualInterventionsReviewed: input.manualInterventionsReviewed,
      note: input.note,
      officialName: input.officialName,
    });
    this.repository.appendCheck(check);
    return toCheckDto(check, result);
  }

  async approve(input: ApproveResultListPayload): Promise<ResultListApprovalDto> {
    const status = await this.getStatus(input.eventId);
    if (status.snapshotRevision !== input.snapshotRevision) {
      throw new Error('The result list changed after this approval form was opened; reload before approving');
    }
    if (!status.readyForApproval) throw new Error(`Result list is not ready: ${status.issues.join('; ')}`);
    if (status.currentApproval) throw new Error('This result-list revision is already approved');

    const checkIds = status.results
      .filter((result) => result.required)
      .map((result) => result.currentCheck?.id)
      .filter((id): id is string => id !== undefined);
    const approval = ResultListApprovalEntry.createApproval({
      eventId: input.eventId,
      resultScope: SCOPE,
      snapshotRevision: status.snapshotRevision,
      requiredIndividualChecks: status.requiredIndividualChecks,
      requiredTeamChecks: status.requiredTeamChecks,
      checkIds,
      statement: input.statement,
      officialName: input.officialName,
    });
    this.repository.appendApprovalEntry(approval);
    return toApprovalDto(approval, true, status.snapshotRevision);
  }

  async revokeApproval(input: RevokeResultListApprovalPayload): Promise<ResultListApprovalDto> {
    const approval = this.repository.findApprovalEntryById(input.approvalId);
    if (!approval) throw new Error(`Approval ${input.approvalId} was not found`);
    if (approval.type !== 'APPROVAL') throw new Error('A revocation entry cannot be revoked');
    const history = this.repository.findApprovalEntriesByEvent(approval.eventId, approval.resultScope);
    if (!getActiveResultListApprovals(history).some((entry) => entry.id === approval.id)) {
      throw new Error(`Approval ${input.approvalId} is already revoked`);
    }
    const revocation = ResultListApprovalEntry.createRevocation(approval, {
      reason: input.reason,
      officialName: input.officialName,
    });
    this.repository.appendApprovalEntry(revocation);
    return toApprovalDto(revocation, false, approval.snapshotRevision);
  }
}

function calculateSnapshotRevision(
  eventId: string,
  policy: { topIndividualResults: number; topTeamResults: number },
  results: readonly RankedResultDto[],
): string {
  const canonical = {
    eventId,
    policy,
    results: results.map((result) => ({
      id: result.id,
      participantId: result.participantId,
      rank: result.rank,
      revision: result.revision,
      status: result.status,
      classificationCode: result.classificationCode,
    })),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function buildReadinessIssues(input: {
  resultCount: number;
  configuredIndividualChecks: number;
  requiredItems: readonly VerificationResultItemDto[];
  allResultsConfirmed: boolean;
  requiredTeamChecks: number;
  teamVerificationSupported: boolean;
}): string[] {
  const issues: string[] = [];
  if (input.resultCount === 0) issues.push('No qualification results are available');
  if (input.configuredIndividualChecks === 0 && input.requiredTeamChecks === 0) {
    issues.push('No result verification policy is configured for this competition type');
  }
  if (!input.allResultsConfirmed) issues.push('All qualification results must be confirmed');
  if (!input.teamVerificationSupported) {
    issues.push(`Verification of the top ${input.requiredTeamChecks} team results is not implemented`);
  }
  if (input.requiredItems.some((item) => item.projectionIssues.length > 0)) {
    issues.push('At least one required result has unresolved projection issues');
  }
  if (input.requiredItems.some((item) => !item.currentCheck?.qualifies)) {
    issues.push('Every required individual result needs a current matched verification');
  }
  return issues;
}

function toCheckDto(check: ResultVerificationCheck, result: VerificationResultItemDto | RankedResultDto) {
  const currentResultId = 'resultId' in result ? result.resultId : result.id;
  const current = check.resultId === currentResultId && check.resultRevision === result.revision;
  const decisionCount = 'decisionCount' in result ? result.decisionCount : 0;
  return {
    id: check.id,
    eventId: check.eventId,
    resultId: check.resultId,
    participantId: check.participantId,
    playerName: check.playerName,
    resultRevision: check.resultRevision,
    resultRank: check.resultRank,
    scoreX10: check.scoreX10,
    decisionCountAtCheck: check.decisionCountAtCheck,
    evidenceSource: check.evidenceSource,
    evidenceReference: check.evidenceReference,
    comparisonStatus: check.comparisonStatus,
    manualInterventionsReviewed: check.manualInterventionsReviewed,
    note: check.note,
    officialName: check.officialName,
    checkedAt: check.checkedAt.toISOString(),
    current,
    qualifies:
      current && check.comparisonStatus === 'MATCHED' && (decisionCount === 0 || check.manualInterventionsReviewed),
  } satisfies ResultVerificationCheckDto;
}

function toApprovalDto(
  entry: ResultListApprovalEntry,
  active: boolean,
  currentSnapshotRevision: string,
): ResultListApprovalDto {
  return {
    id: entry.id,
    eventId: entry.eventId,
    resultScope: entry.resultScope,
    type: entry.type,
    snapshotRevision: entry.snapshotRevision,
    requiredIndividualChecks: entry.requiredIndividualChecks,
    requiredTeamChecks: entry.requiredTeamChecks,
    checkIds: [...entry.checkIds],
    statement: entry.statement,
    officialName: entry.officialName,
    recordedAt: entry.recordedAt.toISOString(),
    reversesApprovalId: entry.reversesApprovalId,
    active,
    current: active && entry.type === 'APPROVAL' && entry.snapshotRevision === currentSnapshotRevision,
  };
}
