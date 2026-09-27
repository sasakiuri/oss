// SPDX-License-Identifier: MIT
/** Collection entry point; network pacing, robots and caching belong to the injected fetch. */
import { UserError } from "../errors.ts";
import { canonicalUrl } from "../net/url.ts";

import { collectBills } from "./bills.ts";
import { MAX_ITEMS } from "./config.ts";
import { collectEgov } from "./egov.ts";
import { parseFeed, parseFeedLinks } from "./feed.ts";
import { parseHeadlines } from "./headlines.ts";
import {
  collection,
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

export async function collectSource(
  source: SourceConfig,
  fetch: SourceFetch,
): Promise<Collection> {
  if (source.collectionBlocked) throw new UserError(source.collectionBlocked);
  switch (source.kind) {
    case "kanpo":
      // The official gazette is blocked by robots; no PDF fallback exists here.
      throw new UserError("官報の自動収集は停止しています");
    case "bills":
      return collectBills(source, fetch);
    case "egov":
      return collectEgov(source, fetch);
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
      : collection(parseFeed(data, url, limit));
  if (contentType && !contentType.toLowerCase().includes("html"))
    throw new UserError("HTML の代わりに別形式の応答が返されました");
  const items = parseHeadlines(
    decodeHtml(data, contentType),
    source.allowedPathPattern ?? "",
    url,
    limit,
  );
  if (!items.length)
    throw new UserError(
      "見出しリンクを抽出できません。ページ構成または収集設定の確認が必要です",
    );
  return collection(items);
}
