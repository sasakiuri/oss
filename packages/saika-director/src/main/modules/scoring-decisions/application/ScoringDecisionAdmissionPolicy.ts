import type { AddScoringDecisionPayload } from '@/shared/ipc/contracts';

import type { ScoringDecisionTargetSnapshot } from '../domain/IScoringDecisionTargetResolver';

/** Consumer-owned policy for deployment-specific decision routing. */
export interface IScoringDecisionAdmissionPolicy {
  assertAllowed(input: AddScoringDecisionPayload, target: ScoringDecisionTargetSnapshot): void;
}

export const allowAllScoringDecisions: IScoringDecisionAdmissionPolicy = Object.freeze({
  assertAllowed: () => undefined,
});
