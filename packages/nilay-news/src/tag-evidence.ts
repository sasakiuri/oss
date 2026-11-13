// SPDX-License-Identifier: MIT
// cspell:ignore ceek livedoor smartnews infoseek nordot abema newsdig asahi jiji mainichi yomiuri sankei kahoku shinmai minamishinshu kochinews ABEMATIMES TBSNEWSDIG
/** Publisher attribution and prepared article text shared by tags and place comparisons. */
import type { Article } from "./domain.ts";
import { hostname } from "./net/url.ts";
import { isPlace, textPlaces } from "./places.ts";
import { citationOnly } from "./sources/types.ts";

/** One hashtag token: Unicode letters, marks, digits and underscores, with a letter. */
const TAG = /^[\p{L}\p{M}\p{N}_]+$/u;
const LETTER = /\p{L}/u;
const MAX_PUBLISHER = 20;

/** Collection sources that relay other publishers' articles. */
const AGGREGATORS: ReadonlySet<string> = new Set([
  "Google ニュース",
  "CEEK",
  "Yahoo!ニュース",
  "鳥獣ニュース",
  "e-Gov",
]);
/** Aggregators whose headlines end with the publisher, as `(名)` or ` - 名`. */
const ATTRIBUTED: ReadonlySet<string> = new Set([
  "Google ニュース",
  "CEEK",
  "Yahoo!ニュース",
]);
const ATTRIBUTED_HOSTS: ReadonlySet<string> = new Set([
  "news.google.com",
  "news.yahoo.co.jp",
]);
/** Portals and platforms, never an original publisher. */
const PORTAL =
  /yahoo|ヤフー|google|グーグル|ceek|livedoor|ライブドア|smartnews|スマートニュース|dメニュー|(?<![a-z])(?:goo|msn)(?![a-z])|infoseek|nordot|47news|au\s*web/i;
/** A trailing label that names a news outlet rather than a note or a place. */
const OUTLET =
  /新聞|新報|日報|タイムス|タイムズ|放送|テレビ|ニュース|通信|ラジオ|オンライン|NEWS|News|TV|ONLINE|Online|TIMES|Times|DIGITAL/;
const NOTE =
  /^(?:写真|動画|図|図解|表|詳報|続報|速報|更新|独自|解説|上|中|下|前編|中編|後編|全文|一問一答|音声|追記|訂正|修正|再掲|PR|広告|[\p{N}\s./:~-]+|\p{N}+月\p{N}+日.*)$/u;

/**
 * Sites identified by their exact host or a dot-bounded subdomain of it.
 * Portals (Yahoo, Google News) are absent; network sites keep their own brand.
 */
const HOSTS: ReadonlyMap<string, string> = new Map([
  ["times.abema.tv", "ABEMATIMES"],
  ["fnn.jp", "FNNプライムオンライン"],
  ["newsdig.tbs.co.jp", "TBSNEWSDIG"],
  ["news.ntv.co.jp", "日本テレビ"],
  ["news.tv-asahi.co.jp", "テレビ朝日"],
  ["nhk.or.jp", "NHK"],
  ["jiji.com", "時事通信"],
  ["asahi.com", "朝日新聞"],
  ["mainichi.jp", "毎日新聞"],
  ["yomiuri.co.jp", "読売新聞"],
  ["sankei.com", "産経新聞"],
  ["nikkei.com", "日本経済新聞"],
  ["tokyo-np.co.jp", "東京新聞"],
  ["hokkaido-np.co.jp", "北海道新聞"],
  ["kahoku.news", "河北新報"],
  ["shinmai.co.jp", "信濃毎日新聞"],
  ["minamishinshu.jp", "南信州新聞"],
  ["news.at-s.com", "静岡新聞"],
  ["kochinews.co.jp", "高知新聞"],
]);
/** Outlet names recognized as attribution labels, keyed by lower-cased tag. */
const KNOWN = new Map(
  [...HOSTS.values(), "ABEMA"].map((name) => [name.toLowerCase(), name]),
);

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\p{C}/gu, "");
}

/** A hashtag body of the value without spaces, or null if it is not one token. */
export function tagToken(value: string, limit = MAX_PUBLISHER): string | null {
  const tag = value.replace(/\s+/g, "").normalize("NFC");
  return TAG.test(tag) && LETTER.test(tag) && [...tag].length <= limit
    ? tag
    : null;
}

interface Attribution {
  headline: string;
  label: string | null;
}

/**
 * The headline without a trailing `(label)`, or ` - label` in an aggregator
 * feed, when the label is recognizably a news outlet.
 */
function attribution(title: string, attributed: boolean): Attribution {
  const text = title.trimEnd();
  let label: string | null = null;
  let headline = text;
  if (text.endsWith(")")) {
    let depth = 0;
    for (let index = text.length - 1; index >= 0; index -= 1) {
      if (text[index] === ")") depth += 1;
      else if (text[index] === "(" && --depth === 0) {
        label = text.slice(index + 1, -1).trim();
        headline = text.slice(0, index).trimEnd();
        break;
      }
    }
  } else if (attributed) {
    const dash = text.lastIndexOf(" - ");
    if (dash > 0) {
      label = text.slice(dash + 3).trim();
      headline = text.slice(0, dash).trimEnd();
    }
  }
  // Other parentheses, e.g. （受験者向け） or （北海道）, stay part of the headline.
  if (
    !label ||
    !headline ||
    NOTE.test(label) ||
    isPlace(label) ||
    !(OUTLET.test(label) || KNOWN.has(label.replace(/\s+/g, "").toLowerCase()))
  )
    return { headline: text, label: null };
  return { headline, label };
}

/** The outlet named by an attribution label; affiliate labels keep their network. */
function outlet(label: string): string | null {
  if (PORTAL.test(label)) return null;
  let name = label.replace(/\s+(?:powered\s+)?by\s.*$/i, "");
  const network = /^.+系\s*\(([^()]+)\)$/.exec(name);
  if (network?.[1]) name = network[1];
  const nested = /^(.+?)\s*\(([^()]+)\)$/.exec(name);
  for (const candidate of nested
    ? [nested[1] ?? "", nested[2] ?? ""]
    : [name]) {
    const tag = tagToken(candidate);
    if (tag) return KNOWN.get(tag.toLowerCase()) ?? tag;
  }
  return null;
}

function hostPublisher(url: string): string | null {
  let host = hostname(url);
  // Press releases distributed through a news site are not its reporting.
  if (
    (host === "jiji.com" || host.endsWith(".jiji.com")) &&
    /[?&]g=prt(?:&|#|$)/.test(url)
  )
    return null;
  while (host.includes(".")) {
    const name = HOSTS.get(host);
    if (name) return name;
    host = host.slice(host.indexOf(".") + 1);
  }
  return null;
}

/** The single ministry or agency in charge; several or none give nothing. */
function agency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = normalize(value).trim();
  if (!text || /[、,・]|及び|並びに/.test(text)) return null;
  const match = /^(?:内閣府|内閣官房|\S{1,10}?(?:省|庁|委員会))/.exec(text);
  return match ? tagToken(match[0]) : null;
}

/** A leading plain sentence of the excerpt; keyword snippets start mid-text. */
function lead(excerpt: string): string {
  const text = normalize(excerpt).trim();
  if (/^(?:\.{3}|…)/.test(text)) return "";
  return text.split("。")[0] ?? "";
}

function without(text: string, names: (string | null)[]): string {
  let result = text;
  for (const name of names)
    if (name && name.length >= 2) result = result.replaceAll(name, " ");
  return result;
}

/** Prepare stored fields once, in the same order for both consumers. */
export function tagEvidence(
  article: Partial<
    Pick<Article, "title" | "url" | "excerpt" | "sourceName" | "metadata">
  >,
) {
  const source = (article.sourceName ?? "").split(/[｜|]/)[0]?.trim() ?? "";
  const url = article.url ?? "";
  const aggregated = !source || AGGREGATORS.has(source);
  // Control characters stay in a label, so a disguised name is never a token.
  const attributed = attribution(
    (article.title ?? "").normalize("NFKC"),
    ATTRIBUTED.has(source) || ATTRIBUTED_HOSTS.has(hostname(url)),
  );
  const headline = normalize(attributed.headline);
  const { label } = attributed;
  const cited = !!article.metadata && citationOnly(article.metadata);
  const publisher = !aggregated
    ? tagToken(normalize(source))
    : ((source === "e-Gov" && !cited
        ? agency(article.metadata?.agency)
        : null) ??
      (label ? outlet(label) : null) ??
      hostPublisher(url));
  // Source names say who published, not where or what the article is about.
  const title = without(headline, [
    publisher,
    aggregated ? null : normalize(source),
  ]);
  // A roundup citation's excerpt describes the roundup, not the article.
  const excerpt = cited
    ? ""
    : without(lead(article.excerpt ?? ""), [publisher]);

  return { publisher, title, excerpt, places: textPlaces(title, excerpt) };
}
