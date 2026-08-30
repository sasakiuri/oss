import { ISSF_2026_ARMIX_FINAL, ISSF_2026_AR60_FINAL } from '@sasakiuri/saika-rules';
import { describe, expect, it, vi } from 'vitest';

import type { IFinalResultsReader } from '@/main/modules/results';
import type { MixedTeamFinalResultRecord } from '@/main/modules/team-results';
import {
  FinalResultVerificationSource,
  ResultVerificationService,
  ResultVerificationSourceRegistry,
} from '@/main/modules/result-verification';
import type { IResultVerificationRepository } from '@/main/modules/result-verification/domain/IResultVerificationRepository';
import type { ResultListApprovalEntry } from '@/main/modules/result-verification/domain/ResultListApprovalEntry';
import type { ResultVerificationCheck } from '@/main/modules/result-verification/domain/ResultVerificationCheck';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import { CompetitionTypeRegistry, competitionTypeFromRulePack } from '@/shared/competitionTypes';
import type { FinalRankedResultDto } from '@/shared/ipc/contracts';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';

function finalResult(id: string, participantId: string, rank: number): FinalRankedResultDto {
  return {
    id,
    participantId,
    sourceRank: rank,
    rank,
    playerName: `Finalist ${rank}`,
    affiliation: 'JPN',
    firingPointNumber: rank,
    stage1Shots: [10.1, 10.2],
    stage1Total: 20.3,
    stage2Shots: [10.3],
    stage2Total: 10.3,
    seriesScores: [20.3, 10.3],
    seriesShotCounts: [2, 1],
    baseTotalScore: 30.6,
    totalScore: 30.6,
    scoreAdjustment: 0,
    deductionTotal: 0,
    classificationCode: null,
    decisionCount: 0,
    projectionIssues: [],
    scoringRevision: String(rank).repeat(64),
    placementReviewId: null,
    placementReviewRequired: false,
    remarks: '',
    status: rank > 2 ? 'eliminated' : 'finished',
  };
}

function repository(): IResultVerificationRepository & {
  checks: ResultVerificationCheck[];
  approvals: ResultListApprovalEntry[];
} {
  const checks: ResultVerificationCheck[] = [];
  const approvals: ResultListApprovalEntry[] = [];
  return {
    checks,
    approvals,
    appendCheck: (check) => checks.push(check),
    findChecksByEvent: () => [...checks],
    appendApprovalEntry: (entry) => approvals.push(entry),
    findApprovalEntryById: (id) => approvals.find((entry) => entry.id === id) ?? null,
    findApprovalEntriesByEvent: (_eventId, scope) => approvals.filter((entry) => entry.resultScope === scope),
  };
}

describe('Final result verification flow', () => {
  it('checks and signs an individual Final through the scope-neutral workflow', async () => {
    const results = [
      finalResult('22222222-2222-4222-8222-222222222222', 'athlete-1', 1),
      finalResult('33333333-3333-4333-8333-333333333333', 'athlete-2', 2),
    ];
    const competitionTypes = new CompetitionTypeRegistry();
    competitionTypes.register(competitionTypeFromRulePack(ISSF_2026_AR60_FINAL));
    const queryBus = {
      execute: vi.fn(async () => ({ id: EVENT_ID, eventType: ISSF_2026_AR60_FINAL.eventCode })),
    } as unknown as QueryBus;
    const reader = {
      getByEvent: vi.fn(async () => results),
      getSnapshot: vi.fn(async () => ({
        eventId: EVENT_ID,
        scoringRevision: 'a'.repeat(64),
        currentPlacementReviewId: null,
        results,
      })),
    } satisfies IFinalResultsReader;
    const source = new FinalResultVerificationSource(queryBus, reader, { findByEvent: () => [] }, competitionTypes);
    const store = repository();
    const service = new ResultVerificationService(store, new ResultVerificationSourceRegistry([source]));

    const initial = await service.getStatus(EVENT_ID, 'FINAL');
    expect(initial).toMatchObject({
      resultScope: 'FINAL',
      configuredIndividualChecks: 10,
      requiredIndividualChecks: 2,
      allResultsConfirmed: true,
      readyForApproval: false,
    });

    for (const result of initial.results) {
      await service.addCheck({
        eventId: EVENT_ID,
        resultScope: 'FINAL',
        resultId: result.resultId,
        resultRevision: result.revision,
        evidenceSource: 'INDEPENDENT_MEMORY',
        evidenceReference: `Final memory rank ${result.rank}`,
        comparisonStatus: 'MATCHED',
        manualInterventionsReviewed: false,
        officialName: 'RTS Jury A',
      });
    }
    const ready = await service.getStatus(EVENT_ID, 'FINAL');
    const approval = await service.approve({
      eventId: EVENT_ID,
      resultScope: 'FINAL',
      snapshotRevision: ready.snapshotRevision,
      statement: 'Final result list verified',
      officialName: 'RTS Jury B',
    });

    expect(approval).toMatchObject({ resultScope: 'FINAL', current: true });
    expect(store.checks).toHaveLength(2);
  });

  it('adapts Mixed Team Final aggregates as independently checkable result items', async () => {
    const competitionTypes = new CompetitionTypeRegistry();
    competitionTypes.register(competitionTypeFromRulePack(ISSF_2026_ARMIX_FINAL, { includeTeamResults: true }));
    const queryBus = {
      execute: vi.fn(async () => ({ id: EVENT_ID, eventType: ISSF_2026_ARMIX_FINAL.eventCode })),
    } as unknown as QueryBus;
    const reader = {
      getByEvent: vi.fn(async () => []),
      getSnapshot: vi.fn(async () => ({
        eventId: EVENT_ID,
        scoringRevision: 'a'.repeat(64),
        currentPlacementReviewId: null,
        results: [],
      })),
    } satisfies IFinalResultsReader;
    const mixed = [1, 2, 3, 4].map(mixedResult);
    const source = new FinalResultVerificationSource(queryBus, reader, { findByEvent: () => mixed }, competitionTypes);
    const service = new ResultVerificationService(repository(), new ResultVerificationSourceRegistry([source]));

    const status = await service.getStatus(EVENT_ID, 'FINAL');

    expect(status).toMatchObject({
      configuredIndividualChecks: 3,
      requiredIndividualChecks: 3,
      allResultsConfirmed: true,
    });
    expect(status.results.map((result) => [result.rank, result.required])).toEqual([
      [1, true],
      [2, true],
      [3, true],
      [4, false],
    ]);
    expect(status.results[0]).toMatchObject({ participantId: 'TEAM:team-1', playerName: 'Team 1' });
  });
});

function mixedResult(rank: number): MixedTeamFinalResultRecord {
  return {
    id: `${rank}4444444-4444-4444-8444-444444444444`,
    eventId: EVENT_ID,
    sourceCompetitionId: '55555555-5555-4555-8555-555555555555',
    teamId: `team-${rank}`,
    teamName: `Team ${rank}`,
    nationCode: 'JPN',
    members: [
      {
        participantId: `athlete-${rank}-f`,
        playerName: 'Female',
        gender: 'F',
        firingPointNumber: rank * 2 - 1,
        stage1Shots: [10.1],
        stage2Shots: [10.2],
        totalScore: 20.3,
      },
      {
        participantId: `athlete-${rank}-m`,
        playerName: 'Male',
        gender: 'M',
        firingPointNumber: rank * 2,
        stage1Shots: [10.1],
        stage2Shots: [10.2],
        totalScore: 20.3,
      },
    ],
    stage1Total: 20.2,
    stage2Total: 20.4,
    totalScore: 40.6,
    finalRank: rank,
    eliminatedAtShot: rank === 1 ? null : 24 - rank,
    shootoffId: null,
    remarks: '',
    createdAt: '2026-08-01T00:00:00.000Z',
  };
}
