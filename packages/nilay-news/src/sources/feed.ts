// SPDX-License-Identifier: MIT
/** RSS 2.0, RSS 1.0 (RDF) and Atom entries with bounded, plain-text fields. */
import { UserError } from "../errors.ts";
import { parseHtml } from "../html/tokenizer.ts";
import { canonicalUrl, urljoin } from "../net/url.ts";
import { clean, strip, truncate } from "../text.ts";
import { feedDate } from "../time.ts";
import {
  allText,
  childElements,
  leadingText,
  parseXml,
  type XmlElement,
} from "../xml.ts";

import type { CollectedItem } from "./types.ts";

const BREAK_BEFORE = new Set(["br", "p", "div", "li"]);
const BREAK_AFTER = new Set(["p", "div", "li"]);

/** Text content of an HTML fragment without scripts or styles, collapsed and limited. */
export function plain(value: string, limit: number): string {
  const parts: string[] = [];
  let hidden = 0;
  parseHtml(value, {
    open(tag) {
      if (tag === "script" || tag === "style") hidden += 1;
      else if (BREAK_BEFORE.has(tag)) parts.push(" ");
    },
    close(tag) {
      if (tag === "script" || tag === "style") hidden = Math.max(0, hidden - 1);
      else if (BREAK_AFTER.has(tag)) parts.push(" ");
    },
    text(text) {
      if (!hidden) parts.push(text);
    },
  });
  return truncate(clean(parts.join("")), limit);
}

function childText(entry: XmlElement, names: readonly string[]): string {
  for (const name of names) {
    const child = childElements(entry).find((element) => element.name === name);
    if (child) return allText(child);
  }
  return "";
}

function entryLink(entry: XmlElement, atom: boolean): string {
  if (atom) {
    for (const child of childElements(entry)) {
      if (
        child.name === "link" &&
        (child.attrs.get("rel") ?? "alternate") === "alternate"
      ) {
        const href = child.attrs.get("href") ?? "";
        if (href) return href;
      }
    }
    return "";
  }
  const link = strip(childText(entry, ["link"]));
  if (link) return link;
  const guid = childElements(entry).find(
    (child) =>
      child.name === "guid" &&
      (child.attrs.get("isPermaLink") ?? "true").toLowerCase() !== "false",
  );
  return guid ? strip(leadingText(guid)) : "";
}

export function parseFeed(
  data: Uint8Array,
  baseUrl: string,
  limit: number,
): CollectedItem[] {
  const ascii = new TextDecoder("latin1").decode(data).replaceAll("\0", "");
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(ascii))
    throw new UserError("RSS/Atom に未対応の DTD・実体宣言が含まれています");
  let root: XmlElement;
  try {
    root = parseXml(data);
  } catch {
    throw new UserError(
      "RSS/Atom を解析できません。配信元の形式を確認してください",
    );
  }
  const children = (element: XmlElement, name: string) =>
    childElements(element).filter((child) => child.name === name);
  let entries: XmlElement[];
  if (root.name === "rss") {
    const channel = children(root, "channel")[0];
    if (!channel) throw new UserError("RSS に channel がありません");
    entries = children(channel, "item");
  } else if (root.name === "feed") {
    entries = children(root, "entry");
  } else if (root.name === "RDF") {
    entries = children(root, "item");
  } else {
    throw new UserError("RSS/Atom の代わりに別形式のページが返されました");
  }
  const results: CollectedItem[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const link = entryLink(entry, root.name === "feed");
    const title = plain(childText(entry, ["title"]), 500);
    const url = link ? canonicalUrl(urljoin(baseUrl, link)) : null;
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    results.push({
      title,
      url,
      excerpt: plain(
        childText(entry, ["description", "summary", "encoded", "content"]),
        1500,
      ),
      publishedAt: feedDate(
        childText(entry, ["pubDate", "published", "date", "updated"]),
      ),
    });
    if (results.length >= limit) break;
  }
  if (entries.length && !results.length)
    throw new UserError("RSS/Atom に取得可能な記事リンクがありません");
  return results;
}
