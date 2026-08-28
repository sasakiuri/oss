import { describe, expect, it, vi } from 'vitest';

import { EventId, ParticipantId } from '@/main/modules/championship';
import { Result } from '@/main/modules/results/domain/Result';
import { ResultId } from '@/main/modules/results/domain/ResultId';
import { AppendScoringDecisionHandler } from '@/main/modules/scoring-decisions/application/AppendScoringDecisionHandler';
import { RevokeScoringDecisionHandler } from '@/main/modules/scoring-decisions/application/RevokeScoringDecisionHandler';
import type { IScoringDecisionRepository } from '@/main/modules/scoring-decisions/domain/IScoringDecisionRepository';
import type { IScoringDecisionTargetResolver } from '@/main/modules/scoring-decisions/domain/IScoringDecisionTargetResolver';
import { type ScoringDecision } from '@/main/modules/scoring-decisions/domain/ScoringDecision';

function createHarness() {
  const result = Result.create(
    ResultId.reconstruct('11111111-1111-4111-8111-111111111111'),
    EventId.reconstruct('22222222-2222-4222-8222-222222222222'),
    ParticipantId.reconstruct('33333333-3333-4333-8333-333333333333'),
    'Athlete',
    'Team',
    60,
    [30, 30],
    [10, 10, 10, 10, 10, 10],
    1,
    'published',
    { totalShots: 6, totalSeries: 2 },
    '44444444-4444-4444-8444-444444444444',
  );
  const history: ScoringDecision[] = [];
  const decisions: IScoringDecisionRepository = {
    append: vi.fn((decision) => history.push(decision)),
    findById: vi.fn((id) => history.find((decision) => decision.id === id) ?? null),
    findByTarget: vi.fn(() => [...history]),
    findByEventId: vi.fn(() => [...history]),
  };
  const targets: IScoringDecisionTargetResolver = {
    resolve: vi.fn(async (_resultId, resultScope) => ({
      eventId: result.eventId.value,
      participantId: result.participantId.value,
      relayNumber: result.relayNumber,
      resultScope,
      resultIdAtDecision: result.id.value,
      sourceCompetitionId: result.sourceCompetitionId,
      seriesShotCounts: [3, 3],
    })),
  };
  return { result, history, decisions, targets };
}

describe('scoring decision handlers', () => {
  it('resolves a mutable result ID to a stable event/participant/relay target', async () => {
    const { result, history, decisions, targets } = createHarness();
    const dto = await new AppendScoringDecisionHandler(decisions, targets).execute({
      resultId: result.id.value,
      resultScope: 'QUALIFICATION',
      type: 'DEDUCTION',
      applicationPolicy: 'LOWEST_SHOT_IN_SERIES',
      pointsX10: 20,
      seriesIndex: 0,
      ruleReference: '6.14.7',
      publicRemark: 'Two-point deduction',
      officialName: 'Jury A',
    });

    expect(history).toHaveLength(1);
    expect(dto).toMatchObject({
      eventId: result.eventId.value,
      participantId: result.participantId.value,
      relayNumber: 1,
      resultScope: 'QUALIFICATION',
      resultIdAtDecision: result.id.value,
      active: true,
    });
  });

  it('accepts a Final decision through the same target port and validates its variable series', async () => {
    const { result, decisions, targets } = createHarness();
    vi.mocked(targets.resolve).mockResolvedValue({
      eventId: result.eventId.value,
      participantId: result.participantId.value,
      relayNumber: 1,
      resultScope: 'FINAL',
      resultIdAtDecision: result.id.value,
      sourceCompetitionId: null,
      seriesShotCounts: [5, 5, 2],
    });
    const handler = new AppendScoringDecisionHandler(decisions, targets);

    const dto = await handler.execute({
      resultId: result.id.value,
      resultScope: 'FINAL',
      type: 'DEDUCTION',
      applicationPolicy: 'SPECIFIC_SHOT',
      pointsX10: 10,
      seriesIndex: 2,
      shotIndex: 10,
      ruleReference: '6.17',
      publicRemark: 'One-point Final deduction',
      officialName: 'Final Jury',
    });

    expect(dto).toMatchObject({ resultScope: 'FINAL', seriesIndex: 2, shotIndex: 10 });
    await expect(
      handler.execute({
        resultId: result.id.value,
        resultScope: 'FINAL',
        type: 'ANNUL_SHOT',
        applicationPolicy: 'SPECIFIC_SHOT',
        seriesIndex: 2,
        shotIndex: 9,
        ruleReference: '6.14.6',
        publicRemark: 'Invalid target',
        officialName: 'Final Jury',
      }),
    ).rejects.toThrow('Shot 10 does not belong to series 3');
  });

  it('revokes by appending a linked audit entry and rejects a second revocation', async () => {
    const { result, history, decisions, targets } = createHarness();
    const original = await new AppendScoringDecisionHandler(decisions, targets).execute({
      resultId: result.id.value,
      resultScope: 'QUALIFICATION',
      type: 'WARNING',
      applicationPolicy: 'NONE',
      ruleReference: '6.12.6.2 a',
      publicRemark: 'Warning issued',
      officialName: 'Jury A',
    });
    const handler = new RevokeScoringDecisionHandler(decisions);

    const revocation = handler.execute({
      decisionId: original.id,
      ruleReference: '6.14.5',
      reason: 'Warning entered against the wrong athlete',
      officialName: 'Jury Chair',
    });

    expect(history).toHaveLength(2);
    expect(revocation).toMatchObject({ type: 'REVOCATION', reversesDecisionId: original.id, active: false });
    expect(() =>
      handler.execute({
        decisionId: original.id,
        ruleReference: '6.14.5',
        reason: 'Duplicate correction',
        officialName: 'Jury Chair',
      }),
    ).toThrow('already revoked');
  });
});
