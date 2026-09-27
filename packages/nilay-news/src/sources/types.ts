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
  readonly minCollectionMinutes?: number;
  readonly minRequestIntervalSeconds?: number;
  readonly robotsException?: true;
  readonly robotsExceptionReason?: string;
  readonly allowedPathPattern?: string;
  /** A non-empty reason permanently disables collection of the source. */
  readonly collectionBlocked?: string;
  readonly agency?: BillAgency;
  readonly maxSessions?: number;
  readonly maxDetails?: number;
  readonly maxPages?: number;
  readonly issueDays?: number;
  readonly maxPdfPages?: number;
  readonly detailKeywords?: unknown;
}

export interface Attachment {
  title: string;
  url: string;
}

export type Metadata = Record<string, string>;

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
