// SPDX-License-Identifier: MIT
/** Validation of the bundled sources.json collection configuration. */
import { UserError } from "../errors.ts";
import { canonicalUrl, hostnameOf, urlsplit } from "../net/url.ts";
import { dailyMinutes } from "../schedule.ts";
import { isInteger, isRecord, strip } from "../text.ts";

import type { SourceConfig } from "./types.ts";

export const MAX_ITEMS = 100;
const KINDS = new Set(["rss", "html", "kanpo", "egov", "bills"]);
const BILL_HOSTS: Record<string, string> = {
  npa: "www.npa.go.jp",
  env: "www.env.go.jp",
  mof: "www.mof.go.jp",
  "mof-tax": "www.mof.go.jp",
};

function inRange(value: unknown, low: number, high: number): boolean {
  return isInteger(value) && value >= low && value <= high;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && strip(value) !== "";
}

export const KANPO_HOME = "https://www.kanpo.go.jp/";
const KANPO_TOC =
  /^https:\/\/www\.kanpo\.go\.jp\/(\d{8})\/\1\.fullcontents\.html$/;

/** The `YYYYMMDD` issue date of an exact official daily gazette TOC URL, or null. */
export function kanpoTocDate(url: string): string | null {
  const date = KANPO_TOC.exec(url)?.[1];
  if (!date) return null;
  const [year, month, day] = [
    date.slice(0, 4),
    date.slice(4, 6),
    date.slice(6),
  ].map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? date
    : null;
}

function atLeast(value: unknown, low: number): boolean {
  return isInteger(value) && value >= low;
}

/**
 * Whether a robots exception is limited to the documented, low-frequency
 * Google search RSS or the daily gazette TOCs of the official gazette site.
 */
export function validRobotsException(source: Record<string, unknown>): boolean {
  if (!nonEmpty(source.robotsExceptionReason)) return false;
  if (source.kind === "kanpo")
    return (
      source.url === KANPO_HOME &&
      atLeast(source.minCollectionMinutes, 1440) &&
      atLeast(source.minRequestIntervalSeconds, 3) &&
      inRange(source.issueDays, 1, 3)
    );
  try {
    const parts = urlsplit(String(source.url));
    return (
      source.kind === "rss" &&
      parts.scheme === "https" &&
      parts.netloc === "news.google.com" &&
      parts.path === "/rss/search" &&
      atLeast(source.minCollectionMinutes, 240) &&
      atLeast(source.minRequestIntervalSeconds, 1800)
    );
  } catch {
    return false;
  }
}

export const MAFF_PRESS = "https://www.maff.go.jp/j/press/index.html";

/**
 * Whether a source may treat a robots.txt 403 as unavailable: only the
 * explained, daily MAFF press index, never a genuine robots.txt disallow.
 */
export function validRobotsUnavailable(
  source: Record<string, unknown>,
): boolean {
  return (
    source.robotsUnavailableStatus === 403 &&
    nonEmpty(source.robotsUnavailableReason) &&
    source.robotsException === undefined &&
    source.kind === "html" &&
    source.url === MAFF_PRESS &&
    source.minCollectionMinutes === 1440 &&
    dailyMinutes(source.dailyAtJst) !== null &&
    atLeast(source.minRequestIntervalSeconds, 3)
  );
}

function validate(source: Record<string, unknown>, id: string): void {
  if (!nonEmpty(source.name) || !nonEmpty(source.description))
    throw new UserError(`${id}: name と description が必要です`);
  if (canonicalUrl(source.url) === null)
    throw new UserError(`${id}: 公開 HTTP(S) URL が必要です`);
  const url = String(source.url);
  if (
    typeof source.kind !== "string" ||
    !KINDS.has(source.kind) ||
    typeof source.enabled !== "boolean"
  ) {
    throw new UserError(`${id}: kind または enabled が不正です`);
  }
  if ("maxItems" in source && !inRange(source.maxItems, 1, MAX_ITEMS))
    throw new UserError(`${id}: maxItems は 1〜100 にしてください`);
  for (const [name, low, high] of [
    ["minCollectionMinutes", 60, 10080],
    ["minRequestIntervalSeconds", 3, 86400],
  ] as const) {
    if (name in source && !inRange(source[name], low, high))
      throw new UserError(`${id}: ${name} は ${low}〜${high} にしてください`);
  }
  if (
    "dailyAtJst" in source &&
    (dailyMinutes(source.dailyAtJst) === null ||
      source.minCollectionMinutes !== 1440)
  ) {
    throw new UserError(
      `${id}: dailyAtJst は HH:MM 形式にし、minCollectionMinutes を 1440 にしてください`,
    );
  }
  if (
    "feedContent" in source &&
    (source.kind !== "rss" || source.feedContent !== "links")
  ) {
    throw new UserError(
      `${id}: feedContent は RSS の "links" だけ指定できます`,
    );
  }
  if (
    "collectionBlocked" in source &&
    typeof source.collectionBlocked !== "string"
  ) {
    throw new UserError(
      `${id}: collectionBlocked は停止理由の文字列にしてください`,
    );
  }
  if (
    "robotsException" in source &&
    (source.robotsException !== true || !validRobotsException(source))
  ) {
    throw new UserError(
      `${id}: robots 例外は理由と低頻度設定のある Google検索RSSと官報の日別目次だけに限定してください`,
    );
  }
  if (
    ("robotsUnavailableStatus" in source ||
      "robotsUnavailableReason" in source) &&
    !validRobotsUnavailable(source)
  ) {
    throw new UserError(
      `${id}: robots.txt の 403 を取得不能とみなす設定は理由と1日1回の定時設定のある農林水産省の報道発表一覧だけに限定してください`,
    );
  }
  if (
    "collectionOffsetMinutes" in source &&
    !(
      source.kind === "rss" &&
      !("dailyAtJst" in source) &&
      isInteger(source.minCollectionMinutes) &&
      1440 % source.minCollectionMinutes === 0 &&
      inRange(
        source.collectionOffsetMinutes,
        0,
        source.minCollectionMinutes - 1,
      )
    )
  ) {
    throw new UserError(
      `${id}: collectionOffsetMinutes は定時でない RSS だけに指定し、1440 を割り切る minCollectionMinutes 未満の 0 以上の整数にしてください`,
    );
  }
  if (source.kind === "html") {
    const pattern = source.allowedPathPattern;
    if (
      typeof pattern !== "string" ||
      !pattern.startsWith("^") ||
      [...pattern].length > 500
    ) {
      throw new UserError(
        `${id}: HTML 収集には ^ で始まる allowedPathPattern が必要です`,
      );
    }
    try {
      new RegExp(pattern);
    } catch {
      throw new UserError(`${id}: allowedPathPattern が不正です`);
    }
  }
  if (source.kind === "kanpo" || source.kind === "egov") {
    const expected =
      source.kind === "kanpo"
        ? "www.kanpo.go.jp"
        : "public-comment.e-gov.go.jp";
    const parts = urlsplit(url);
    if (parts.scheme !== "https" || hostnameOf(parts) !== expected)
      throw new UserError(`${id}: 専用収集には公式 HTTPS URL が必要です`);
    if (source.kind === "kanpo" && "maxPdfPages" in source)
      throw new UserError(`${id}: 官報は目次だけを収集し、PDF は取得しません`);
    const options: [string, number, number][] =
      source.kind === "kanpo"
        ? [["issueDays", 1, 3]]
        : [
            ["maxPages", 1, 5],
            ["maxDetails", 0, 100],
          ];
    for (const [name, low, high] of options) {
      if (name in source && !inRange(source[name], low, high))
        throw new UserError(`${id}: ${name} は ${low}〜${high} にしてください`);
    }
  }
  if (source.kind === "bills") {
    const agency = source.agency;
    const parts = urlsplit(url);
    if (
      typeof agency !== "string" ||
      !(agency in BILL_HOSTS) ||
      parts.scheme !== "https" ||
      hostnameOf(parts) !== BILL_HOSTS[agency]
    ) {
      throw new UserError(
        `${id}: 法案収集には対応する省庁の公式 HTTPS URL が必要です`,
      );
    }
    for (const [name, fallback, low, high] of [
      ["maxSessions", 2, 1, 3],
      ["maxDetails", 20, 0, 30],
    ] as const) {
      if (!inRange(name in source ? source[name] : fallback, low, high))
        throw new UserError(`${id}: ${name} は ${low}〜${high} にしてください`);
    }
  }
}

/** Validate the source list; ids are unique and every limit is bounded. */
export function loadSources(value: unknown): SourceConfig[] {
  if (!Array.isArray(value) || !value.length)
    throw new UserError("sources.json は収集元の配列にしてください");
  const seen = new Set<string>();
  for (const source of value) {
    if (!isRecord(source))
      throw new UserError("収集元はオブジェクトにしてください");
    const id = source.id;
    if (
      typeof id !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) ||
      seen.has(id)
    ) {
      throw new UserError(
        "収集元 id は重複のない英小文字・数字・ハイフンにしてください",
      );
    }
    seen.add(id);
    validate(source, id);
  }
  // Every field used by the application has been checked above.
  return value as SourceConfig[];
}
