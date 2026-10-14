// SPDX-License-Identifier: MIT
/** Durable crawl record contracts shared by collection, transport and scheduling. */
export const CRAWL_HOST = "crawl_host";
export const CRAWL_SOURCE = "crawl_source";
export const CRAWL_URL = "crawl_url";
export const CRAWL_RESPONSE = "crawl_response";
export const CRAWL_ROBOTS = "crawl_robots";

// Record fields keep the names already persisted in D1 by the previous runtime.
export interface HostState {
  next_request: number;
  blocked_until: number;
  failures: number;
  crawl_delay: number;
  last_finished: number;
}
export interface Requested {
  last_requested: number;
}
/**
 * `crawl_source` of a rolling source. `last_requested` alone is a settled
 * source; while an attempt holds it, `attempt` and the settled `previous` time
 * (0 without history) are kept so that an attempt that sent no request can
 * give its interval back. `retry_at` is the earliest retry after such an
 * attempt. Records without these fields are settled, current data.
 */
export interface SourceRecord extends Requested {
  attempt?: string;
  previous?: number;
  retry_at?: number;
}
export interface CachedResponse {
  blob: string;
  final_url: string;
  content_type: string;
}

export interface RobotsRecord {
  rules: string;
}
