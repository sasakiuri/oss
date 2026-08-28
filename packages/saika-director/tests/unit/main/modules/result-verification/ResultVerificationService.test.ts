import { describe, expect, it, vi } from 'vitest';

import type { IQualificationResultsReader } from '@/main/modules/results';
import { ResultVerificationService } from '@/main/modules/result-verification/application/ResultVerificationService';
import type { IResultVerificationRepository } from '@/main/modules/result-verification/domain/IResultVerificationRepository';
import type { ResultListApprovalEntry } from '@/main/modules/result-verification/domain/ResultListApprovalEntry';
import type { ResultVerificationCheck } from '@/main/modules/result-verification/domain/ResultVerificationCheck';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { RankedResultDto } from '@/shared/ipc/contracts';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const RESULT_ONE_ID = '22222222-2222-4222-8222-222222222222';
const RESULT_TWO_ID = '33333333-3333-4333-8333-333333333333';

function rankedResult(props: {
  id: string;
  participantId: string;
  rank: number;
  revision: string;
  decisionCount?: number;
}): RankedResultDto {
  return {
    id: props.id,
    participantId: props.participantId,
    rank: props.rank,
    playerName: `Athlete ${props.rank}`,
    familyName: `Athlete ${props.rank}`,
    affiliation: 'Team',
    relayNumber: 1,
    seriesScores: [100],
    baseTotalScore: 100,
    totalScore: 100,
    scoreAdjustment: 0,
    deductionTotal: 0,
    remarks: [],
    classificationCode: null,
    decisionCount: props.decisionCount ?? 0,
    projectionIssues: [],
    evidenceSummary: {
      expectedShots: 10,
      linkedShots: 10,
      independentDecimalShots: 10,
      innerTenClassifiedShots: 10,
    },
    revision: props.revision,
    confirmedAt: '2026-08-28T00:00:00.000Z',
    status: 'confirmed',
  };
}

function harness(policy = { topIndividualResults: 10, topTeamResults: 0 }) {
  let results = [
    rankedResult({
      id: RESULT_ONE_ID,
      participantId: 'participant-1',
      rank: 1,
      revision: 'a'.repeat(64),
      decisionCount: 1,
    }),
    rankedResult({
      id: RESULT_TWO_ID,
      participantId: 'participant-2',
      rank: 2,
      revision: 'b'.repeat(64),
    }),
  ];
  const checks: ResultVerificationCheck[] = [];
  const approvals: ResultListApprovalEntry[] = [];
  const repository: IResultVerificationRepository = {
    appendCheck: vi.fn((check) => checks.push(check)),
    findChecksByEvent: vi.fn(() => [...checks]),
    appendApprovalEntry: vi.fn((entry) => approvals.push(entry)),
    findApprovalEntryById: vi.fn((id) => approvals.find((entry) => entry.id === id) ?? null),
    findApprovalEntriesByEvent: vi.fn(() => [...approvals]),
  };
  const reader: IQualificationResultsReader = {
    getByEvent: vi.fn(async () => results),
    getByRelay: vi.fn(async () => results),
  };
  const queryBus = {
    execute: vi.fn(async () => ({
      id: EVENT_ID,
      name: 'Qualification',
      eventType: 'TEST',
      round: 'Qualification',
      sortOrder: 0,
    })),
  } as unknown as QueryBus;
  const competitionTypes = {
    get: vi.fn(() => ({ resultVerification: policy })),
  } as unknown as CompetitionTypeRegistry;
  const service = new ResultVerificationService(queryBus, reader, repository, competitionTypes);
  return {
    service,
    checks,
    approvals,
    setResults: (next: RankedResultDto[]) => {
      results = next;
    },
    getResults: () => results,
  };
}

describe('ResultVerificationService', () => {
  it('requires current matched top-result checks before appending an RTS Jury approval', async () => {
    const { service, checks, approvals, getResults } = harness();

    const initial = await service.getStatus(EVENT_ID);
    expect(initial).toMatchObject({
      requiredIndividualChecks: 2,
      checkedIndividualResults: 0,
      readyForApproval: false,
    });

    for (const result of getResults()) {
      await service.addCheck({
        eventId: EVENT_ID,
        resultId: result.id,
        resultRevision: result.revision,
        evidenceSource: 'INDEPENDENT_MEMORY',
        evidenceReference: `Memory ${result.rank}`,
        comparisonStatus: 'MATCHED',
        manualInterventionsReviewed: result.decisionCount > 0,
        officialName: 'RTS Jury A',
      });
    }

    const checked = await service.getStatus(EVENT_ID);
    expect(checks).toHaveLength(2);
    expect(checked).toMatchObject({ checkedIndividualResults: 2, readyForApproval: true });

    const approval = await service.approve({
      eventId: EVENT_ID,
      snapshotRevision: checked.snapshotRevision,
      statement: 'Official Final Results verified',
      officialName: 'RTS Jury B',
    });

    expect(approval).toMatchObject({ type: 'APPROVAL', active: true, current: true });
    expect(approval.checkIds).toEqual(checks.map((check) => check.id));
    expect(approvals).toHaveLength(1);
    expect((await service.getStatus(EVENT_ID)).currentApproval?.id).toBe(approval.id);
  });

  it('marks checks and an approval stale without deleting their history when a result changes', async () => {
    const { service, setResults, getResults } = harness();
    const first = getResults()[0]!;
    await service.addCheck({
      eventId: EVENT_ID,
      resultId: first.id,
      resultRevision: first.revision,
      evidenceSource: 'TARGET_PRINTOUT',
      evidenceReference: 'Printout 1',
      comparisonStatus: 'MATCHED',
      manualInterventionsReviewed: true,
      officialName: 'RTS Jury A',
    });
    const second = getResults()[1]!;
    await service.addCheck({
      eventId: EVENT_ID,
      resultId: second.id,
      resultRevision: second.revision,
      evidenceSource: 'TARGET_PRINTOUT',
      evidenceReference: 'Printout 2',
      comparisonStatus: 'MATCHED',
      manualInterventionsReviewed: false,
      officialName: 'RTS Jury A',
    });
    const ready = await service.getStatus(EVENT_ID);
    await service.approve({
      eventId: EVENT_ID,
      snapshotRevision: ready.snapshotRevision,
      statement: 'Verified',
      officialName: 'RTS Jury B',
    });

    setResults([{ ...first, revision: 'c'.repeat(64), totalScore: 99.9 }, second]);
    const changed = await service.getStatus(EVENT_ID);

    expect(changed.currentApproval).toBeNull();
    expect(changed.approvalHistory).toHaveLength(1);
    expect(changed.approvalHistory[0]).toMatchObject({ active: true, current: false });
    expect(changed.results[0]?.latestCheck).toMatchObject({ current: false });
    expect(changed.results[0]?.currentCheck).toBeNull();
    expect(changed.readyForApproval).toBe(false);
  });

  it('records and revokes approval through linked append-only entries', async () => {
    const { service, getResults, approvals } = harness();
    for (const result of getResults()) {
      await service.addCheck({
        eventId: EVENT_ID,
        resultId: result.id,
        resultRevision: result.revision,
        evidenceSource: 'OTHER',
        evidenceReference: 'Controlled export',
        comparisonStatus: 'MATCHED',
        manualInterventionsReviewed: true,
        officialName: 'RTS Jury A',
      });
    }
    const status = await service.getStatus(EVENT_ID);
    const approval = await service.approve({
      eventId: EVENT_ID,
      snapshotRevision: status.snapshotRevision,
      statement: 'Verified',
      officialName: 'RTS Jury B',
    });

    const revocation = await service.revokeApproval({
      approvalId: approval.id,
      reason: 'Approval entered by the wrong official',
      officialName: 'RTS Jury Chair',
    });

    expect(revocation).toMatchObject({ type: 'REVOCATION', reversesApprovalId: approval.id, active: false });
    expect(approvals).toHaveLength(2);
    expect((await service.getStatus(EVENT_ID)).currentApproval).toBeNull();
  });

  it('blocks sign-off when a competition policy requires unsupported team verification', async () => {
    const { service } = harness({ topIndividualResults: 0, topTeamResults: 3 });

    const status = await service.getStatus(EVENT_ID);

    expect(status).toMatchObject({
      requiredIndividualChecks: 0,
      requiredTeamChecks: 3,
      teamVerificationSupported: false,
      readyForApproval: false,
    });
    expect(status.issues).toContain('Verification of the top 3 team results is not implemented');
    await expect(
      service.approve({
        eventId: EVENT_ID,
        snapshotRevision: status.snapshotRevision,
        statement: 'Verified',
        officialName: 'RTS Jury A',
      }),
    ).rejects.toThrow('Result list is not ready');
  });
});
