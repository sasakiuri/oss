import { describe, expect, it, vi } from 'vitest';

import { EventId, ParticipantId } from '@/main/modules/championship';
import { ScoringDecisionTargetResolver } from '@/main/modules/results/application/ScoringDecisionTargetResolver';
import { FinalResult } from '@/main/modules/results/domain/FinalResult';
import { FinalResultId } from '@/main/modules/results/domain/FinalResultId';
import type { IFinalResultRepository } from '@/main/modules/results/domain/IFinalResultRepository';
import type { IResultRepository } from '@/main/modules/results/domain/IResultRepository';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import { CompetitionTypeRegistry } from '@/shared/competitionTypes/CompetitionTypeRegistry';
import { BR60S_FINAL } from '@/shared/competitionTypes/definitions/BR60S_FINAL';

describe('ScoringDecisionTargetResolver', () => {
  it('resolves a Final result into a stable target with its available variable-series layout', async () => {
    const eventId = '11111111-1111-4111-8111-111111111111';
    const participantId = '22222222-2222-4222-8222-222222222222';
    const result = FinalResult.reconstruct(
      FinalResultId.create('33333333-3333-4333-8333-333333333333'),
      EventId.reconstruct(eventId),
      ParticipantId.reconstruct(participantId),
      'Athlete',
      'Team',
      1,
      Array.from({ length: 10 }, () => 10),
      100,
      [10],
      10,
      110,
      1,
      undefined,
      undefined,
      '',
      'in_progress',
    );
    const qualificationResults = { findById: vi.fn() } as unknown as IResultRepository;
    const finalResults = { findById: vi.fn(() => result) } as unknown as IFinalResultRepository;
    const queryBus = {
      execute: vi.fn(async () => ({ eventType: BR60S_FINAL.id })),
    } as unknown as QueryBus;
    const registry = new CompetitionTypeRegistry();
    registry.register(BR60S_FINAL);

    const target = await new ScoringDecisionTargetResolver(
      queryBus,
      qualificationResults,
      finalResults,
      registry,
    ).resolve(result.id.value, 'FINAL');

    expect(target).toEqual({
      eventId,
      participantId,
      relayNumber: 1,
      resultScope: 'FINAL',
      resultIdAtDecision: result.id.value,
      sourceCompetitionId: null,
      seriesShotCounts: [5, 5, 1],
    });
    expect(qualificationResults.findById).not.toHaveBeenCalled();
  });
});
