// SPDX-License-Identifier: MIT
/** Collection entry point; network pacing, robots and caching belong to the injected fetch. */
import { clock as systemClock } from "../domain.ts";
import { UserError } from "../errors.ts";
import { freshness } from "../freshness.ts";
import { canonicalUrl } from "../net/url.ts";

import { collectBills } from "./bills.ts";
import { MAX_ITEMS } from "./config.ts";
import { collectEgov } from "./egov.ts";
import { parseFeed, parseFeedLinks } from "./feed.ts";
import { parseHeadlines } from "./headlines.ts";
import { collectKanpo } from "./kanpo.ts";
import {
  collection,
  staleNote,
  type CollectedItem,
  type Collection,
  type SourceConfig,
  type SourceFetch,
} from "./types.ts";

const CHARSET = /charset\s*=\s*["']?([\w-]+)/i;
/** Additional aliases for Japanese page encodings. */
const ALIASES = new Map([["cp932", "shift_jis"]]);

function decodeHtml(data: Uint8Array, contentType: string): string {
  const declared =
    CHARSET.exec(contentType) ??
    CHARSET.exec(
      new TextDecoder("ascii")
        .decode(data.subarray(0, 4096))
        .replace(/[^\x00-\x7f]/g, ""),
    );
  const label = declared?.[1]?.toLowerCase() ?? "utf-8";
  try {
    return new TextDecoder(ALIASES.get(label) ?? label, {
      fatal: true,
      ignoreBOM: false,
    }).decode(data);
  } catch {
    throw new UserError("HTML の文字コードを解釈できません");
  }
}

/**
 * Drop items whose known publication is stale: older than 24 hours, or for a
 * date-only publication dated before yesterday (JST). Undated, invalid and
 * future dates are kept for review; discovery time is never substituted.
 */
function withoutStale(result: Collection, now: number): Collection {
  const items = result.items.filter(
    (item) =>
      freshness(item.publishedAt, now, item.metadata?.publicationPrecision) !==
      "stale",
  );
  staleNote(result, result.items.length - items.length);
  result.items = items;
  return result;
}

/** Collect one source as of `now` (epoch seconds); stale publications are never returned. */
export async function collectSource(
  source: SourceConfig,
  fetch: SourceFetch,
  now: number = systemClock(),
): Promise<Collection> {
  if (!Number.isFinite(now)) throw new RangeError("Invalid collection clock");
  if (source.collectionBlocked) throw new UserError(source.collectionBlocked);
  return withoutStale(await collect(source, fetch, now), now);
}

async function collect(
  source: SourceConfig,
  fetch: SourceFetch,
  now: number,
): Promise<Collection> {
  switch (source.kind) {
    case "kanpo":
      return collectKanpo(source, fetch, now);
    case "bills":
      return collectBills(source, fetch, now);
    case "egov":
      return collectEgov(source, fetch, now);
    case "rss":
    case "html":
      break;
    default:
      throw new UserError("未対応の収集形式です");
  }
  const { data, url, contentType } = await fetch(source.url);
  if (data.length > 5_000_000)
    throw new UserError("収集元の応答が 5 MB を超えています");
  if (!canonicalUrl(url)) throw new UserError("収集元の転送先 URL が不正です");
  const limit = source.maxItems ?? MAX_ITEMS;
  if (source.kind === "rss")
    return source.feedContent === "links"
      ? parseFeedLinks(data, url, limit)
      : recent(parseFeed(data, url, Infinity), now, limit);
  if (contentType && !contentType.toLowerCase().includes("html"))
    throw new UserError("HTML の代わりに別形式の応答が返されました");
  const items = parseHeadlines(
    decodeHtml(data, contentType),
    source.allowedPathPattern ?? "",
    url,
    Infinity,
  );
  if (!items.length)
    throw new UserError(
      "見出しリンクを抽出できません。ページ構成または収集設定の確認が必要です",
    );
  return recent(items, now, limit);
}

/**
 * The first `limit` entries in page order after stale ones are dropped, so
 * older entries listed first never take the place of recent ones.
 */
function recent(
  items: CollectedItem[],
  now: number,
  limit: number,
): Collection {
  const result = withoutStale(collection(items), now);
  result.items = result.items.slice(0, limit);
  return result;
}
