import { createHash } from 'node:crypto';
import type { IResultVerificationSource } from '@/main/modules/result-verification';

/** Adds optional policy identity to list approval without changing per-result scoring/check revisions. */
export class PolicyBoundVerificationSource implements IResultVerificationSource {
  readonly resultScope;
  constructor(
    private readonly source: IResultVerificationSource,
    private readonly policyRevision: (eventId: string, scope: 'QUALIFICATION' | 'FINAL') => string | null,
  ) {
    this.resultScope = source.resultScope;
  }
  async load(eventId: string) {
    const snapshot = await this.source.load(eventId);
    const policy = this.policyRevision(eventId, this.resultScope);
    if (policy === null) return snapshot;
    return {
      ...snapshot,
      sourceRevision: createHash('sha256')
        .update(
          JSON.stringify({
            scoring: snapshot.sourceRevision,
            publicationReviewPolicy: policy,
          }),
        )
        .digest('hex'),
    };
  }
}
