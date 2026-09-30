// SPDX-License-Identifier: MIT
import type { CollectedItem, SourceConfig } from "./sources/types.ts";

export type Clock = () => number;
export const clock: Clock = () => Date.now() / 1000;
export type ReviewStatus =
  "unread" | "saved" | "approved" | "dismissed" | "posted";
export interface DecisionProvenance {
  requestedModel: string;
  /** Provider-reported model only; null means the response did not identify it. */
  resolvedModel: string | null;
  promptVersion: string;
  criteriaVersion: string;
  routingPolicyVersion: string;
  routingPolicyHash: string;
  criteriaHash: string;
  rubricHash: string;
  /** SHA-256 of the exact UTF-8 request body, including model/state/questions. */
  modelInputHash: string;
  analyzedAt: string;
  comparisonArticleId?: string;
  comparisonInputHash?: string;
}

export interface Analysis {
  analysisStatus: "pending" | "done" | "error";
  analysisError?: string | null;
  topic?: string | null;
  decision?: string | null;
  priority?: number | null;
  reason?: string | null;
  probability?: number | null;
  relatedArticleId?: string | null;
  relation?: string | null;
  provenance?: DecisionProvenance | null;
  relationProvenance?: DecisionProvenance[] | null;
}
export interface Article extends CollectedItem, Analysis {
  id: string;
  sourceName: string;
  sourceIds: string[];
  discoveredAt: string;
  reviewStatus: ReviewStatus;
  reviewedAt?: string;
  analyzedAt?: string | null;
  bodyStale?: boolean;
  bodyFetchedAt?: string;
  contentSourceId?: string;
  _identity?: string;
}
export type Source = {
  -readonly [K in keyof SourceConfig]: SourceConfig[K];
} & {
  lastFetchedAt?: string | null;
  lastError?: string | null;
  lastCount?: number | null;
  lastWarnings?: string[];
  lastDeferred?: string | null;
  nextFetchAt?: string | null;
  /**
   * Offset RSS only: when the scheduler next queues the source, and the
   * `offset/period` it was phased with. Never a crawl claim.
   */
  autoCollectAt?: string | null;
  autoCollectPhase?: string | null;
};
export interface Settings {
  rubric: string;
  autoCollect: boolean;
  pollMinutes: number;
  autoAnalyze: boolean;
  autoPost: boolean;
  postSelection: "saved" | "candidates" | "both";
}
export interface Job {
  id?: string;
  running: boolean;
  /** Queued by the scheduler rather than requested; never changes afterwards. */
  automatic: boolean;
  kind: "collect" | "analyze" | null;
  articleIds: string[] | null;
  phase: string;
  progress: number;
  total: number;
  cursor: number;
  error: string | null;
  warning: string | null;
  lastFinishedAt: string | null;
  token: string | null;
  leaseUntil: number;
  queuedAt?: string;
  workIds?: string[];
  rubric?: string;
  failed?: number;
  created?: number;
  limited?: number;
  deferred?: number;
  /** Epoch of the fixed daily JST slot an automatic daily collection serves. */
  dailyCollectionAt?: number;
}
export type PostStatus =
  "publishing" | "submitted" | "unknown" | "failed" | "posted";
export interface Post {
  article_id: string;
  status: PostStatus;
  text: string;
  attempted_at: string;
  claim_token: string;
  claim_expires_at: number;
  check_count: number;
  check_at?: number;
  confirmation_deadline?: number;
  observed_at?: number;
  remote_status?: string;
  post_id?: string | null;
  buffer_id?: string;
  channel_id?: string;
  error?: string | null;
}
export interface BufferQuota {
  observedAt: number;
  requestOrder?: number;
  api: {
    state: "known" | "missing" | "malformed" | "limited";
    windows: {
      name: string;
      remaining: number;
      resetAt: number;
      seconds?: number;
      limit?: number;
    }[];
    retryAt?: number;
  };
  channel?: {
    observedAt: number;
    requestOrder?: number;
    channelId: string;
    limit: number | null;
    scheduled: number;
    sent?: number;
    atLimit: boolean;
  };
}
export interface PostClaim {
  articleId: string;
  text: string;
  claimToken: string;
}
export interface Publication {
  nextAt: number;
  quota?: BufferQuota | null;
  posts: {
    articleId: string;
    status: PostStatus;
    text: string;
    attemptedAt: string;
    postId: string | null;
    bufferId: string | null;
    error: string | null;
    failedBeforeSend: boolean;
    nextCheckAt?: number | null;
    lastObservedAt?: number | null;
    remoteStatus?: string | null;
  }[];
}
