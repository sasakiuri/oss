import { describe, expect, it, vi } from 'vitest';
import { OfficialSigningPolicy, type IOfficialSigningPolicy, type SigningActor } from '@/main/modules/official-signing';

import type { IQualificationResultsReader } from '@/main/modules/results';
import {
  QualificationResultVerificationSource,
  ResultVerificationService,
  ResultVerificationSourceRegistry,
  type ITeamResultVerificationReadiness,
} from '@/main/modules/result-verification';
import type { IResultVerificationRepository } from '@/main/modules/result-verification/domain/IResultVerificationRepository';
import type { ResultListApprovalEntry } from '@/main/modules/result-verification/domain/ResultListApprovalEntry';
import type { ResultVerificationCheck } from '@/main/modules/result-verification/domain/ResultVerificationCheck';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { RankedResultDto } from '@/shared/ipc/contracts';
import { VerifiedResultPublicationReadiness } from '@/main/modules/result-publication/infra/VerifiedResultPublicationReadiness';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const RESULT_ONE_ID = '22222222-2222-4222-8222-222222222222';
const RESULT_TWO_ID = '33333333-3333-4333-8333-333333333333';
const TEAM_RUN_ID = '44444444-4444-4444-8444-444444444444';

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
      scoreConflicts: 0,
    },
    revision: props.revision,
    confirmedAt: '2026-08-28T00:00:00.000Z',
    status: 'confirmed',
  };
}

function harness(
  policy = { topIndividualResults: 10, topTeamResults: 0 },
  options: {
    teamFormat?: 'MIXED_PAIR';
    teamVerification?: ITeamResultVerificationReadiness;
    signing?: IOfficialSigningPolicy;
  } = {},
) {
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
    get: vi.fn(() => ({ resultVerification: policy, teamFormat: options.teamFormat })),
  } as unknown as CompetitionTypeRegistry;
  const service = new ResultVerificationService(
    repository,
    new ResultVerificationSourceRegistry([
      new QualificationResultVerificationSource(queryBus, reader, competitionTypes, options.teamVerification),
    ]),
    options.signing,
  );
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
  it('requires the RTS role for personal approvals and preserves separate revocation provenance', async () => {
    let actor: SigningActor = { id: TEAM_RUN_ID, name: 'Current RTS official', roles: ['JURY_MEMBER'] };
    const signing = new OfficialSigningPolicy({
      currentActor: () => actor,
      authenticationRequired: () => true,
      findActiveAccount: () => actor,
    });
    const { service, approvals, getResults } = harness({ topIndividualResults: 1, topTeamResults: 0 }, { signing });
    await service.addCheck({
      eventId: EVENT_ID,
      resultScope: 'QUALIFICATION',
      resultId: RESULT_ONE_ID,
      resultRevision: getResults()[0]!.revision,
      evidenceSource: 'INDEPENDENT_MEMORY',
      evidenceReference: 'Memory 12',
      comparisonStatus: 'MATCHED',
      manualInterventionsReviewed: true,
      officialName: 'Check official',
    });
    const status = await service.getStatus(EVENT_ID);
    const request = {
      eventId: EVENT_ID,
      resultScope: 'QUALIFICATION' as const,
      snapshotRevision: status.snapshotRevision,
      statement: 'Results verified',
      officialName: 'Supplied name',
    };
    await expect(service.approve(request)).rejects.toThrow('required official role');
    expect(approvals).toHaveLength(0);
    actor = { ...actor, roles: ['RTS_JURY'] };
    const approval = await service.approve(request);
    expect(approval).toMatchObject({
      officialName: actor.name,
      signingEvidence: { method: 'AUTHENTICATED', actorId: actor.id, recordedBy: actor.name },
    });

    actor = { ...actor, roles: [] };
    const revoke = { approvalId: approval.id, reason: 'Correction needed', officialName: 'External RTS official' };
    await expect(service.revokeApproval(revoke)).rejects.toThrow('required official role');
    await expect(service.revokeApproval({ ...revoke, method: 'EXTERNAL' })).rejects.toThrow('evidence');
    expect(approvals).toHaveLength(1);
    const revocation = await service.revokeApproval({
      ...revoke,
      method: 'EXTERNAL',
      recordedBy: 'Forged recorder',
      evidenceReference: 'Signed RTS form 42',
    });
    expect(revocation).toMatchObject({
      officialName: 'External RTS official',
      signingEvidence: {
        method: 'EXTERNAL',
        actorId: actor.id,
        recordedBy: actor.name,
        evidenceReference: 'Signed RTS form 42',
      },
    });
    const revoked = await service.getStatus(EVENT_ID);
    expect(revoked.currentApproval).toBeNull();
    expect(revoked.approvalHistory).toHaveLength(2);
    expect(revoked.approvalHistory.find((entry) => entry.id === approval.id)?.signingEvidence?.method).toBe(
      'AUTHENTICATED',
    );
  });

  it('blocks approval and publication for unresolved ranks outside the backup-check cutoff', async () => {
    const { service, getResults, setResults } = harness({ topIndividualResults: 1, topTeamResults: 0 });
    const first = getResults()[0]!;
    await service.addCheck({
      eventId: EVENT_ID,
      resultScope: 'QUALIFICATION',
      resultId: first.id,
      resultRevision: first.revision,
      evidenceSource: 'INDEPENDENT_MEMORY',
      evidenceReference: 'External printout',
      comparisonStatus: 'MATCHED',
      manualInterventionsReviewed: true,
      officialName: 'RTS Jury',
    });
    const before = await service.getStatus(EVENT_ID);
    await service.approve({
      eventId: EVENT_ID,
      resultScope: 'QUALIFICATION',
      snapshotRevision: before.snapshotRevision,
      statement: 'Verified',
      officialName: 'RTS Jury',
    });
    setResults(
      getResults().map((result, index) =>
        index === 1 ? { ...result, projectionIssues: ['Qualification tie needs inner-ten evidence'] } : result,
      ),
    );
    const after = await service.getStatus(EVENT_ID);
    expect(after.requiredIndividualChecks).toBe(1);
    expect(after.readyForApproval).toBe(false);
    expect(after.issues).toContain('Athlete 2: Qualification tie needs inner-ten evidence');
    await expect(
      service.approve({
        eventId: EVENT_ID,
        resultScope: 'QUALIFICATION',
        snapshotRevision: after.snapshotRevision,
        statement: 'Verified',
        officialName: 'RTS Jury',
      }),
    ).rejects.toThrow('not ready');
    const publication = await new VerifiedResultPublicationReadiness(service).getCurrent(EVENT_ID, 'QUALIFICATION');
    expect(publication.verificationIssues).toContain('Athlete 2: Qualification tie needs inner-ten evidence');
  });

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
        resultScope: 'QUALIFICATION',
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
      resultScope: 'QUALIFICATION',
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
      resultScope: 'QUALIFICATION',
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
      resultScope: 'QUALIFICATION',
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
      resultScope: 'QUALIFICATION',
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
        resultScope: 'QUALIFICATION',
        resultId: result.id,
        resultRevision: result.revision,
        evidenceSource: 'TARGET_PRINTOUT',
        evidenceReference: 'Controlled printout',
        comparisonStatus: 'MATCHED',
        manualInterventionsReviewed: true,
        officialName: 'RTS Jury A',
      });
    }
    const status = await service.getStatus(EVENT_ID);
    const approval = await service.approve({
      eventId: EVENT_ID,
      resultScope: 'QUALIFICATION',
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
        resultScope: 'QUALIFICATION',
        snapshotRevision: status.snapshotRevision,
        statement: 'Verified',
        officialName: 'RTS Jury A',
      }),
    ).rejects.toThrow('Result list is not ready');
  });

  it('retains OTHER evidence without treating it as an ISSF 6.14.8 qualifying comparison', async () => {
    const { service, getResults } = harness({ topIndividualResults: 1, topTeamResults: 0 });
    const result = getResults()[0]!;

    const check = await service.addCheck({
      eventId: EVENT_ID,
      resultScope: 'QUALIFICATION',
      resultId: result.id,
      resultRevision: result.revision,
      evidenceSource: 'OTHER',
      evidenceReference: 'Non-EST controlled export',
      comparisonStatus: 'MATCHED',
      manualInterventionsReviewed: true,
      officialName: 'RTS Jury A',
    });

    expect(check.qualifies).toBe(false);
    expect((await service.getStatus(EVENT_ID)).readyForApproval).toBe(false);
  });

  it('accepts a current independent team-memory run through the readiness port', async () => {
    const teamVerification: ITeamResultVerificationReadiness = {
      assess: vi.fn(async () => ({
        supported: true,
        configuredChecks: 3,
        requiredChecks: 2,
        checkedResults: 2,
        snapshotRevision: 'd'.repeat(64),
        currentVerificationId: TEAM_RUN_ID,
        issues: [],
      })),
    };
    const { service } = harness(
      { topIndividualResults: 0, topTeamResults: 3 },
      { teamFormat: 'MIXED_PAIR', teamVerification },
    );

    const status = await service.getStatus(EVENT_ID);

    expect(teamVerification.assess).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      resultKind: 'MIXED_TEAM',
      configuredChecks: 3,
      requireResults: true,
    });
    expect(status).toMatchObject({
      configuredTeamChecks: 3,
      requiredTeamChecks: 2,
      checkedTeamResults: 2,
      teamVerificationRunId: TEAM_RUN_ID,
      readyForApproval: true,
    });

    const approval = await service.approve({
      eventId: EVENT_ID,
      resultScope: 'QUALIFICATION',
      snapshotRevision: status.snapshotRevision,
      statement: 'Team results verified',
      officialName: 'RTS Jury A',
    });
    expect(approval.checkIds).toEqual([TEAM_RUN_ID]);
  });

  it('marks approval stale when the official team-result snapshot changes', async () => {
    let revision = 'd'.repeat(64);
    let currentVerificationId: string | null = TEAM_RUN_ID;
    const teamVerification: ITeamResultVerificationReadiness = {
      assess: vi.fn(async () => ({
        supported: true,
        configuredChecks: 3,
        requiredChecks: 2,
        checkedResults: currentVerificationId ? 2 : 0,
        snapshotRevision: revision,
        currentVerificationId,
        issues: currentVerificationId
          ? []
          : ['Required team results need a current EST printout or independent-memory comparison'],
      })),
    };
    const { service } = harness({ topIndividualResults: 0, topTeamResults: 3 }, { teamVerification });
    const ready = await service.getStatus(EVENT_ID);
    await service.approve({
      eventId: EVENT_ID,
      resultScope: 'QUALIFICATION',
      snapshotRevision: ready.snapshotRevision,
      statement: 'Team results verified',
      officialName: 'RTS Jury A',
    });

    revision = 'e'.repeat(64);
    currentVerificationId = null;
    const changed = await service.getStatus(EVENT_ID);

    expect(changed.currentApproval).toBeNull();
    expect(changed.approvalHistory[0]).toMatchObject({ active: true, current: false });
    expect(changed.readyForApproval).toBe(false);
  });
});
