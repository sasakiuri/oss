// SPDX-License-Identifier: MIT
/**
 * Bounded official bill indexes, related HTML summaries and material links.
 * One item represents a bill rather than each summary or outline link. The
 * latest configured Diet sessions or tax years are revisited; PDFs are never
 * downloaded.
 */
import { errorMessage, UserError } from "../errors.ts";
import { DATE_PRECISION, freshness } from "../freshness.ts";
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
  hostnameOf,
  portOf,
  urljoin,
  urlsplit,
} from "../net/url.ts";
import { clean, isInteger, length, sha256, strip, truncate } from "../text.ts";
import { japaneseDate } from "../time.ts";

import {
  collection,
  note,
  staleNote,
  type Attachment,
  type BillAgency,
  type CollectedItem,
  type Collection,
  type Metadata,
  type SourceConfig,
  type SourceFetch,
} from "./types.ts";

const AGENCIES: Record<
  BillAgency,
  { host: string; name: string; prefix: string }
> = {
  npa: { host: "www.npa.go.jp", name: "警察庁", prefix: "/laws/kokkai/" },
  env: { host: "www.env.go.jp", name: "環境省", prefix: "/info/hoan/" },
  mof: { host: "www.mof.go.jp", name: "財務省", prefix: "/about_mof/bills/" },
  "mof-tax": {
    host: "www.mof.go.jp",
    name: "財務省",
    prefix: "/tax_policy/tax_reform/outline/",
  },
};
export const PDF_NOTE =
  "資料 PDF の本文は未取得です。原文リンクで確認してください。";
const HIDDEN = new Set(["script", "style", "nav", "footer"]);
const LIMITS = [
  ["maxSessions", 2, 1, 3],
  ["maxDetails", 20, 0, 30],
  ["maxItems", 100, 1, 100],
] as const;

type BillItem = CollectedItem & {
  body: string;
  attachments: Attachment[];
  metadata: Metadata;
  contentError: string;
};
/** A session (or fiscal year), the item, and its HTML summary page if any. */
type Row = [number, BillItem, string | null];

function isAgency(value: unknown): value is BillAgency {
  return typeof value === "string" && Object.hasOwn(AGENCIES, value);
}

function official(
  base: string,
  href: string,
  agency: BillAgency,
): string | null {
  if (!href || href.startsWith("#")) return null;
  const url = canonicalUrl(urljoin(base, href));
  if (!url) return null;
  const parts = urlsplit(url);
  const port = portOf(parts);
  if (
    hostnameOf(parts) !== AGENCIES[agency].host ||
    (port !== null && port !== 443) ||
    parts.scheme !== "https"
  )
    return null;
  return url;
}

async function page(
  url: string,
  agency: BillAgency,
  fetch: SourceFetch,
): Promise<Element> {
  if (official(url, url, agency) !== url)
    throw new UserError("法案ページの取得先が公式サイトではありません");
  const result = await fetch(url);
  if (official(url, result.url, agency) !== url)
    throw new UserError("法案ページの転送先が予定した URL と異なります");
  if (
    result.data.length > 4_000_000 ||
    (result.contentType && !result.contentType.toLowerCase().includes("html"))
  ) {
    throw new UserError("法案ページの形式・サイズが想定と異なります");
  }
  let html: string;
  try {
    html = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
      result.data,
    );
  } catch {
    throw new UserError("法案ページの HTML を解析できません");
  }
  const root = parseDocument(html, HIDDEN);
  return first(descendants(root, "main")) ?? root;
}

function links(
  node: Element,
  base: string,
  agency: BillAgency,
  pdfOnly = false,
): Attachment[] {
  const result: Attachment[] = [];
  const seen = new Set<string>();
  for (const anchor of descendants(node, "a")) {
    const url = official(base, attr(anchor, "href"), agency);
    const title = textOf(anchor);
    if (!url || !title || seen.has(url)) continue;
    if (pdfOnly && !urlsplit(url).path.toLowerCase().endsWith(".pdf")) continue;
    seen.add(url);
    result.push({ title: truncate(title, 500), url });
  }
  return result.slice(0, 30);
}

function session(text: string): number | null {
  const match = /第\s*(\d+)\s*回国会/.exec(text.normalize("NFKC"));
  return match ? Number(match[1]) : null;
}

function descending(values: Iterable<number>): number[] {
  return [...new Set(values)].sort((a, b) => b - a);
}

function billItem(
  title: string,
  url: string,
  agency: BillAgency,
  number: number,
  excerpt: string,
  published: string | null = null,
  attachments: Attachment[] = [],
): BillItem {
  return {
    title: truncate(title, 500),
    url,
    publishedAt: published,
    excerpt: truncate(excerpt, 1500),
    body: "",
    attachments,
    metadata: {
      agency: AGENCIES[agency].name,
      session: `第${number}回国会`,
      contentStatus: "listing",
      // Index tables state only a calendar date.
      ...(published && { publicationPrecision: DATE_PRECISION }),
    },
    contentError: PDF_NOTE,
  };
}

async function tableRows(
  root: Element,
  base: string,
  agency: BillAgency,
  current: number | null = null,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (const node of descendants(root)) {
    if (node.tag === "h1" || node.tag === "h2")
      current = session(textOf(node)) || current;
    if (node.tag !== "tr" || !current) continue;
    const cells = node.children.filter(
      (child): child is Element =>
        typeof child !== "string" && child.tag === "td",
    );
    const [dateCell, titleCell] = cells;
    if (cells.length < 3 || !dateCell || !titleCell) continue;
    const rawTitle = textOf(titleCell);
    // Status text follows the bill name in the MOF table's same cell.
    const title = strip(
      rawTitle.split(/(?:成立日|公布日|施行日)\s*[：:]|[（(]参考[）)]/, 1)[0] ??
        "",
    );
    if (!title.includes("法律案") && !title.includes("法案")) continue;
    const unique = new Map<string, Attachment>();
    for (const cell of cells.slice(2))
      for (const link of links(cell, base, agency)) unique.set(link.url, link);
    const attachments = [...unique.values()].slice(0, 30);
    const summary =
      attachments.find(
        (link) =>
          link.title.includes("概要") &&
          /\.html?$/.test(urlsplit(link.url).path),
      )?.url ?? null;
    const submitted = textOf(dateCell);
    const item = billItem(
      title,
      summary ?? base,
      agency,
      current,
      `第${current}回国会。国会提出日：${submitted}。${rawTitle}`,
      japaneseDate(submitted)[0],
      attachments,
    );
    // PDF-only rows and rows with an HTML summary share one bill identity, so
    // adding or removing an overview link preserves human review.
    item.sourceKey = `bill:${agency}:${current}:${(await sha256(title.normalize("NFKC"))).slice(0, 20)}`;
    item.metadata.status = rawTitle.includes("成立日")
      ? "成立（公式索引掲載）"
      : "国会提出（成立状況は原文確認）";
    item.metadata.submissionDate = submitted;
    for (const [label, key] of [
      ["成立日", "enactmentDate"],
      ["公布日", "promulgatedDate"],
      ["施行日", "effectiveDate"],
    ] as const) {
      const match = new RegExp(
        `${label}\\s*[：:]\\s*((?:令和|平成|20)[^日]{1,35}日)`,
      ).exec(rawTitle);
      if (match?.[1]) item.metadata[key] = match[1];
    }
    rows.push([current, item, summary]);
  }
  return rows;
}

function environment(
  root: Element,
  base: string,
): [Row[], Map<number, string>] {
  let current: number | null = null;
  const rows: Row[] = [];
  const archives = new Map<number, string>();
  for (const node of descendants(root)) {
    if (node.tag === "h1" || node.tag === "h2") current = session(textOf(node));
    if (node.tag !== "a") continue;
    const title = textOf(node);
    const url = official(base, attr(node, "href"), "env");
    if (!url) continue;
    const path = urlsplit(url).path;
    const archive = session(title);
    if (archive && path.startsWith("/info/hoan/")) archives.set(archive, url);
    if (
      current &&
      (title.includes("法律案") || title.includes("法案")) &&
      path.startsWith("/press/") &&
      path.endsWith(".html")
    ) {
      const item = billItem(
        title,
        url,
        "env",
        current,
        `第${current}回国会の環境省提出法律案。`,
      );
      item.contentError = `詳細ページ未取得。${PDF_NOTE}`;
      rows.push([current, item, url]);
    }
  }
  return [rows, archives];
}

async function detail(
  item: BillItem,
  url: string,
  agency: BillAgency,
  fetch: SourceFetch,
): Promise<void> {
  const root = await page(url, agency, fetch);
  let chunks: string[];
  let attachments = item.attachments;
  if (agency === "env") {
    chunks = [...descendants(root, undefined, "wysiwyg")]
      .filter(
        (node) =>
          ![...descendants(node, "h2")].some(
            (heading) => textOf(heading) === "連絡先",
          ),
      )
      .map(textOf);
    const date = first(
      descendants(root, undefined, "p-press-release-material__date"),
    );
    const [published] = japaneseDate(date ? textOf(date) : "");
    if (published) {
      item.publishedAt = published;
      item.metadata.publicationPrecision = DATE_PRECISION;
    }
    attachments = links(root, url, agency, true);
  } else {
    const nodes = [...descendants(root)];
    const block =
      nodes.find((node) => attr(node, "id") === "main-base") ??
      nodes.find((node) => hasClass(node, "unique-block"));
    chunks = block ? [textOf(block)] : [];
  }
  const body = strip(chunks.filter(Boolean).join("\n\n"));
  if (!body) throw new UserError("法案詳細ページの本文領域を確認できません");
  item.body = truncate(body, 20_000);
  item.attachments = attachments;
  Object.assign(item.metadata, {
    contentStatus: "detail",
    bodyScope: "html-summary",
    bodyScopeNote: "公式 HTML の説明文。資料 PDF 本文は含みません。",
  });
  item.contentError =
    PDF_NOTE +
    (length(body) > 20_000 ? " HTML 本文は先頭 20,000 文字までです。" : "");
}

function tax(root: Element, base: string, maxYears: number): Row[] {
  let year: number | null = null;
  const rows: Row[] = [];
  const years = new Set<number>();
  for (const node of descendants(root)) {
    if (node.tag === "h3") {
      const match = /(令和|平成)(元|\d+)年度/.exec(
        textOf(node).normalize("NFKC"),
      );
      year = match
        ? (match[1] === "令和" ? 2018 : 1988) +
          (match[2] === "元" ? 1 : Number(match[2]))
        : null;
      if (year) years.add(year);
    }
    if (node.tag !== "li" || !year || first(descendants(node, "li"))) continue;
    const found = links(node, base, "mof-tax");
    const [primary] = found;
    if (!primary) continue;
    const text = textOf(node).replace(
      /(?<![\p{L}\p{N}_])(?:HTML|PDF)(?![\p{L}\p{N}_])/gu,
      "",
    );
    let title = clean(text.split("※", 1)[0] ?? "");
    if (!title) continue;
    if (!/(?:令和|平成|20\p{Nd}{2}).*年度/u.test(title))
      title = `${year}年度 ${title}`;
    const item: BillItem = {
      title: truncate(title, 500),
      url: primary.url,
      excerpt: truncate(textOf(node), 1500),
      publishedAt: null,
      body: "",
      attachments: found,
      metadata: {
        agency: "財務省",
        fiscalYear: String(year),
        contentStatus: "listing",
      },
      contentError:
        "税制改正の索引・資料リンクのみ取得。リンク先本文は未取得です。",
    };
    rows.push([year, item, null]);
  }
  const selected = new Set(descending(years).slice(0, maxYears));
  return rows.filter(([number]) => selected.has(number));
}

/** Collect bounded official HTML; partial failures are warnings, fixed coverage limits are notes. */
export async function collectBills(
  source: SourceConfig,
  fetch: SourceFetch,
  now: number,
): Promise<Collection> {
  const agency = source.agency;
  if (!isAgency(agency)) throw new UserError("法案収集の省庁設定が不正です");
  const url = canonicalUrl(source.url);
  if (
    !url ||
    official(url, url, agency) !== url ||
    !urlsplit(url).path.startsWith(AGENCIES[agency].prefix)
  ) {
    throw new UserError("法案収集の索引 URL が公式索引ではありません");
  }
  const limits = { maxSessions: 0, maxDetails: 0, maxItems: 0 };
  for (const [key, fallback, low, high] of LIMITS) {
    const value: unknown = key in source ? source[key] : fallback;
    if (!isInteger(value) || value < low || value > high)
      throw new UserError(`${key} が取得上限の範囲外です`);
    limits[key] = value;
  }
  const result = collection();
  const { warnings } = result;
  const root = await page(url, agency, fetch);
  const headingSessions = () =>
    new Set(
      [...descendants(root, "h2")]
        .map((node) => session(textOf(node)))
        .filter((value) => value !== null),
    );
  let rows: Row[] = [];
  if (agency === "npa") {
    const targets = descending(headingSessions()).slice(0, limits.maxSessions);
    rows = (await tableRows(root, url, agency)).filter(([number]) =>
      targets.includes(number),
    );
    for (const number of targets) {
      if (!rows.some(([row]) => row === number))
        warnings.push(
          `第${number}回国会の見出しに取得可能な法案行がありません。`,
        );
    }
  } else if (agency === "env") {
    const [found, archives] = environment(root, url);
    rows = found;
    const sessions = headingSessions();
    const targets = descending([...sessions, ...archives.keys()]).slice(
      0,
      limits.maxSessions,
    );
    const fetched = new Set([url]);
    for (const number of targets) {
      const archive = archives.get(number);
      if (sessions.has(number) || !archive || fetched.has(archive)) continue;
      fetched.add(archive);
      try {
        const [older] = environment(
          await page(archive, agency, fetch),
          archive,
        );
        if (!older.some(([row]) => row === number))
          throw new UserError("指定国会回次の法案を確認できません");
        rows.push(...older);
      } catch (error) {
        warnings.push(
          `第${number}回国会の過去索引を取得できませんでした：${errorMessage(error)}`,
        );
      }
    }
    // Keep the selected scope even if an archive failed; never substitute an
    // older session or declare complete coverage.
    rows = rows.filter(([number]) => targets.includes(number));
    for (const number of targets) {
      if (sessions.has(number) && !rows.some(([row]) => row === number))
        warnings.push(
          `第${number}回国会の見出しに取得可能な法案リンクがありません。`,
        );
    }
  } else if (agency === "mof") {
    const indexes = new Map<number, string>();
    for (const anchor of descendants(root, "a")) {
      const number = session(textOf(anchor));
      const link = official(url, attr(anchor, "href"), agency);
      if (
        number &&
        link &&
        /^\/about_mof\/bills\/\d+diet\/index\.html?$/.test(urlsplit(link).path)
      )
        indexes.set(number, link);
    }
    for (const number of descending(indexes.keys()).slice(
      0,
      limits.maxSessions,
    )) {
      const index = indexes.get(number) ?? "";
      try {
        const found = await tableRows(
          await page(index, agency, fetch),
          index,
          agency,
          number,
        );
        if (!found.length) throw new UserError("法律案の表を確認できません");
        rows.push(...found);
      } catch (error) {
        warnings.push(
          `第${number}回国会の法案一覧を取得できませんでした：${errorMessage(error)}`,
        );
      }
    }
  } else {
    rows = tax(root, url, limits.maxSessions);
  }
  const selected = descending(rows.map(([number]) => number)).slice(
    0,
    limits.maxSessions,
  );
  rows = rows.filter(([number]) => selected.includes(number));
  if (!rows.length) {
    const reason = warnings.join(" / ");
    throw new UserError(
      `公式索引から法案・税制資料を抽出できません${reason ? `：${reason}` : ""}`,
    );
  }
  const scope = agency === "mof-tax" ? "年度" : "国会回次";
  note(
    result,
    `直近 ${limits.maxSessions} ${scope}を対象に最大 ${limits.maxItems} 件を収集。全過去資料の収集ではありません。`,
  );
  // A bill whose listed date is before yesterday (JST) takes neither the item
  // nor the detail budget; an undated one may need its detail page for a date.
  const stale = new Set<string>();
  rows = rows.filter(([, item]) => {
    if (
      freshness(item.publishedAt, now, item.metadata.publicationPrecision) !==
      "stale"
    )
      return true;
    stale.add(item.sourceKey ?? item.url);
    return false;
  });
  staleNote(result, stale.size);
  if (rows.length > limits.maxItems)
    note(
      result,
      `対象 ${rows.length} 件のうち先頭 ${limits.maxItems} 件まで取得しました。`,
    );
  let details = 0;
  let skipped = 0;
  const seen = new Set<string>();
  for (const [, item, detailUrl] of rows.slice(0, limits.maxItems)) {
    const identity = item.sourceKey ?? item.url;
    if (seen.has(identity)) continue;
    seen.add(identity);
    if (detailUrl && details < limits.maxDetails) {
      details += 1;
      try {
        await detail(item, detailUrl, agency, fetch);
      } catch (error) {
        const message = errorMessage(error);
        item.contentError = `詳細ページを取得できませんでした：${message}。${PDF_NOTE}`;
        warnings.push(`詳細未取得：${truncate(item.title, 80)} — ${message}`);
      }
    } else if (detailUrl) {
      skipped += 1;
      item.contentError = `詳細ページ未取得（今回の取得上限）。${PDF_NOTE}`;
    }
    result.items.push(item);
  }
  if (skipped)
    note(
      result,
      `詳細は最大 ${limits.maxDetails} 件。残り ${skipped} 件は索引と資料リンクのみです。`,
    );
  note(result, PDF_NOTE);
  return result;
}
