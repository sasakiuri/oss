import { describe, expect, it } from 'vitest';

import { ChampionshipSanctionScoringDecisionAdmissionPolicy } from '@/main/modules/athlete-sanctions';
import type { ScoringDecisionTargetSnapshot } from '@/main/modules/scoring-decisions';
import type { AddScoringDecisionPayload } from '@/shared/ipc/contracts';

const target: ScoringDecisionTargetSnapshot = {
  eventId: '11111111-1111-4111-8111-111111111111',
  participantId: '22222222-2222-4222-8222-222222222222',
  relayNumber: 1,
  resultScope: 'QUALIFICATION',
  resultIdAtDecision: '33333333-3333-4333-8333-333333333333',
  sourceCompetitionId: '44444444-4444-4444-8444-444444444444',
  seriesShotCounts: [10, 10, 10, 10, 10, 10],
};

describe('ChampionshipSanctionScoringDecisionAdmissionPolicy', () => {
  const policy = new ChampionshipSanctionScoringDecisionAdmissionPolicy();

  it('routes new disqualifications to the championship sanction ledger', () => {
    const input: AddScoringDecisionPayload = {
      resultId: target.resultIdAtDecision,
      resultScope: target.resultScope,
      type: 'DISQUALIFICATION',
      applicationPolicy: 'NONE',
      classificationCode: 'DQB',
      ruleReference: 'ISSF 6.12.6.2',
      publicRemark: 'DQB',
      officialName: 'Jury A',
    };

    expect(() => policy.assertAllowed(input, target)).toThrow('Championship athlete identity and sanctions');
  });

  it('leaves score-local decisions independent from the sanction workflow', () => {
    const input: AddScoringDecisionPayload = {
      resultId: target.resultIdAtDecision,
      resultScope: target.resultScope,
      type: 'WARNING',
      applicationPolicy: 'NONE',
      ruleReference: 'ISSF 6.12.6.2',
      publicRemark: 'Warning',
      officialName: 'Jury A',
    };

    expect(() => policy.assertAllowed(input, target)).not.toThrow();
  });
});
