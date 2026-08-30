import { describe, expect, it, vi } from 'vitest';

import { EventId, ParticipantId } from '@/main/modules/championship';
import { FinalPlacementReviewEntry } from '@/main/modules/final-placement-review/domain/FinalPlacementReviewEntry';
import type { IFinalPlacementReviewRepository } from '@/main/modules/final-placement-review/domain/IFinalPlacementReviewRepository';
import { FinalResultsReader } from '@/main/modules/results/application/FinalResultsReader';
import { FinalResult } from '@/main/modules/results/domain/FinalResult';
import { FinalResultId } from '@/main/modules/results/domain/FinalResultId';
import type { IFinalResultRepository } from '@/main/modules/results/domain/IFinalResultRepository';
import type { IScoringDecisionRepository } from '@/main/modules/scoring-decisions';
import { ScoringDecision } from '@/main/modules/scoring-decisions/domain/ScoringDecision';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import { CompetitionTypeRegistry } from '@/shared/competitionTypes/CompetitionTypeRegistry';
import { BR60S_FINAL } from '@/shared/competitionTypes/definitions/BR60S_FINAL';

describe('FinalResultsReader', () => {
  it('projects Final decisions over variable series without silently changing source placement', async () => {
    const eventId = '11111111-1111-4111-8111-111111111111';
    const participantId = '22222222-2222-4222-8222-222222222222';
    const result = FinalResult.reconstruct(
      FinalResultId.create('33333333-3333-4333-8333-333333333333'),
      EventId.reconstruct(eventId),
      ParticipantId.reconstruct(participantId),
      'Final Athlete',
      'Team',
      1,
      Array.from({ length: 10 }, () => 10),
      100,
      Array.from({ length: 14 }, () => 10),
      140,
      240,
      1,
      undefined,
      undefined,
      'SO',
      'finished',
    );
    const history = [
      ScoringDecision.create({
        eventId,
        participantId,
        relayNumber: 1,
        resultScope: 'FINAL',
        resultIdAtDecision: result.id.value,
        sourceCompetitionId: null,
        type: 'DEDUCTION',
        applicationPolicy: 'LOWEST_SHOT_IN_SERIES',
        pointsX10: 10,
        seriesIndex: 2,
        ruleReference: '6.17',
        publicRemark: 'One-point deduction',
        officialName: 'Final Jury',
      }),
    ];
    const results = {
      findByEventId: vi.fn(() => [result]),
    } as unknown as IFinalResultRepository;
    const decisions: IScoringDecisionRepository = {
      append: vi.fn(),
      findById: vi.fn(() => null),
      findByTarget: vi.fn(() => [...history]),
      findByEventId: vi.fn(() => [...history]),
    };
    const queryBus = {
      execute: vi.fn(async () => ({
        id: eventId,
        name: 'Final',
        eventType: BR60S_FINAL.id,
        round: 'Final',
        sortOrder: 0,
      })),
    } as unknown as QueryBus;
    const registry = new CompetitionTypeRegistry();
    registry.register(BR60S_FINAL);
    const reviews: FinalPlacementReviewEntry[] = [];
    const placementReviews = {
      findByEventId: vi.fn(() => [...reviews]),
    } as unknown as IFinalPlacementReviewRepository;
    const reader = new FinalResultsReader(queryBus, results, decisions, placementReviews, registry);

    const snapshot = await reader.getSnapshot(eventId);
    const projected = snapshot.results[0]!;

    expect(projected).toMatchObject({
      participantId,
      sourceRank: 1,
      rank: 1,
      seriesShotCounts: [5, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      seriesScores: [50, 50, 9, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
      baseTotalScore: 240,
      stage1Total: 100,
      stage2Total: 139,
      totalScore: 239,
      scoreAdjustment: 1,
      deductionTotal: 1,
      decisionCount: 1,
      placementReviewRequired: true,
      placementReviewId: null,
      remarks: 'SO; One-point deduction',
    });
    expect(projected.projectionIssues).toContain(
      'Final placement must be reviewed after a score or classification intervention',
    );
    expect(result.totalScore).toBe(240);
    expect(result.finalRank).toBe(1);
    expect(snapshot.scoringRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(projected.scoringRevision).toMatch(/^[a-f0-9]{64}$/);

    const review = FinalPlacementReviewEntry.createReview({
      eventId,
      scoringRevision: snapshot.scoringRevision,
      placements: [{ resultId: result.id.value, participantId, rank: 2 }],
      ruleReference: '6.17',
      statement: 'Elimination and shoot-off history reviewed',
      officialName: 'Final Jury Chair',
    });
    reviews.push(review);
    const reviewed = (await reader.getByEvent(eventId))[0]!;
    expect(reviewed).toMatchObject({
      sourceRank: 1,
      rank: 2,
      placementReviewId: review.id,
      placementReviewRequired: false,
    });
    expect(reviewed.projectionIssues).not.toContain(
      'Final placement must be reviewed after a score or classification intervention',
    );

    history.push(
      ScoringDecision.create({
        eventId,
        participantId,
        relayNumber: 1,
        resultScope: 'FINAL',
        resultIdAtDecision: result.id.value,
        sourceCompetitionId: null,
        type: 'ANNUL_SHOT',
        applicationPolicy: 'SPECIFIC_SHOT',
        seriesIndex: 2,
        shotIndex: 10,
        ruleReference: '6.17',
        publicRemark: 'Shot 11 annulled',
        officialName: 'Final Jury',
      }),
    );
    const stale = (await reader.getByEvent(eventId))[0]!;
    expect(stale).toMatchObject({ rank: 1, placementReviewId: null, placementReviewRequired: true });
    expect(stale.scoringRevision).not.toBe(projected.scoringRevision);
  });

  it('supports an incomplete current Final series and non-scoring remarks without placement review', async () => {
    const eventId = '44444444-4444-4444-8444-444444444444';
    const participantId = '55555555-5555-4555-8555-555555555555';
    const result = FinalResult.reconstruct(
      FinalResultId.create('66666666-6666-4666-8666-666666666666'),
      EventId.reconstruct(eventId),
      ParticipantId.reconstruct(participantId),
      'Partial Athlete',
      'Team',
      2,
      [10, 10, 10, 10, 10, 10],
      60,
      [],
      0,
      60,
      2,
      undefined,
      undefined,
      '',
      'in_progress',
    );
    const history = [
      ScoringDecision.create({
        eventId,
        participantId,
        relayNumber: 1,
        resultScope: 'FINAL',
        resultIdAtDecision: result.id.value,
        sourceCompetitionId: null,
        type: 'REMARK',
        applicationPolicy: 'NONE',
        ruleReference: '6.14.6',
        publicRemark: 'Timing reviewed',
        officialName: 'Final Jury',
      }),
    ];
    const results = { findByEventId: vi.fn(() => [result]) } as unknown as IFinalResultRepository;
    const decisions = {
      findByEventId: vi.fn(() => history),
    } as unknown as IScoringDecisionRepository;
    const queryBus = {
      execute: vi.fn(async () => ({ eventType: BR60S_FINAL.id })),
    } as unknown as QueryBus;
    const registry = new CompetitionTypeRegistry();
    registry.register(BR60S_FINAL);
    const placementReviews = {
      findByEventId: vi.fn(() => []),
    } as unknown as IFinalPlacementReviewRepository;

    const projected = (
      await new FinalResultsReader(queryBus, results, decisions, placementReviews, registry).getByEvent(eventId)
    )[0]!;

    expect(projected.seriesShotCounts).toEqual([5, 1]);
    expect(projected.seriesScores).toEqual([50, 10]);
    expect(projected.placementReviewRequired).toBe(false);
    expect(projected.projectionIssues).toEqual([]);
    expect(projected.remarks).toBe('Timing reviewed');
  });
});
