// SPDX-License-Identifier: MIT
/**
 * Official gazette headlines from the daily full TOCs linked on the homepage.
 * Only the homepage and at most three TOCs are fetched; notice pages and PDFs
 * are linked, never downloaded. Announcements, personnel changes and
 * government procurement are out of scope.
 */
import { errorMessage, UserError } from "../errors.ts";
import {
  attr,
  descendants,
  first,
  hasClass,
  parseDocument,
  textOf,
  type Element,
} from "../html/tree.ts";
import { urljoin } from "../net/url.ts";
import { clean, sha256 } from "../text.ts";
import { japaneseDate } from "../time.ts";

import { KANPO_HOME, kanpoTocDate, MAX_ITEMS } from "./config.ts";
import {
  collection,
  note,
  type CollectedItem,
  type Collection,
  type SourceConfig,
  type SourceFetch,
} from "./types.ts";

const MAX_BYTES = 4_000_000;
const MAX_DAYS = 3;
const HIDDEN = new Set(["script", "style", "noscript"]);
/** Editions by TOC heading and URL letter; 政府調達 (c) and others are skipped. */
const EDITIONS: Record<string, string> = {
  本紙: "h",
  号外: "g",
  特別号外: "t",
};
const SKIPPED_EDITIONS = new Set(["政府調達"]);
/** Legal and administrative notice sections; 公告, 人事異動 and the like are excluded. */
const SECTIONS = new Set([
  "法律",
  "政令",
  "府令",
  "省令",
  "規則",
  "最高裁規則",
  "条約",
  "法規的告示",
  "その他告示",
  "告示",
  "官庁報告",
]);
const NOTICE =
  /^https:\/\/www\.kanpo\.go\.jp\/(\d{8})\/\1([hgt])(\d{5})\/\1\2\3(\d{4})f\.html$/;

async function readHtml(url: string, fetch: SourceFetch): Promise<Element> {
  const result = await fetch(url);
  if (result.data.length > MAX_BYTES)
    throw new UserError("官報の応答が 4 MB を超えています");
  if (result.url !== url)
    throw new UserError("官報のページが想定外の URL に転送されました");
  const type = result.contentType.toLowerCase();
  const charset = /charset\s*=\s*["']?([\w-]+)/.exec(type)?.[1];
  if (
    (type && !type.includes("html")) ||
    (charset !== undefined && charset !== "utf-8" && charset !== "utf8")
  )
    throw new UserError("官報から UTF-8 の HTML 以外の応答が返されました");
  let html: string;
  try {
    html = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
      result.data,
    );
  } catch {
    throw new UserError("官報の HTML を UTF-8 として読み取れません");
  }
  return parseDocument(html, HIDDEN);
}

/** Heading text without a trailing page number span. */
function label(node: Element): string {
  const text = first(descendants(node, "span", "text"));
  return clean((text ? textOf(text) : textOf(node)).normalize("NFKC"));
}

function isoDate(date: string): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;
}

interface Notice {
  edition: string;
  issueNumber: string;
  section: string;
  subsection: string;
  title: string;
  page: string;
  url: string;
}

interface Toc {
  notices: Notice[];
  /** Notice links that failed the URL, page or title checks. */
  rejected: number;
  /** Issue boxes whose edition, section headings or lists cannot be read. */
  unreadable: number;
}

/** Legal and administrative notices of one daily TOC, in document order. */
function parseToc(root: Element, date: string, tocUrl: string): Toc {
  const toc: Toc = { notices: [], rejected: 0, unreadable: 0 };
  const boxes = [...descendants(root, "dl", "allIndexBox")];
  if (!boxes.length) throw new UserError("全体目次の構成を読み取れません");
  for (const box of boxes) {
    const heading = first(descendants(box, "dt"));
    const match = /^(\S+)\s*第(\d+)号$/.exec(
      heading ? clean(textOf(heading).normalize("NFKC")) : "",
    );
    const letter = match ? EDITIONS[match[1] ?? ""] : undefined;
    if (!match || !letter) {
      if (!match || !SKIPPED_EDITIONS.has(match[1] ?? "")) toc.unreadable += 1;
      continue;
    }
    const edition = match[1] ?? "";
    const issueNumber = String(Number(match[2]));
    const headings = ["", "", ""];
    // A box is readable when it has a titled section and no list lacks one.
    let titled = false;
    let untitled = false;
    for (const node of descendants(box)) {
      const level = ["h2", "h3", "h4"].indexOf(node.tag);
      if (level >= 0) {
        headings.fill("", level);
        headings[level] = label(node);
        titled ||= headings[level] !== "";
        continue;
      }
      if (node.tag !== "ul" || !hasClass(node, "iconList")) continue;
      const [section = "", ...rest] = headings;
      if (!section) untitled = true;
      if (!SECTIONS.has(section)) continue;
      for (const item of node.children) {
        if (typeof item === "string" || item.tag !== "li") continue;
        const link = first(descendants(item, "a"));
        const text = link && first(descendants(link, "span", "text"));
        const page = link && first(descendants(link, "span", "date"));
        let url: string | null = null;
        try {
          url = link ? urljoin(tocUrl, attr(link, "href")) : null;
        } catch {
          // An unparsable link is rejected below.
        }
        const parts = url ? NOTICE.exec(url) : null;
        const title = text ? clean(textOf(text)) : "";
        const pageText = page ? clean(textOf(page).normalize("NFKC")) : "";
        if (
          !url ||
          !parts ||
          parts[1] !== date ||
          parts[2] !== letter ||
          Number(parts[3]) !== Number(issueNumber) ||
          !/^\d{1,4}$/.test(pageText) ||
          Number(parts[4]) !== Number(pageText) ||
          !title
        ) {
          toc.rejected += 1;
          continue;
        }
        toc.notices.push({
          edition,
          issueNumber,
          section,
          subsection: rest.filter(Boolean).join(" / "),
          title,
          page: String(Number(pageText)),
          url,
        });
      }
    }
    if (!titled || untitled) toc.unreadable += 1;
  }
  return toc;
}

async function toItem(
  notice: Notice,
  date: string,
  tocUrl: string,
  publishedAt: string | null,
): Promise<[string, CollectedItem]> {
  const issueDate = isoDate(date);
  const { edition, issueNumber, section, subsection, title, page } = notice;
  const identity = [
    issueDate,
    edition,
    issueNumber,
    section,
    subsection,
    title,
    page,
  ]
    .join("\0")
    .normalize("NFKC");
  const sourceKey = `kanpo:${(await sha256(identity)).slice(0, 32)}`;
  const heading = subsection ? `${section}・${subsection}` : section;
  const metadata: Record<string, string> = {
    issueDate,
    edition,
    issueNumber,
    section,
    page,
    tocUrl,
  };
  if (subsection) metadata.subsection = subsection;
  return [
    sourceKey,
    {
      title,
      url: notice.url,
      excerpt: `官報 ${issueDate} ${edition} 第${issueNumber}号 ${page}頁（${heading}）。公式の全体目次に掲載された見出しで、本文は取得していません。`,
      publishedAt,
      sourceKey,
      metadata,
    },
  ];
}

export async function collectKanpo(
  source: SourceConfig,
  fetch: SourceFetch,
): Promise<Collection> {
  const days = Math.min(source.issueDays ?? MAX_DAYS, MAX_DAYS);
  const limit = Math.min(source.maxItems ?? MAX_ITEMS, MAX_ITEMS);
  const home = await readHtml(KANPO_HOME, fetch);
  const tocs = new Map<string, string>();
  for (const link of descendants(home, "a")) {
    let url: string;
    try {
      url = urljoin(KANPO_HOME, attr(link, "href"));
    } catch {
      continue;
    }
    const date = kanpoTocDate(url);
    if (date && !tocs.has(date)) tocs.set(date, url);
  }
  const latest = [...tocs].sort(([a], [b]) => b.localeCompare(a));
  if (!latest.length)
    throw new UserError(
      "官報トップページから日別の全体目次を見つけられません。ページ構成の確認が必要です",
    );
  const result = collection();
  const seen = new Set<string>();
  const failures: string[] = [];
  let truncated = false;
  for (const [date, url] of latest.slice(0, days)) {
    let toc: Toc;
    try {
      toc = parseToc(await readHtml(url, fetch), date, url);
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      failures.push(date);
      result.warnings.push(
        `官報 ${date} の全体目次を取得できません：${errorMessage(error)}`,
      );
      continue;
    }
    if (toc.rejected)
      result.warnings.push(
        `官報 ${date} の目次で、掲載ページを確認できない見出し ${toc.rejected} 件を除外しました`,
      );
    if (toc.unreadable)
      result.warnings.push(
        `官報 ${date} の目次で、号または区分の見出しを読み取れない号 ${toc.unreadable} 件があります。ページ構成の確認が必要です`,
      );
    else if (!toc.rejected && !toc.notices.length)
      note(
        result,
        `官報 ${date} の全体目次には、収集対象の区分（法令・告示・官庁報告）の見出しがありませんでした`,
      );
    const [publishedAt] = japaneseDate(isoDate(date));
    for (const notice of toc.notices) {
      const [key, item] = await toItem(notice, date, url, publishedAt);
      if (seen.has(key)) continue;
      if (result.items.length >= limit) {
        truncated = true;
        break;
      }
      seen.add(key);
      result.items.push(item);
    }
    if (truncated) break;
  }
  if (failures.length === Math.min(days, latest.length))
    throw new UserError(
      `官報の全体目次をいずれも取得できません（${failures.join("、")}）`,
    );
  note(
    result,
    `官報は直近${days}発行日の全体目次から、法令・告示・官庁報告の見出しと掲載ページへのリンクだけを収集します。本文・PDFは取得せず、公告・人事異動・政府調達などは対象外です。`,
  );
  if (truncated)
    note(result, `官報の見出しが上限の ${limit} 件に達したため打ち切りました`);
  return result;
}
