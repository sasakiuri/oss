import { createHash } from 'node:crypto';
import { OfficialSigningPolicy, type IOfficialSigningPolicy } from '@/main/modules/official-signing';

import type {
  AddVerificationCheckPayload,
  ApproveResultListPayload,
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
import type { IResultVerificationSourceResolver, ResultVerificationSourceSnapshot } from './ResultVerificationSource';

/** Scope-neutral workflow that validates checks and approvals against live result revisions. */
export class ResultVerificationService {
  constructor(
    private readonly repository: IResultVerificationRepository,
    private readonly sources: IResultVerificationSourceResolver,
    private readonly signing: IOfficialSigningPolicy = new OfficialSigningPolicy(),
  ) {}

  async getStatus(
    eventId: string,
    resultScope: ResultApprovalScope = 'QUALIFICATION',
  ): Promise<ResultVerificationStatusDto> {
    const snapshot = await this.sources.resolve(resultScope).load(eventId);
    if (snapshot.eventId !== eventId || snapshot.resultScope !== resultScope) {
      throw new Error('Result verification source returned another event or result scope');
    }
    const snapshotRevision = calculateSnapshotRevision(snapshot);
    const requiredRankedResults = [...snapshot.results]
      .filter((result) => result.rank > 0 && result.classificationCode === null)
      .sort((left, right) => left.rank - right.rank)
      .slice(0, snapshot.configuredIndividualChecks);
    const requiredIds = new Set(requiredRankedResults.map((result) => result.resultId));
    const resultIds = new Set(snapshot.results.map((result) => result.resultId));
    const checks = this.repository.findChecksByEvent(eventId).filter((check) => resultIds.has(check.resultId));

    const items: VerificationResultItemDto[] = snapshot.results.map((result) => {
      const targetChecks = checks.filter((check) => check.resultId === result.resultId);
      const latest = targetChecks.at(-1) ?? null;
      const current = [...targetChecks]
        .reverse()
        .find((check) => check.resultId === result.resultId && check.resultRevision === result.revision);
      const item = {
        ...result,
        projectionIssues: [...result.projectionIssues],
        evidenceSummary: { ...result.evidenceSummary },
        required: requiredIds.has(result.resultId),
        latestCheck: null,
        currentCheck: null,
      } satisfies VerificationResultItemDto;
      return {
        ...item,
        latestCheck: latest ? toCheckDto(latest, item) : null,
        currentCheck: current ? toCheckDto(current, item) : null,
      };
    });

    const requiredItems = items.filter((item) => item.required);
    const checkedIndividualResults = requiredItems.filter((item) => item.currentCheck?.qualifies).length;
    const allResultsConfirmed =
      snapshot.results.length > 0 && snapshot.results.every((result) => result.status === 'confirmed');
    const issues = buildReadinessIssues({
      resultScope,
      resultCount: snapshot.results.length,
      configuredIndividualChecks: snapshot.configuredIndividualChecks,
      configuredTeamChecks: snapshot.configuredTeamChecks,
      requiredItems,
      allResultsConfirmed,
      sourceIssues: snapshot.issues,
    });

    const approvalEntries = this.repository.findApprovalEntriesByEvent(eventId, resultScope);
    const activeApprovalIds = new Set(getActiveResultListApprovals(approvalEntries).map((entry) => entry.id));
    const approvalHistory = approvalEntries.map((entry) =>
      toApprovalDto(entry, activeApprovalIds.has(entry.id), snapshotRevision),
    );
    const currentApproval = [...approvalHistory]
      .reverse()
      .find((approval) => approval.type === 'APPROVAL' && approval.active && approval.current);

    return {
      eventId,
      resultScope,
      snapshotRevision,
      configuredIndividualChecks: snapshot.configuredIndividualChecks,
      configuredTeamChecks: snapshot.configuredTeamChecks,
      requiredIndividualChecks: requiredItems.length,
      requiredTeamChecks: snapshot.requiredTeamChecks,
      teamVerificationSupported: snapshot.teamVerificationSupported,
      checkedIndividualResults,
      checkedTeamResults: snapshot.checkedTeamResults,
      teamVerificationRunId: snapshot.teamVerificationRunId,
      allResultsConfirmed,
      readyForApproval: issues.length === 0,
      issues,
      results: items,
      currentApproval: currentApproval ?? null,
      approvalHistory,
    };
  }

  async addCheck(input: AddVerificationCheckPayload): Promise<ResultVerificationCheckDto> {
    const status = await this.getStatus(input.eventId, input.resultScope);
    const result = status.results.find((item) => item.resultId === input.resultId);
    if (!result) throw new Error(`Result ${input.resultId} is not part of event ${input.eventId}`);
    if (result.revision !== input.resultRevision) {
      throw new Error('The result changed after this verification form was opened; reload and compare it again');
    }
    if (result.rank < 1 || result.classificationCode !== null) {
      throw new Error('Only ranked results can be verified');
    }
    if (result.status !== 'confirmed') {
      throw new Error('The result must be complete and confirmed before recording an RTS verification');
    }

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
    const signingEvidence = this.signing.authorize({ ...input, requiredRole: 'RTS_JURY' });
    const status = await this.getStatus(input.eventId, input.resultScope);
    if (status.snapshotRevision !== input.snapshotRevision) {
      throw new Error('The result list changed after this approval form was opened; reload before approving');
    }
    if (!status.readyForApproval) throw new Error(`Result list is not ready: ${status.issues.join('; ')}`);
    if (status.currentApproval) throw new Error('This result-list revision is already approved');

    const checkIds = status.results
      .filter((result) => result.required)
      .map((result) => result.currentCheck?.id)
      .filter((id): id is string => id !== undefined);
    if (status.teamVerificationRunId) checkIds.push(status.teamVerificationRunId);
    const approval = ResultListApprovalEntry.createApproval({
      eventId: input.eventId,
      resultScope: input.resultScope,
      snapshotRevision: status.snapshotRevision,
      requiredIndividualChecks: status.requiredIndividualChecks,
      requiredTeamChecks: status.requiredTeamChecks,
      checkIds,
      statement: input.statement,
      officialName: signingEvidence.method === 'AUTHENTICATED' ? signingEvidence.recordedBy : input.officialName,
      signingEvidence,
    });
    this.repository.appendApprovalEntry(approval);
    return toApprovalDto(approval, true, status.snapshotRevision);
  }

  async revokeApproval(input: RevokeResultListApprovalPayload): Promise<ResultListApprovalDto> {
    const signingEvidence = this.signing.authorize({ ...input, requiredRole: 'RTS_JURY' });
    const approval = this.repository.findApprovalEntryById(input.approvalId);
    if (!approval) throw new Error(`Approval ${input.approvalId} was not found`);
    if (approval.type !== 'APPROVAL') throw new Error('A revocation entry cannot be revoked');
    const history = this.repository.findApprovalEntriesByEvent(approval.eventId, approval.resultScope);
    if (!getActiveResultListApprovals(history).some((entry) => entry.id === approval.id)) {
      throw new Error(`Approval ${input.approvalId} is already revoked`);
    }
    const revocation = ResultListApprovalEntry.createRevocation(approval, {
      reason: input.reason,
      officialName: signingEvidence.method === 'AUTHENTICATED' ? signingEvidence.recordedBy : input.officialName,
      signingEvidence,
    });
    this.repository.appendApprovalEntry(revocation);
    return toApprovalDto(revocation, false, approval.snapshotRevision);
  }
}

function calculateSnapshotRevision(snapshot: ResultVerificationSourceSnapshot): string {
  const canonical = {
    eventId: snapshot.eventId,
    resultScope: snapshot.resultScope,
    policy: {
      topIndividualResults: snapshot.configuredIndividualChecks,
      topTeamResults: snapshot.configuredTeamChecks,
    },
    sourceRevision: snapshot.sourceRevision,
    teamSnapshotRevision: snapshot.teamSnapshotRevision,
    results: snapshot.results.map((result) => ({
      resultId: result.resultId,
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
  resultScope: ResultApprovalScope;
  resultCount: number;
  configuredIndividualChecks: number;
  configuredTeamChecks: number;
  requiredItems: readonly VerificationResultItemDto[];
  allResultsConfirmed: boolean;
  sourceIssues: readonly string[];
}): string[] {
  const issues: string[] = [...input.sourceIssues];
  const label = input.resultScope === 'FINAL' ? 'Final' : 'qualification';
  if (input.resultCount === 0) issues.push(`No ${label} results are available`);
  if (input.configuredIndividualChecks === 0 && input.configuredTeamChecks === 0) {
    issues.push('No result verification policy is configured for this competition type');
  }
  if (!input.allResultsConfirmed) issues.push(`All ${label} results must be complete and confirmed`);
  if (input.requiredItems.some((item) => item.projectionIssues.length > 0)) {
    issues.push('At least one required result has unresolved projection issues');
  }
  if (input.requiredItems.some((item) => !item.currentCheck?.qualifies)) {
    issues.push('Every required result needs a current matched verification');
  }
  return [...new Set(issues)];
}

function toCheckDto(check: ResultVerificationCheck, result: VerificationResultItemDto): ResultVerificationCheckDto {
  const current = check.resultId === result.resultId && check.resultRevision === result.revision;
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
      current &&
      check.evidenceSource !== 'OTHER' &&
      check.comparisonStatus === 'MATCHED' &&
      (result.decisionCount === 0 || check.manualInterventionsReviewed),
  };
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
    signingEvidence: entry.signingEvidence,
    active,
    current: active && entry.type === 'APPROVAL' && entry.snapshotRevision === currentSnapshotRevision,
  };
}
