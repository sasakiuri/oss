// SPDX-License-Identifier: MIT
import type { BufferQuota } from "../domain.ts";

import { CONFIRMATION_MAX_CHECKS } from "./policy.ts";

/**
 * API requests every rate window must still allow before a post is sent: the
 * post itself, up to six confirmations, and one spare. The verification
 * request has already consumed its quota when it returns these observations.
 */
const REQUEST_RESERVE = CONFIRMATION_MAX_CHECKS + 2;
const RATE_ITEM =
  /^(?:"[^"\\]*"|[A-Za-z*][\w\-.:%*/]*)((?:\s*;\s*[a-z*][a-z0-9_\-.*]*(?:\s*=\s*(?:"[^"\\]*"|[^\s;,"]+))?)*)$/;
const RATE_PARAM =
  /;\s*([a-z*][a-z0-9_\-.*]*)(?:\s*=\s*("[^"\\]*"|[^\s;,"]+))?/g;

interface RateWindow {
  /** Requests left in the window. */
  remaining: number;
  /** Seconds until the window resets. */
  reset: number;
}

interface RateItem {
  name: string;
  params: Map<string, string>;
}

/**
 * Parse named entries shared by RateLimit and RateLimit-Policy headers.
 * Commas inside quoted names are preserved; duplicate parameters are refused.
 */
function rateItems(header: string): RateItem[] | null {
  const items: string[] = [];
  let quoted = false;
  let start = 0;
  for (let index = 0; index < header.length; index += 1) {
    if (header[index] === '"') quoted = !quoted;
    else if (header[index] === "," && !quoted) {
      items.push(header.slice(start, index));
      start = index + 1;
    }
  }
  if (quoted) return null;
  items.push(header.slice(start));
  const parsed: RateItem[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    const match = RATE_ITEM.exec(trimmed);
    if (!match) return null;
    const params = new Map<string, string>();
    for (const [, name = "", value = ""] of (match[1] ?? "").matchAll(
      RATE_PARAM,
    )) {
      if (params.has(name)) return null;
      params.set(name, value);
    }
    parsed.push({
      name: trimmed
        .slice(0, trimmed.length - (match[1]?.length ?? 0))
        .trim()
        .replace(/^"|"$/g, ""),
      params,
    });
  }
  return parsed;
}

/** Every window must provide both an integer remaining count and reset time. */
function rateWindows(items: RateItem[] | null): RateWindow[] | null {
  if (!items) return null;
  const windows: RateWindow[] = [];
  for (const { params } of items) {
    const remaining = params.get("r") ?? "";
    const reset = params.get("t") ?? "";
    if (!/^[0-9]{1,15}$/.test(remaining) || !/^[0-9]{1,15}$/.test(reset))
      return null;
    windows.push({ remaining: Number(remaining), reset: Number(reset) });
  }
  return windows;
}

export function quotaObservation(
  header: string | undefined,
  policy: string | undefined,
  now: number,
  limited = false,
  retryAfter?: number,
): BufferQuota {
  const items = header === undefined ? null : rateItems(header);
  const windows = rateWindows(items);
  const policies = new Map(
    (policy === undefined ? [] : (rateItems(policy) ?? [])).map((item) => [
      item.name,
      item.params,
    ]),
  );
  return {
    observedAt: now,
    api: {
      state: limited
        ? "limited"
        : header === undefined
          ? "missing"
          : windows
            ? "known"
            : "malformed",
      windows: (windows ?? []).map((window, index) => {
        const fields = policies.get(items?.[index]?.name ?? "");
        const numeric = (name: string): number | undefined => {
          const value = fields?.get(name) ?? "";
          return /^[0-9]{1,15}$/.test(value) ? Number(value) : undefined;
        };
        return {
          name: `window-${index + 1}`,
          remaining: window.remaining,
          resetAt: now + window.reset,
          seconds: numeric("w"),
          limit: numeric("q"),
        };
      }),
      ...(Number.isFinite(retryAfter) && (retryAfter ?? -1) >= 0
        ? { retryAt: now + (retryAfter ?? 0) }
        : {}),
    },
  };
}

/** Only an unexpired observation blocks requests; a reset never enables posting. */
export function quotaPause(
  quota: BufferQuota | null | undefined,
  now: number,
): number | null {
  const resetTimes =
    quota?.api.windows
      .filter((window) => window.remaining < 1 && window.resetAt > now)
      .map((window) => window.resetAt) ?? [];
  if (quota?.api.retryAt !== undefined && quota.api.retryAt > now)
    resetTimes.push(quota.api.retryAt);
  return resetTimes.length ? Math.max(...resetTimes) : null;
}

/** An approximate Japanese wait such as `約15分`, `約3時間` or `約2日`. */
export function formatQuotaWait(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 120) return `約${minutes}分`;
  const hours = Math.ceil(minutes / 60);
  return hours < 48 ? `約${hours}時間` : `約${Math.ceil(hours / 24)}日`;
}

/** Leave room for the send, every confirmation, and one spare API request. */
function postingQuotaShortfall(
  quota: BufferQuota,
  now: number,
): { remaining: number; wait: number } | null {
  const low = quota.api.windows.filter(
    ({ remaining, resetAt }) => remaining < REQUEST_RESERVE && resetAt > now,
  );
  if (!low.length) return null;
  return {
    remaining: Math.min(...low.map((window) => window.remaining)),
    wait: Math.max(...low.map((window) => window.resetAt - now)),
  };
}

/** Reject new sends, without discarding a post already accepted by Buffer. */
export function postingQuotaError(
  quota: BufferQuota,
  now: number,
): string | null {
  if (quota.api.state === "malformed")
    return "Buffer API の残り利用回数を確認できません。Buffer を確認してください";
  const shortfall = postingQuotaShortfall(quota, now);
  return shortfall
    ? `Buffer API の残り利用回数が不足しています（残り ${shortfall.remaining} 回）。${formatQuotaWait(shortfall.wait)}後に再度有効にしてください`
    : null;
}
