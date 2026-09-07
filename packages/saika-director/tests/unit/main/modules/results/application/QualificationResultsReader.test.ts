import { describe, expect, it, vi } from 'vitest';

import { EventId, ParticipantId } from '@/main/modules/championship';
import type { IResultScoreCorrectionSource, ResultClassificationOverlay } from '@/main/modules/results';
import { QualificationResultsReader } from '@/main/modules/results/application/QualificationResultsReader';
import type { IResultRepository } from '@/main/modules/results/domain/IResultRepository';
import { Result } from '@/main/modules/results/domain/Result';
import { ResultId } from '@/main/modules/results/domain/ResultId';
import type { IScoringDecisionRepository } from '@/main/modules/scoring-decisions';
import { ScoringDecision } from '@/main/modules/scoring-decisions/domain/ScoringDecision';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import { CompetitionTypeRegistry } from '@/shared/competitionTypes/CompetitionTypeRegistry';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';
import { IssfStandardStrategy } from '@/shared/competitionTypes/strategies/IssfStandardStrategy';

describe('QualificationResultsReader', () => {
  it('adds evidence coverage and changes the revision when append-only decision history changes', async () => {
    const shots = Array.from({ length: 60 }, () => 10.2);
    const rankingShots = shots.map((score, index) => ({
      ringScore: 10,
      decimalScore: score,
      innerTen: index % 2 === 0,
      shotId: `shot-${index}`,
      seriesIndex: Math.floor(index / 10),
    }));
    const result = Result.create(
      ResultId.reconstruct('11111111-1111-4111-8111-111111111111'),
      EventId.reconstruct('22222222-2222-4222-8222-222222222222'),
      ParticipantId.reconstruct('33333333-3333-4333-8333-333333333333'),
      'Alex Athlete',
      'Team',
      612,
      Array.from({ length: 6 }, () => 102),
      shots,
      1,
      'confirmed',
      BR60S.resultFormat,
      '44444444-4444-4444-8444-444444444444',
      'Athlete',
      '55555555-5555-4555-8555-555555555555',
      rankingShots,
    );
    const history: ScoringDecision[] = [];
    const resultRepository = {
      findByEventId: vi.fn(() => [result]),
      findByEventIdAndRelay: vi.fn(() => [result]),
    } as unknown as IResultRepository;
    const decisionRepository: IScoringDecisionRepository = {
      append: vi.fn((decision) => history.push(decision)),
      findById: vi.fn(() => null),
      findByTarget: vi.fn(() => [...history]),
      findByEventId: vi.fn(() => [...history]),
    };
    const queryBus = {
      execute: vi.fn(async () => ({
        id: result.eventId.value,
        name: 'Qualification',
        eventType: BR60S.id,
        round: 'Qualification',
        sortOrder: 0,
      })),
    } as unknown as QueryBus;
    const registry = new CompetitionTypeRegistry();
    registry.registerStrategy(new IssfStandardStrategy());
    registry.register(BR60S);
    const overlays: ResultClassificationOverlay[] = [];
    let correction: IResultScoreCorrectionSource['project'] = (basis) => ({
      shots: basis.shots,
      revision: '',
      ids: [],
      remarks: [],
      issues: [],
    });
    const reader = new QualificationResultsReader(
      queryBus,
      resultRepository,
      decisionRepository,
      registry,
      {
        findByEventId: () => [...overlays],
      },
      undefined,
      { project: (basis) => correction(basis) },
    );

    const before = (await reader.getByEvent(result.eventId.value))[0]!;
    expect(before).toMatchObject({
      participantId: result.participantId.value,
      familyName: 'Athlete',
      evidenceSummary: {
        expectedShots: 60,
        linkedShots: 60,
        independentDecimalShots: 60,
        innerTenClassifiedShots: 60,
      },
      decisionCount: 0,
    });
    expect(before.revision).toMatch(/^[a-f0-9]{64}$/);

    history.push(
      ScoringDecision.create({
        eventId: result.eventId.value,
        participantId: result.participantId.value,
        relayNumber: 1,
        resultScope: 'QUALIFICATION',
        resultIdAtDecision: result.id.value,
        sourceCompetitionId: result.sourceCompetitionId,
        type: 'WARNING',
        applicationPolicy: 'NONE',
        ruleReference: '6.12.6.2 a',
        publicRemark: 'Warning recorded',
        officialName: 'Jury A',
      }),
    );

    const after = (await reader.getByRelay(result.eventId.value, 1))[0]!;
    expect(after.decisionCount).toBe(1);
    expect(after.revision).not.toBe(before.revision);

    overlays.push({
      participantId: result.participantId.value,
      classificationCode: 'DQB',
      decisionIds: ['championship-sanction-1'],
      publicRemarks: ['DQB — championship sanction'],
    });
    const classified = (await reader.getByEvent(result.eventId.value))[0]!;
    expect(classified).toMatchObject({ rank: 0, totalScore: 0, classificationCode: 'DQB', decisionCount: 2 });
    expect(classified.remarks).toContain('DQB — championship sanction');
    expect(classified.revision).not.toBe(after.revision);

    overlays.length = 0;
    correction = (basis) => ({
      shots: basis.shots.map((shot, index) =>
        index === 0
          ? {
              scoreX10: 109,
              ranking: { ...shot.ranking, decimalScore: 10.9 },
            }
          : shot,
      ),
      revision: 'correction-v1',
      ids: ['restoration'],
      remarks: ['Jury score correction applied'],
      issues: [],
    });
    const corrected = (await reader.getByEvent(result.eventId.value))[0]!;
    expect(corrected).toMatchObject({
      baseTotalScore: 612,
      totalScore: 612.7,
      seriesScores: [102.7, 102, 102, 102, 102, 102],
      decisionCount: 2,
    });
    expect(corrected.revision).not.toBe(after.revision);
    expect(result.shots[0]).toBe(10.2);
    expect(result.totalScore).toBe(612);
    correction = (basis) => ({
      shots: basis.shots,
      revision: 'correction-v1',
      ids: ['restoration'],
      remarks: [],
      issues: ['Jury evidence changed'],
    });
    const staleCorrection = (await reader.getByEvent(result.eventId.value))[0]!;
    expect(staleCorrection.totalScore).toBe(612);
    expect(staleCorrection.projectionIssues).toContain('Jury evidence changed');
    expect(staleCorrection.revision).not.toBe(corrected.revision);
  });
});
