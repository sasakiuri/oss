// SPDX-License-Identifier: MIT
import type {
  Analysis,
  Article,
  Job,
  Post,
  PostClaim,
  Publication,
  Settings,
  Source,
} from "./domain.ts";
import type { CollectedItem, SourceConfig } from "./sources/types.ts";

export interface FinishPostOptions {
  postId?: string | null;
  error?: string | null;
  timestamp?: number;
  claimToken?: string;
}
export interface RecordOptions {
  expiresAt?: number;
  leaseHost?: string;
  leaseToken?: string;
  /** Write only while this token holds the running job's unexpired lease. */
  jobToken?: string;
}
export interface PostScreening {
  evidenceHash: string;
  /** A rejected check remains binding even if another classifier edits the article. */
  permitted: boolean;
}

export interface NewsRepository {
  initialize(): Promise<void>;
  stateVersion(): Promise<number>;
  settings(): Promise<Settings>;
  updateSettings(changes: Record<string, unknown>): Promise<Settings>;
  sources(): Promise<Source[]>;
  updateSource(sourceId: string, changes: Partial<Source>): Promise<Source>;
  /**
   * Settle when an offset RSS source is next queued automatically. A stored
   * time still in the future only moves later. Only the current live job
   * owner may update it.
   */
  scheduleAutoCollection(
    sourceId: string,
    at: number,
    jobToken: string,
  ): Promise<void>;
  ingest(source: SourceConfig, items: CollectedItem[]): Promise<number>;
  articles(limit?: number, offset?: number): Promise<Article[]>;
  article(articleId: string): Promise<Article>;
  review(articleId: string, status: unknown): Promise<Article>;
  dismiss(articleIds: unknown): Promise<Article[]>;
  publicationState(): Promise<Publication>;
  postCandidates(): Promise<Article[]>;
  claimPost(timestamp: number): Promise<PostClaim | null>;
  /**
   * Whether this unsent claim may be sent now: still an automatic candidate
   * under the current settings, drafting exactly the claimed text. An own
   * live claim that is no longer eligible or fails its supplied screening is withdrawn; a lost or expired
   * claim is left unchanged.
   */
  authorizePostSend(
    articleId: string,
    claimToken: string,
    timestamp: number,
    screening?: PostScreening,
  ): Promise<boolean>;
  finishPost(
    articleId: string,
    status: "posted" | "failed" | "unknown",
    options?: FinishPostOptions,
  ): Promise<void>;
  submitPost(
    articleId: string,
    bufferId: string,
    channelId: string,
    timestamp: number,
    claimToken?: string,
  ): Promise<void>;
  claimPostCheck(timestamp: number): Promise<Post | null>;
  recoverPosts(timestamp?: number): Promise<number>;
  resolvePost(articleId: string, outcome: unknown): Promise<Publication>;
  evidenceHash(article: Article): Promise<string>;
  analyzeResult(
    articleId: string,
    evidenceHash: string,
    rubric: string,
    result: Analysis,
    relationHash?: string | null,
  ): Promise<boolean>;
  queueJob(kind: string, articleIds?: string[] | null): Promise<Job>;
  queueAutomaticJob(canAnalyze: boolean): Promise<Job | null>;
  getJob(): Promise<Job>;
  claimJob(now: number, leaseSeconds?: number): Promise<Job | null>;
  updateJob(token: string, changes: Partial<Job>): Promise<Job>;
  releaseJob(token: string, changes: Partial<Job>): Promise<Job>;
  finishJob(token: string, changes?: Partial<Job>): Promise<Job>;
  getRecord<T extends object = Record<string, unknown>>(
    namespace: string,
    key: string,
  ): Promise<T | null>;
  putRecord(
    namespace: string,
    key: string,
    value: object,
    options?: RecordOptions,
  ): Promise<void>;
  deleteRecord(namespace: string, key: string): Promise<void>;
  acquireHost(
    host: string,
    now: number,
    leaseSeconds: number,
  ): Promise<string | null>;
  releaseHost(host: string, token: string): Promise<boolean>;
  getBlob(key: string): Promise<Uint8Array | null>;
  putBlob(key: string, value: Uint8Array, expiresAt?: number): Promise<void>;
  exportSnapshot(): Promise<object>;
  importSnapshot(snapshot: unknown): Promise<object>;
}
