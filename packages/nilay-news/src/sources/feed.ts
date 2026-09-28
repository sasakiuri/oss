// SPDX-License-Identifier: MIT
/**
 * RSS 2.0, RSS 1.0 (RDF) and Atom entries with bounded, plain-text fields, or
 * the individual links listed in roundup entries when a source opts in.
 */
import { UserError } from "../errors.ts";
import { parseHtml } from "../html/tokenizer.ts";
import { canonicalUrl, hostname, urljoin } from "../net/url.ts";
import { clean, strip, truncate } from "../text.ts";
import { feedDate } from "../time.ts";
import {
  allText,
  childElements,
  leadingText,
  parseXml,
  type XmlElement,
} from "../xml.ts";

import {
  collection,
  note,
  type CollectedItem,
  type Collection,
  type Metadata,
} from "./types.ts";

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

/**
 * The entry's own publication time. Atom `updated` records a later edit, so
 * it never stands in for a missing publication date.
 */
function publication(entry: XmlElement): string | null {
  return feedDate(childText(entry, ["pubDate", "published", "date"]));
}

interface Entries {
  entries: XmlElement[];
  atom: boolean;
}

function feedEntries(data: Uint8Array): Entries {
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
  if (root.name === "rss") {
    const channel = children(root, "channel")[0];
    if (!channel) throw new UserError("RSS に channel がありません");
    return { entries: children(channel, "item"), atom: false };
  }
  if (root.name === "feed")
    return { entries: children(root, "entry"), atom: true };
  if (root.name === "RDF")
    return { entries: children(root, "item"), atom: false };
  throw new UserError("RSS/Atom の代わりに別形式のページが返されました");
}

export function parseFeed(
  data: Uint8Array,
  baseUrl: string,
  limit: number,
): CollectedItem[] {
  const { entries, atom } = feedEntries(data);
  const results: CollectedItem[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const link = entryLink(entry, atom);
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
      publishedAt: publication(entry),
    });
    if (results.length >= limit) break;
  }
  if (entries.length && !results.length)
    throw new UserError("RSS/Atom に取得可能な記事リンクがありません");
  return results;
}

/** Blocks that end a headline; a link's own title never crosses one. */
const BLOCKS = new Set([
  ...BREAK_BEFORE,
  "blockquote",
  "dd",
  "dt",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "ol",
  "td",
  "th",
  "tr",
  "ul",
]);
/** A bare URL in text; trailing ASCII punctuation belongs to the prose. */
const BARE_URL = /https?:\/\/[\x21-\x7e]+/gi;
const TRAILING = /[.,;:!?)\]}'">]+$/;

/** Canonical absolute URL, or null for anything that cannot be resolved. */
function resolve(base: string, href: string): string | null {
  if (!href) return null;
  try {
    return canonicalUrl(urljoin(base, href));
  } catch {
    return null;
  }
}

interface EntryLink {
  title: string;
  url: string;
}

/**
 * External article links listed in one roundup body, each titled by its own
 * anchor text or by the nearest headline since the previous link. Text is
 * never carried from one link to the next, and links back to the feed host
 * or the roundup itself are ignored.
 */
function roundupLinks(
  html: string,
  roundupUrl: string,
  excludedHosts: ReadonlySet<string>,
): EntryLink[] {
  const links: EntryLink[] = [];
  let hidden = 0;
  /** Text of the current block before any link in it. */
  let current = "";
  /** Last non-empty block since the previous link. */
  let pending = "";
  /** Text after a link in the same block belongs to that link, not the next. */
  let afterLink = false;
  let anchor: { url: string | null; text: string } | null = null;

  const external = (href: string): string | null => {
    const url = resolve(roundupUrl, href);
    if (!url || excludedHosts.has(hostname(url))) return null;
    return url;
  };
  const emit = (url: string, anchorText: string) => {
    const label = clean(anchorText);
    const titled = label && !/^https?:\/\//i.test(label) ? label : "";
    const title = titled || clean(current) || pending || url;
    links.push({ title: truncate(title, 500), url });
    current = "";
    pending = "";
    afterLink = true;
  };
  const boundary = () => {
    const text = clean(current);
    if (text && !afterLink) pending = text;
    current = "";
    afterLink = false;
  };
  const text = (value: string) => {
    let last = 0;
    for (const match of value.matchAll(BARE_URL)) {
      const raw = match[0].replace(TRAILING, "");
      if (!afterLink) current += value.slice(last, match.index);
      last = match.index + raw.length;
      // An ignored URL is dropped from the headline as well.
      const url = external(raw);
      if (url) emit(url, "");
    }
    if (!afterLink) current += value.slice(last);
  };

  parseHtml(html, {
    open(tag, attrs) {
      if (tag === "script" || tag === "style") {
        hidden += 1;
        return;
      }
      if (hidden) return;
      if (BLOCKS.has(tag)) boundary();
      if (tag === "a" && !anchor) {
        const href = strip(attrs.get("href") ?? "");
        anchor = {
          url: href.startsWith("#") ? null : external(href),
          text: "",
        };
      }
    },
    close(tag) {
      if (tag === "script" || tag === "style") {
        hidden = Math.max(0, hidden - 1);
        return;
      }
      if (hidden) return;
      if (tag === "a" && anchor) {
        const { url, text: label } = anchor;
        anchor = null;
        if (url) emit(url, label);
        else if (!afterLink && !/https?:\/\//i.test(label)) current += label;
      }
      if (BLOCKS.has(tag)) boundary();
    },
    text(value) {
      if (hidden) return;
      if (anchor) anchor.text += value;
      else text(value);
    },
  });
  return links;
}

/**
 * Individual external links from daily roundup posts. Each link is its own
 * item; the roundup is kept only as attribution and its date is not treated
 * as the linked article's publication date.
 */
export function parseFeedLinks(
  data: Uint8Array,
  baseUrl: string,
  limit: number,
): Collection {
  const { entries, atom } = feedEntries(data);
  const result = collection();
  const seen = new Set<string>();
  const feedHost = hostname(baseUrl);
  let total = 0;
  let empty = 0;
  for (const entry of entries) {
    const link = entryLink(entry, atom);
    const roundupUrl = resolve(baseUrl, link);
    if (!roundupUrl) {
      empty += 1;
      continue;
    }
    const roundupTitle = plain(childText(entry, ["title"]), 200);
    const roundupDate = publication(entry);
    const links = roundupLinks(
      childText(entry, ["encoded", "content", "description", "summary"]),
      roundupUrl,
      new Set([feedHost, hostname(roundupUrl)]),
    );
    if (!links.length) empty += 1;
    for (const { title, url } of links) {
      if (seen.has(url)) continue;
      seen.add(url);
      total += 1;
      if (result.items.length >= limit) continue;
      const metadata: Metadata = { roundupUrl };
      if (roundupTitle) metadata.roundupTitle = roundupTitle;
      if (roundupDate) metadata.roundupPublishedAt = roundupDate;
      result.items.push({
        title,
        url,
        excerpt: `${roundupTitle || "まとめ記事"} で紹介されたリンク（リンク先の本文・公開日は未取得）`,
        publishedAt: null,
        metadata,
      });
    }
  }
  if (entries.length && !result.items.length)
    throw new UserError("RSS の本文から記事リンクを抽出できません");
  if (empty)
    result.warnings.push(
      `${empty} 件の投稿から記事リンクを抽出できませんでした。本文の構成を確認してください`,
    );
  if (total > result.items.length)
    note(
      result,
      `記事リンク ${total} 件のうち新しい投稿から ${result.items.length} 件だけ取得しました`,
    );
  return result;
}
