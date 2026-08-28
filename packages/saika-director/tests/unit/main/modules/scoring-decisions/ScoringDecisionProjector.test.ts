import { describe, expect, it } from 'vitest';

import { ScoringDecisionProjector } from '@/main/modules/scoring-decisions/domain/ScoringDecisionProjector';
import { ScoringDecision, getActiveScoringDecisions } from '@/main/modules/scoring-decisions/domain/ScoringDecision';

const target = {
  eventId: '11111111-1111-4111-8111-111111111111',
  participantId: 'participant-1',
  relayNumber: 1,
  resultScope: 'QUALIFICATION' as const,
  resultIdAtDecision: '22222222-2222-4222-8222-222222222222',
  sourceCompetitionId: null,
};

const source = {
  totalScoreX10: 605,
  seriesScoresX10: [300, 305],
  shotsX10: [90, 100, 110, 100, 100, 105],
  shotsPerSeries: 3,
};

function deduction() {
  return ScoringDecision.create({
    ...target,
    type: 'DEDUCTION',
    applicationPolicy: 'LOWEST_SHOT_IN_SERIES',
    pointsX10: 20,
    seriesIndex: 0,
    ruleReference: '6.12.6.2 b / 6.14.7',
    publicRemark: 'Two-point deduction in series 1',
    officialName: 'Jury A',
    decidedAt: new Date('2026-08-28T00:00:00.000Z'),
  });
}

describe('ScoringDecisionProjector', () => {
  it('applies a general deduction to the series total and identifies its lowest shot without rewriting it', () => {
    const decision = deduction();

    const projection = new ScoringDecisionProjector().project(source, [decision]);

    expect(projection.totalScoreX10).toBe(585);
    expect(projection.seriesScoresX10).toEqual([280, 305]);
    expect(projection.shotsX10).toEqual(source.shotsX10);
    expect(projection.deductionTotalX10).toBe(20);
    expect(projection.applications).toEqual([{ decisionId: decision.id, seriesIndex: 0, shotIndex: 0 }]);
    expect(projection.remarks).toEqual(['Two-point deduction in series 1']);
  });

  it('annuls a specific shot in the projection while preserving the source input', () => {
    const decision = ScoringDecision.create({
      ...target,
      type: 'ANNUL_SHOT',
      applicationPolicy: 'SPECIFIC_SHOT',
      seriesIndex: 1,
      shotIndex: 4,
      ruleReference: '6.11.6.7 / 6.14.6',
      publicRemark: 'Shot 5 annulled',
      officialName: 'Jury B',
    });

    const projection = new ScoringDecisionProjector().project(source, [decision]);

    expect(projection.totalScoreX10).toBe(505);
    expect(projection.seriesScoresX10).toEqual([300, 205]);
    expect(projection.shotsX10).toEqual([90, 100, 110, 100, 0, 105]);
    expect(source.shotsX10[4]).toBe(100);
  });

  it('removes a revoked decision from the active projection but retains its history', () => {
    const decision = deduction();
    const revocation = ScoringDecision.createRevocation({
      ...target,
      reversesDecisionId: decision.id,
      ruleReference: '6.14.5',
      reason: 'Decision corrected by the RTS Jury',
      officialName: 'Jury Chair',
      decidedAt: new Date('2026-08-28T00:01:00.000Z'),
    });

    expect(getActiveScoringDecisions([decision, revocation])).toEqual([]);
    const projection = new ScoringDecisionProjector().project(source, [decision, revocation]);
    expect(projection.totalScoreX10).toBe(605);
    expect(projection.remarks).toEqual([]);
  });

  it('marks a disqualified result as unranked while retaining its score before classification', () => {
    const decision = ScoringDecision.create({
      ...target,
      type: 'DISQUALIFICATION',
      applicationPolicy: 'NONE',
      classificationCode: 'DSQ',
      ruleReference: '6.12.6.2 c',
      publicRemark: 'DSQ — equipment control failure',
      officialName: 'Jury Chair',
    });

    const projection = new ScoringDecisionProjector().project(source, [decision]);
    expect(projection.classificationCode).toBe('DSQ');
    expect(projection.totalScoreX10).toBe(0);
    expect(projection.scoreBeforeClassificationX10).toBe(605);
  });

  it('uses explicit Final series sizes when locating the lowest shot', () => {
    const decision = ScoringDecision.create({
      ...target,
      resultScope: 'FINAL',
      type: 'DEDUCTION',
      applicationPolicy: 'LOWEST_SHOT_IN_SERIES',
      pointsX10: 10,
      seriesIndex: 2,
      ruleReference: '6.17',
      publicRemark: 'One-point Final deduction in series 3',
      officialName: 'Final Jury',
    });
    const finalSource = {
      totalScoreX10: 1280,
      seriesScoresX10: [510, 520, 250],
      shotsX10: [100, 101, 102, 103, 104, 105, 104, 103, 102, 106, 120, 130],
      seriesShotCounts: [5, 5, 2],
    };

    const projection = new ScoringDecisionProjector().project(finalSource, [decision]);

    expect(projection.totalScoreX10).toBe(1270);
    expect(projection.seriesScoresX10).toEqual([510, 520, 240]);
    expect(projection.applications).toEqual([{ decisionId: decision.id, seriesIndex: 2, shotIndex: 10 }]);
  });

  it('rejects a specific shot that is outside the selected variable-size series', () => {
    const decision = ScoringDecision.create({
      ...target,
      resultScope: 'FINAL',
      type: 'ANNUL_SHOT',
      applicationPolicy: 'SPECIFIC_SHOT',
      seriesIndex: 2,
      shotIndex: 9,
      ruleReference: '6.14.6',
      publicRemark: 'Invalid cross-series target',
      officialName: 'Final Jury',
    });
    const finalSource = {
      totalScoreX10: 1280,
      seriesScoresX10: [510, 520, 250],
      shotsX10: [100, 101, 102, 103, 104, 105, 104, 103, 102, 106, 120, 130],
      seriesShotCounts: [5, 5, 2],
    };

    const projection = new ScoringDecisionProjector().project(finalSource, [decision]);

    expect(projection.totalScoreX10).toBe(1280);
    expect(projection.issues).toEqual([`Decision ${decision.id} targets an unavailable shot`]);
    expect(projection.applications).toEqual([]);
  });
});
