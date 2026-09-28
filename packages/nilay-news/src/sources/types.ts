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
