import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IFinalPlacementReviewRepository } from '@/main/modules/final-placement-review';
import { FinalPlacementReviewService } from '@/main/modules/final-placement-review/application/FinalPlacementReviewService';
import type { FinalPlacementReviewEntry } from '@/main/modules/final-placement-review/domain/FinalPlacementReviewEntry';
import type { FinalResultsSnapshot, IFinalResultsReader } from '@/main/modules/results';
import type { FinalRankedResultDto } from '@/shared/ipc/contracts';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const RESULT_1 = '22222222-2222-4222-8222-222222222222';
const RESULT_2 = '33333333-3333-4333-8333-333333333333';
const REVISION = 'a'.repeat(64);

describe('FinalPlacementReviewService', () => {
  let history: FinalPlacementReviewEntry[];
  let repository: IFinalPlacementReviewRepository;
  let snapshot: FinalResultsSnapshot;
  let reader: IFinalResultsReader;
  let service: FinalPlacementReviewService;

  beforeEach(() => {
    history = [];
    repository = {
      append: vi.fn((entry) => history.push(entry)),
      findById: vi.fn((id) => history.find((entry) => entry.id === id) ?? null),
      findByEventId: vi.fn(() => [...history]),
    };
    snapshot = {
      eventId: EVENT_ID,
      scoringRevision: REVISION,
      currentPlacementReviewId: null,
      results: [
        createResult(RESULT_1, 'participant-1', 'Athlete One', 1, true),
        createResult(RESULT_2, 'participant-2', 'Athlete Two', 2, false),
      ],
    };
    reader = {
      getSnapshot: vi.fn(async () => snapshot),
      getByEvent: vi.fn(async () => [...snapshot.results]),
    };
    service = new FinalPlacementReviewService(reader, repository);
  });

  it('reports that an unreviewed score intervention requires placement review', async () => {
    const status = await service.getStatus(EVENT_ID);

    expect(status).toMatchObject({
      eventId: EVENT_ID,
      scoringRevision: REVISION,
      reviewRequired: true,
      currentReview: null,
    });
    expect(status.issues).toContain('Final placements require review after a score or classification intervention');
  });

  it('records a complete explicit placement snapshot and revokes only the active review', async () => {
    const review = await service.record({
      eventId: EVENT_ID,
      scoringRevision: REVISION,
      placements: [
        { resultId: RESULT_1, participantId: 'participant-1', rank: 2 },
        { resultId: RESULT_2, participantId: 'participant-2', rank: 1 },
      ],
      ruleReference: '6.17',
      statement: 'Elimination and shoot-off history reviewed',
      officialName: 'Final Jury Chair',
    });

    expect(review).toMatchObject({ type: 'REVIEW', active: true, current: true });
    expect(history).toHaveLength(1);

    const revocation = await service.revoke({
      reviewId: review.id,
      ruleReference: '6.17',
      reason: 'Placement requires correction',
      officialName: 'Final Jury Chair',
    });
    expect(revocation).toMatchObject({
      type: 'REVOCATION',
      reversesReviewId: review.id,
      active: false,
      current: false,
    });
    await expect(
      service.revoke({
        reviewId: review.id,
        ruleReference: '6.17',
        reason: 'Duplicate revocation',
        officialName: 'Final Jury Chair',
      }),
    ).rejects.toThrow('is not active');
  });

  it('rejects a stale revision and incomplete placement coverage', async () => {
    await expect(
      service.record({
        eventId: EVENT_ID,
        scoringRevision: 'b'.repeat(64),
        placements: [],
        ruleReference: '6.17',
        statement: 'Stale review',
        officialName: 'Final Jury Chair',
      }),
    ).rejects.toThrow('Final scoring changed');

    await expect(
      service.record({
        eventId: EVENT_ID,
        scoringRevision: REVISION,
        placements: [{ resultId: RESULT_1, participantId: 'participant-1', rank: 1 }],
        ruleReference: '6.17',
        statement: 'Incomplete review',
        officialName: 'Final Jury Chair',
      }),
    ).rejects.toThrow('Every non-classified Final result');
  });
});

function createResult(
  id: string,
  participantId: string,
  playerName: string,
  rank: number,
  placementReviewRequired: boolean,
): FinalRankedResultDto {
  return {
    id,
    participantId,
    sourceRank: rank,
    rank,
    playerName,
    affiliation: 'Team',
    firingPointNumber: rank,
    stage1Shots: [],
    stage1Total: 0,
    stage2Shots: [],
    stage2Total: 0,
    seriesScores: [],
    seriesShotCounts: [],
    baseTotalScore: 0,
    totalScore: 0,
    scoreAdjustment: placementReviewRequired ? 1 : 0,
    deductionTotal: placementReviewRequired ? 1 : 0,
    classificationCode: null,
    decisionCount: placementReviewRequired ? 1 : 0,
    projectionIssues: placementReviewRequired
      ? ['Final placement must be reviewed after a score or classification intervention']
      : [],
    scoringRevision: id === RESULT_1 ? 'c'.repeat(64) : 'd'.repeat(64),
    placementReviewId: null,
    placementReviewRequired,
    remarks: '',
    status: 'finished',
  };
}
