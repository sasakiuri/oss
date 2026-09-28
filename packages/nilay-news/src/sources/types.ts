// SPDX-License-Identifier: MIT
/** Source configuration and collected item contracts. */

export type SourceKind = "rss" | "html" | "kanpo" | "egov" | "bills";
export type BillAgency = "npa" | "env" | "mof" | "mof-tax";

export interface SourceConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly kind: SourceKind;
  readonly enabled: boolean;
  readonly maxItems?: number;
  /** RSS only: `links` collects each external link in an entry body instead of the entry. */
  readonly feedContent?: "links";
  readonly minCollectionMinutes?: number;
  /**
   * Collect once per JST day from this `HH:MM` time instead of a rolling
   * interval; requires `minCollectionMinutes` 1440.
   */
  readonly dailyAtJst?: string;
  /**
   * Rolling RSS only: automatic collection is phased to this many minutes
   * after JST midnight modulo `minCollectionMinutes`, so feeds of one kind are
   * spread over their period. The source minimum still counts from the end of
   * the last real request.
   */
  readonly collectionOffsetMinutes?: number;
  readonly minRequestIntervalSeconds?: number;
  readonly robotsException?: true;
  readonly robotsExceptionReason?: string;
  /**
   * Treat this HTTP status of robots.txt as "unavailable" (RFC 9309 2.3.1.3)
   * for the exact configured URL only; limited to the MAFF press index.
   */
  readonly robotsUnavailableStatus?: 403;
  readonly robotsUnavailableReason?: string;
  readonly allowedPathPattern?: string;
  /** A non-empty reason permanently disables collection of the source. */
  readonly collectionBlocked?: string;
  readonly agency?: BillAgency;
  readonly maxSessions?: number;
  readonly maxDetails?: number;
  readonly maxPages?: number;
  readonly issueDays?: number;
  readonly detailKeywords?: unknown;
}

export interface Attachment {
  title: string;
  url: string;
}

export type Metadata = Record<string, string>;

/** Metadata naming a roundup post that linked the article, not article details. */
const CITATION_KEYS: ReadonlySet<string> = new Set([
  "roundupUrl",
  "roundupTitle",
  "roundupPublishedAt",
]);

export function citationOnly(metadata: Metadata): boolean {
  const keys = Object.keys(metadata);
  return keys.length > 0 && keys.every((key) => CITATION_KEYS.has(key));
}

export interface CollectedItem {
  title: string;
  url: string;
  excerpt: string;
  publishedAt: string | null;
  sourceKey?: string;
  body?: string;
  attachments?: Attachment[];
  metadata?: Metadata;
  contentError?: string;
}

/** Items plus visible coverage warnings; `notes` are the expected, non-alerting subset. */
export interface Collection {
  items: CollectedItem[];
  warnings: string[];
  notes: string[];
}

export interface FetchResult {
  data: Uint8Array;
  url: string;
  contentType: string;
  /** The response's `RateLimit` header, present only when the server sent one. */
  rateLimit?: string;
}

/** Fetch used by collectors; pacing, robots and caching are applied by the caller. */
export type SourceFetch = (url: string) => Promise<FetchResult>;

export function collection(items: CollectedItem[] = []): Collection {
  return { items, warnings: [], notes: [] };
}

/** Record an expected coverage note shown with warnings, not an alert. */
export function note(result: Collection, message: string): void {
  result.warnings.push(message);
  result.notes.push(message);
}

/** Note items left out because their known publication is older than 24 hours. */
export function staleNote(result: Collection, count: number): void {
  if (count)
    note(
      result,
      `公開日の対象期間を過ぎた ${count} 件は収集対象外のため除外しました`,
    );
}
