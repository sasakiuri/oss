// SPDX-License-Identifier: MIT
// cspell:ignore batchexecute rpcids garturlreq garturlres Fbv4je XSSI wrb ceid
/** The narrowly scoped, undocumented Google News article-link protocol. */
import { UserError } from "../errors.ts";
import { parseHtml } from "../html/tokenizer.ts";

import { canonicalUrl, hostname, urlsplit } from "./url.ts";

export class GoogleNewsError extends UserError {}

export const GOOGLE_NEWS_RPC =
  "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je";
export const GOOGLE_NEWS_LOCALE = "?hl=ja&gl=JP&ceid=JP%3Aja";
const ID = /^[A-Za-z0-9_-]{1,4096}={0,2}$/;
const CONTEXT = [
  ["en-US", "US", ["FINANCE_TOP_INDICES", "WEB_TEST_1_0_0"], null, null, 1, 1,
    "US:en", null, 1, null, null, null, null, null, 0, 1],
  "en-US", "US", 1, [2, 3, 4, 8], 1, 0, null, 0, 0, null, 0,
];
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

/** Also catches malformed article paths and intermediate pages at publication time. */
export function isGoogleNewsUrl(url: string): boolean {
  return hostname(url).replace(/\.$/, "").replace(/^www\./, "") ===
    "news.google.com";
}

export function googleNewsId(url: string): string | null {
  if (!canonicalUrl(url)) return null;
  const parts = urlsplit(url);
  if (parts.scheme !== "https" || parts.netloc.toLowerCase() !== "news.google.com")
    return null;
  const id = /^\/(?:rss\/articles|articles|read)\/([^/]+)$/.exec(parts.path)?.[1];
  return id && ID.test(id) ? id : null;
}

/** Only generated metadata-page requests, never arbitrary Google paths/queries. */
export function isGoogleNewsPage(url: string): boolean {
  const id = googleNewsId(url);
  return id !== null && url === `https://news.google.com/rss/articles/${id}${GOOGLE_NEWS_LOCALE}`;
}

export function publisherUrl(value: unknown): string | null {
  const url = canonicalUrl(value);
  if (!url) return null;
  const host = hostname(url).replace(/\.$/, "").replace(/^www\./, "");
  return host === "google.com" || host.endsWith(".google.com")
    ? null : url;
}

/** Legacy protobuf field 4 contains a URL; modern IDs contain an opaque token. */
export function legacyGoogleNewsUrl(id: string): string | null {
  let bytes: Uint8Array;
  try {
    if (!ID.test(id)) return null;
    const base64 = id.replaceAll("-", "+").replaceAll("_", "/");
    bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
  if (bytes[0] !== 8 || bytes[1] !== 19 || bytes[2] !== 34) return null;
  let length = 0;
  let offset = 3;
  for (let shift = 0; shift < 35; shift += 7) {
    const byte = bytes[offset++];
    if (byte === undefined) return null;
    length += (byte & 127) * 2 ** shift;
    if (byte & 128) continue;
    if (length > bytes.length - offset) return null;
    try {
      return publisherUrl(decoder.decode(bytes.subarray(offset, offset + length)));
    } catch {
      return null;
    }
  }
  return null;
}

function decode(data: Uint8Array): string {
  try {
    return decoder.decode(data);
  } catch {
    throw new GoogleNewsError("Google News の記事URL解決応答を読み取れませんでした");
  }
}

interface Parameters {
  timestamp: number;
  signature: string;
}

function validParameters(timestamp: unknown, signature: unknown): boolean {
  return typeof timestamp === "number" && Number.isSafeInteger(timestamp) && timestamp > 0 &&
    typeof signature === "string" && /^[A-Za-z0-9_+\/-]{1,512}={0,2}$/.test(signature);
}

export function googleNewsParameters(data: Uint8Array): Parameters {
  let result: Parameters | undefined;
  parseHtml(decode(data), {
    open(_tag, attrs) {
      if (result) return;
      const raw = attrs.get("data-n-a-ts") ?? "";
      const signature = attrs.get("data-n-a-sg") ?? "";
      if (!/^\d{1,16}$/.test(raw)) return;
      const timestamp = Number(raw);
      if (validParameters(timestamp, signature)) result = { timestamp, signature };
    },
    close: () => undefined,
    text: () => undefined,
  });
  if (!result) throw new GoogleNewsError("Google News の記事URL解決情報を取得できませんでした");
  return result;
}

export function googleNewsRequest(id: string, parameters: Parameters): Uint8Array {
  if (!ID.test(id) || !validParameters(parameters.timestamp, parameters.signature))
    throw new GoogleNewsError("Google News の記事URL解決リクエストが不正です");
  const request = JSON.stringify([
    "garturlreq", CONTEXT, id, parameters.timestamp, parameters.signature,
  ]);
  return encoder.encode(new URLSearchParams({
    "f.req": JSON.stringify([[["Fbv4je", request, null, "generic"]]]),
  }).toString());
}

/** The private service accepts only the exact single-article request we build. */
export function validGoogleNewsRequest(body: Uint8Array): boolean {
  if (body.byteLength > 16_384) return false;
  try {
    const text = decoder.decode(body);
    const form = new URLSearchParams(text);
    const value: unknown = JSON.parse(form.get("f.req") ?? "");
    if (!Array.isArray(value) || !Array.isArray(value[0]) || !Array.isArray(value[0][0]))
      return false;
    const inner: unknown = JSON.parse(String(value[0][0][1]));
    if (!Array.isArray(inner) || typeof inner[2] !== "string" ||
      typeof inner[3] !== "number" || typeof inner[4] !== "string") return false;
    return text === decoder.decode(googleNewsRequest(inner[2], {
      timestamp: inner[3], signature: inner[4],
    }));
  } catch {
    return false;
  }
}

/** Parse the anti-XSSI, length-framed RPC response, not a URL-shaped substring. */
export function googleNewsResponse(data: Uint8Array): string {
  for (const line of decode(data).split("\n")) {
    if (!line.trimStart().startsWith("[")) continue;
    let rows: unknown;
    try { rows = JSON.parse(line); } catch { continue; }
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!Array.isArray(row) || row[0] !== "wrb.fr" || row[1] !== "Fbv4je" ||
        typeof row[2] !== "string") continue;
      try {
        const result: unknown = JSON.parse(row[2]);
        if (!Array.isArray(result) || result[0] !== "garturlres") continue;
        const url = publisherUrl(result[1]);
        if (url) return url;
      } catch { /* Refuse malformed embedded JSON. */ }
    }
  }
  throw new GoogleNewsError("Google News から有効な元記事URLを取得できませんでした");
}
