// SPDX-License-Identifier: MIT
/**
 * Bounded e-Gov public-comment listing/detail collector using public GET pages.
 * One source covers one list mode (recruitment or result publication).
 * Attachments are linked, not downloaded, and opinion forms are never followed.
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
import {
  canonicalUrl,
  hostname,
  hostnameOf,
  parseQs,
  urlencode,
  urljoin,
  urlsplit,
} from "../net/url.ts";
import { strip, truncate } from "../text.ts";
import { japaneseDate, withJstTime } from "../time.ts";

import {
  collection,
  note,
  type Attachment,
  type CollectedItem,
  type Collection,
  type Metadata,
  type SourceConfig,
  type SourceFetch,
} from "./types.ts";

export const ORIGIN = "https://public-comment.e-gov.go.jp";
const HOST = "public-comment.e-gov.go.jp";
const MAX_PAGES = 5;
const DETAIL_KEYWORDS = [
  "狩猟",
  "鳥獣",
  "銃",
  "射撃",
  "捕獲",
  "駆除",
  "外来",
  "野生",
  "ジビエ",
  "クマ",
  "シカ",
  "イノシシ",
  "鉛弾",
  "罠",
];
const HIDDEN = new Set(["script", "style"]);
const SCOPE = new Set([
  "keyword",
  "keywordOr",
  "Husho",
  "Bunya",
  "ids",
  "ide",
  "rds",
  "rde",
]);
const FIELDS: Record<string, string> = {
  所管省庁: "agency",
  カテゴリー: "category",
  受付締切日時: "deadline",
  受付開始日時: "opening",
  案の公示日: "announcementDate",
  結果の公示日: "resultDate",
  命令等の公布日: "enactmentDate",
  提出意見数: "opinionCount",
  根拠法令条項: "legalBasis",
};
const TIMES: Record<string, string> = {
  受付締切日時: "deadlineAt",
  受付開始日時: "openedAt",
  結果の公示日: "resultPublishedAt",
};
const EXCERPT: Record<string, string> = {
  status: "状態",
  agency: "所管省庁",
  announcementDate: "案の公示日",
  resultDate: "結果の公示日",
  deadline: "受付締切日時",
  category: "分野",
};
const DOCUMENT = /\.(?:pdf|docx?|xlsx?|zip)$/i;
/** The site's explicit zero-results message; an empty or redesigned page is an error. */
const EMPTY = /検索条件に該当する案件はありません|(?<!\p{Nd})0\s*件/u;

type EgovItem = CollectedItem & { metadata: Metadata };

/** The HTTPS form of an official e-Gov URL, or null. */
function officialUrl(url: string): string | null {
  const safe = canonicalUrl(url);
  if (!safe || hostname(safe) !== HOST) return null;
  const { path, query } = urlsplit(safe);
  return ORIGIN + path + (query ? `?${query}` : "");
}

export function detailUrl(url: string): string | null {
  const safe = officialUrl(url);
  if (!safe) return null;
  const parts = urlsplit(safe);
  if (!["/servlet/Public", "/pcm/detail", "/pcm/1040"].includes(parts.path))
    return null;
  const query = parseQs(parts.query);
  const classname = query.get("CLASSNAME")?.[0] ?? "";
  const id = query.get("id")?.[0] ?? "";
  if (
    (classname !== "PCMMSTDETAIL" && classname !== "PCM1040") ||
    !/^\p{Nd}{6,12}$/u.test(id)
  )
    return null;
  const mode = classname === "PCM1040" ? "1" : "0";
  return `${ORIGIN}/servlet/Public?${urlencode([
    ["CLASSNAME", classname],
    ["id", id],
    ["Mode", mode],
  ])}`;
}

async function readPage(url: string, fetch: SourceFetch): Promise<Element> {
  const result = await fetch(url);
  if (result.data.length > 5_000_000)
    throw new UserError("e-Gov の応答が 5 MB を超えています");
  if (!officialUrl(result.url))
    throw new UserError("e-Gov の転送先が公式ドメインではありません");
  if (result.contentType && !result.contentType.toLowerCase().includes("html"))
    throw new UserError("e-Gov から HTML 以外の応答が返されました");
  let html: string;
  try {
    html = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
      result.data,
    );
  } catch {
    throw new UserError("e-Gov の HTML を解析できません");
  }
  return parseDocument(html, HIDDEN);
}

/** A JST date with optional hours and minutes as a UTC timestamp. */
function when(input: string): string | null {
  const value = input.normalize("NFKC");
  const [stamp] = japaneseDate(value);
  const time = /(\d{1,2})時\s*(\d{1,2})分/.exec(value);
  if (stamp && time)
    return withJstTime(stamp, Number(time[1]), Number(time[2]));
  return stamp;
}

/** Label/value pairs from table rows or labelled blocks, in document order. */
function fields(nodes: Iterable<Element>): Map<string, string> {
  const values = new Map<string, string>();
  for (const node of nodes) {
    const label =
      first(descendants(node, "th")) ?? first(descendants(node, "span"));
    if (!label) continue;
    const key = textOf(label);
    const value = first(descendants(node, "td"));
    const text = textOf(node);
    values.set(
      key,
      value
        ? textOf(value)
        : strip(text.startsWith(key) ? text.slice(key.length) : text),
    );
  }
  return values;
}

function metadata(
  values: Map<string, string>,
  caseId: string,
  status: string,
  category = "",
): Metadata {
  const result: Metadata = { caseId, status };
  for (const [label, key] of Object.entries(FIELDS)) {
    const value = values.get(label);
    if (value) result[key] = truncate(value.replace(/\s*NEW$/, ""), 2000);
  }
  const contact = [...values].find(([key]) => key.startsWith("問合せ先"))?.[1];
  if (contact) result.contact = truncate(contact, 2000);
  if (category && !("category" in result))
    result.category = truncate(category, 500);
  for (const [label, key] of Object.entries(TIMES)) {
    const stamp = when(values.get(label) ?? "");
    if (stamp) result[key] = stamp;
  }
  return result;
}

function excerpt(values: Metadata): string {
  const parts = Object.entries(EXCERPT).flatMap(([key, label]) =>
    values[key] ? [`${label}：${values[key]}`] : [],
  );
  return truncate(parts.join(" / "), 1500);
}

function parseListing(
  root: Element,
  mode: string,
): { items: EgovItem[]; pages: number; rejected: number } {
  const items: EgovItem[] = [];
  let rejected = 0;
  for (const card of descendants(root, undefined, "egovui-link-area-cursor")) {
    const action = /\.action\s*=\s*(['"])(.*?)\1/.exec(attr(card, "onclick"));
    const hrefs = [
      ...(action ? [action[2] ?? ""] : []),
      ...[...descendants(card, "a")].map((anchor) => attr(anchor, "href")),
    ];
    const url = hrefs
      .map((href) => detailUrl(urljoin(ORIGIN, href)))
      .find((value) => value !== null);
    const title = first(descendants(card, "h2"));
    const values = fields(
      descendants(card, undefined, "egovui-comment-detail"),
    );
    if (!url || !title || !textOf(title)) {
      rejected += 1;
      continue;
    }
    const query = parseQs(urlsplit(url).query);
    const caseId = query.get("id")?.[0] ?? "";
    if (query.get("Mode")?.[0] !== mode || values.get("案件番号") !== caseId) {
      rejected += 1;
      continue;
    }
    const status = first(descendants(card, undefined, "egovui-comment-status"));
    const category = first(descendants(card, undefined, "egovui-list-tags"));
    const data = metadata(
      values,
      caseId,
      status ? textOf(status) : mode === "1" ? "結果公示" : "意見募集",
      category ? textOf(category) : "",
    );
    items.push({
      title: truncate(textOf(title), 500),
      url,
      excerpt: excerpt(data),
      publishedAt: when(
        values.get(mode === "1" ? "結果の公示日" : "案の公示日") ?? "",
      ),
      metadata: data,
    });
  }
  const inputs = new Map(
    [...descendants(root, "input")].map((node) => [
      attr(node, "name"),
      attr(node, "value"),
    ]),
  );
  const total = /^\s*[+-]?\d+\s*$/.test(inputs.get("totalPage") ?? "1")
    ? Number(inputs.get("totalPage") ?? "1")
    : 1;
  return { items, pages: Math.max(1, total), rejected };
}

function addDetail(item: EgovItem, root: Element): void {
  const title = first(descendants(root, "h1", "egovui-article-title"));
  const tables = first(descendants(root, undefined, "egovui-detail-lists"));
  if (!title || !tables)
    throw new UserError("案件詳細の見出し・表を抽出できません");
  const values = fields(descendants(tables, "tr"));
  const caseId = item.metadata.caseId ?? "";
  if (values.get("案件番号") !== caseId)
    throw new UserError("案件詳細の案件番号が一致しません");
  item.title = truncate(textOf(title), 500) || item.title;
  const status = first(
    descendants(root, undefined, "egovui-detail-comment-status"),
  );
  Object.assign(
    item.metadata,
    metadata(
      values,
      caseId,
      status ? textOf(status) : (item.metadata.status ?? ""),
    ),
  );
  const published = when(
    values.get(values.has("結果の公示日") ? "結果の公示日" : "案の公示日") ??
      "",
  );
  if (published) item.publishedAt = published;
  item.body = truncate(
    [...values]
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}：${value}`)
      .join("\n"),
    20_000,
  );
  item.excerpt = excerpt(item.metadata);
  const attachments: Attachment[] = [];
  const seen = new Set<string>();
  for (const anchor of descendants(tables, "a")) {
    const url = canonicalUrl(urljoin(ORIGIN, attr(anchor, "href")));
    const text = textOf(anchor);
    if (!url || seen.has(url) || !text) continue;
    const parts = urlsplit(url);
    // Files and explicitly linked reference materials only, excluding forms,
    // social sharing links and incidental page navigation.
    const document = DOCUMENT.test(parts.path);
    if (!hasClass(anchor, "file") && !document) continue;
    if (
      hostnameOf(parts) === HOST &&
      parts.path !== "/pcm/download" &&
      parts.path !== "/servlet/PcmFileDownload" &&
      !document
    )
      continue;
    attachments.push({ title: truncate(text, 500), url });
    seen.add(url);
    if (attachments.length >= 50) break;
  }
  item.attachments = attachments;
  item.metadata.contentStatus = "detail";
}

function bounded(
  value: unknown,
  fallback: number,
  low: number,
  high: number,
): number {
  const number =
    typeof value === "number" && Number.isFinite(value)
      ? Math.trunc(value)
      : fallback;
  return Math.min(high, Math.max(low, number));
}

/** Collect the latest entries, spending the bounded detail requests on subject keywords first. */
export async function collectEgov(
  source: SourceConfig,
  fetch: SourceFetch,
): Promise<Collection> {
  const configured = officialUrl(source.url);
  if (
    !configured ||
    !["/servlet/Public", "/pcm/list"].includes(urlsplit(configured).path)
  )
    throw new UserError("e-Gov の公式案件一覧 URL が必要です");
  const query = parseQs(urlsplit(configured).query);
  const mode = query.get("Mode")?.[0] ?? "0";
  if (mode !== "0" && mode !== "1")
    throw new UserError(
      "e-Gov の Mode は 0（意見募集）か 1（結果公示）にしてください",
    );
  const limit = bounded(source.maxItems, 100, 1, 100);
  const detailLimit = Math.min(
    limit,
    bounded(source.maxDetails, 20, 0, Infinity),
  );
  const pageLimit = bounded(source.maxPages, MAX_PAGES, 1, MAX_PAGES);
  const scope = [...query]
    .filter(([key]) => SCOPE.has(key))
    .map(([key, values]): [string, string] => [key, values[0] ?? ""]);
  const params = [
    ...scope,
    ["CLASSNAME", "PCMMSTLIST"],
    ["Mode", mode],
    ["dspcnt", "100"],
    ["sortItem", mode],
    ["sortButton", "1"],
  ] as const;
  const output: EgovItem[] = [];
  const result = collection(output);
  const seen = new Set<string>();
  let pages = 1;
  let page = 0;
  let clipped = false;
  for (let next = 1; next <= pageLimit; next += 1) {
    page = next;
    let listing: ReturnType<typeof parseListing>;
    try {
      const root = await readPage(
        `${ORIGIN}/servlet/Public?${urlencode([...params, ["Page", String(page)]])}`,
        fetch,
      );
      listing = parseListing(root, mode);
      pages = listing.pages;
      if (!listing.items.length) {
        if (!EMPTY.test(textOf(root)))
          throw new UserError(
            "案件一覧を抽出できません。ページ構成の確認が必要です",
          );
        break;
      }
    } catch (error) {
      if (!output.length) throw error;
      result.warnings.push(
        `e-Gov 一覧の ${page} ページ目を取得できません：${truncate(errorMessage(error), 200)}`,
      );
      break;
    }
    if (listing.rejected)
      result.warnings.push(
        `不正または未対応の案件リンクを ${listing.rejected} 件除外しました`,
      );
    // A result can appear in several cards on one page. Keep its first
    // occurrence before counting limits, so a later listing-only duplicate
    // cannot take a detail request or replace a fetched body.
    const fresh = new Map<string, EgovItem>();
    for (const item of listing.items)
      if (!seen.has(item.url) && !fresh.has(item.url))
        fresh.set(item.url, item);
    if (!fresh.size) {
      result.warnings.push(
        "一覧のページ送りが反映されなかったため取得を停止しました",
      );
      break;
    }
    clipped = fresh.size > limit - output.length;
    for (const item of fresh.values()) {
      if (output.length >= limit) break;
      output.push(item);
      seen.add(item.url);
    }
    if (output.length >= limit || page >= pages) break;
  }
  if (page < pages || clipped) {
    note(
      result,
      `最新 ${output.length} 件を収集しました（最大 ${limit} 件・${pageLimit} ページまで。全過去案件の取り込みは行いません）`,
    );
  }
  const configuredKeywords = source.detailKeywords;
  const keywords = (
    Array.isArray(configuredKeywords)
      ? configuredKeywords.slice(0, 50)
      : DETAIL_KEYWORDS
  )
    .filter(
      (keyword): keyword is string =>
        typeof keyword === "string" && strip(keyword) !== "",
    )
    .map((keyword) => keyword.normalize("NFKC").toLowerCase());
  const unrelated = (item: EgovItem) => {
    const text = `${item.title} ${item.metadata.agency ?? ""}`
      .normalize("NFKC")
      .toLowerCase();
    return !keywords.some((keyword) => text.includes(keyword));
  };
  // The listing keeps its date order; only the detail budget follows keywords.
  const selected = new Set(
    output
      .map((item, index) => ({ index, unrelated: unrelated(item) }))
      .sort(
        (a, b) =>
          Number(a.unrelated) - Number(b.unrelated) || a.index - b.index,
      )
      .slice(0, detailLimit)
      .map(({ index }) => index),
  );
  let failures = 0;
  for (const [index, item] of output.entries()) {
    item.metadata.contentStatus = "listing";
    if (!selected.has(index)) {
      item.contentError = `詳細ページ未取得：1 回 ${detailLimit} 件の上限があるため一覧の情報のみです`;
      continue;
    }
    try {
      addDetail(item, await readPage(item.url, fetch));
      item.contentError = "";
    } catch (error) {
      failures += 1;
      item.contentError = `案件詳細を取得できません：${truncate(errorMessage(error), 250)}`;
      item.metadata.contentStatus = "error";
    }
  }
  if (output.length > detailLimit) {
    note(
      result,
      `詳細ページは関連語を優先して ${detailLimit} 件まで取得し、残り ${output.length - detailLimit} 件は一覧の情報を保存しました。添付資料の本文は取得しません`,
    );
  }
  if (failures)
    result.warnings.push(
      `詳細ページ ${failures} 件の取得に失敗しました。一覧の情報を保存し、各記事に取得エラーを記録しました`,
    );
  return result;
}
