import type { IScoringDecisionAdmissionPolicy } from '@/main/modules/scoring-decisions';

/** Routes all new classifications through the cross-event sanction ledger. */
export class ChampionshipSanctionScoringDecisionAdmissionPolicy implements IScoringDecisionAdmissionPolicy {
  assertAllowed(
    input: Parameters<IScoringDecisionAdmissionPolicy['assertAllowed']>[0],
    _target: Parameters<IScoringDecisionAdmissionPolicy['assertAllowed']>[1],
  ): void {
    if (input.type === 'DISQUALIFICATION') {
      throw new Error(
        'Record DSQ, DQB, and AD-DSQ in Championship athlete identity and sanctions so the required scope is applied',
      );
    }
  }
}
