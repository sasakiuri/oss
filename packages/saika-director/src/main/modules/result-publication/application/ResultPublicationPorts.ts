import type { ResultPublicationScope } from '../domain/ResultPublicationEntry';

export interface ResultPublicationReadiness {
  readonly supported: boolean;
  readonly resultCount: number;
  readonly snapshotRevision: string | null;
  readonly approvalId: string | null;
  readonly approvalSnapshotRevision: string | null;
  readonly verificationIssues: readonly string[];
}

export interface IResultPublicationReadiness {
  getCurrent(eventId: string, resultScope: ResultPublicationScope): Promise<ResultPublicationReadiness>;
}

export interface ResultPublicationPolicy {
  readonly scoreProtestWindowMs: number;
}

export interface IResultPublicationPolicyResolver {
  resolve(eventId: string, resultScope: ResultPublicationScope): Promise<ResultPublicationPolicy>;
}

export interface PublicationClock {
  now(): Date;
}
