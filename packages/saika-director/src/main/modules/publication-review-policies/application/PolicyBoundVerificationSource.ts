import type { ResultScope } from '@/shared/ipc/contracts';
import type { IResultVerificationSource } from '@/main/modules/result-verification';
import { sha256Json } from '@/main/domain/sha256Json';

/** Adds optional policy identity to list approval without changing per-result scoring/check revisions. */
export class PolicyBoundVerificationSource implements IResultVerificationSource {
  readonly resultScope;
  constructor(
    private readonly source: IResultVerificationSource,
    private readonly policyRevision: (eventId: string, scope: ResultScope) => string | null,
  ) {
    this.resultScope = source.resultScope;
  }
  async load(eventId: string) {
    const snapshot = await this.source.load(eventId);
    const policy = this.policyRevision(eventId, this.resultScope);
    if (policy === null) return snapshot;
    return {
      ...snapshot,
      sourceRevision: sha256Json({
        scoring: snapshot.sourceRevision,
        publicationReviewPolicy: policy,
      }),
    };
  }
}
