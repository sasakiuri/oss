// SPDX-License-Identifier: MIT
/** The regional transport accepts bundled feeds and narrow Google link requests. */
import sources from "../../sources.json" with { type: "json" };

import {
  GOOGLE_NEWS_RPC,
  isGoogleNewsPage,
  validGoogleNewsRequest,
} from "./google-news.ts";
import { createFetchBytes, FetchError } from "./http.ts";
import type { FetchBytes } from "./types.ts";

const HOSTS = new Set(["news.google.com", "news.yahoo.co.jp"]);
const URLS = new Set(
  sources
    .filter(
      (source) =>
        source.kind === "rss" && HOSTS.has(new URL(source.url).hostname),
    )
    .map((source) => source.url),
);
for (const host of HOSTS) URLS.add(`https://${host}/robots.txt`);

export interface FeedService {
  fetch(request: Request): Promise<Response>;
}

export function isRegionalFeedUrl(url: string): boolean {
  return URLS.has(url);
}

/** RSS policy stays in CachedFetch; Google link resolution has its own budget. */
export function createFeedTransport(service?: FeedService): FetchBytes {
  return createFetchBytes(async (url, init) => {
    if (!HOSTS.has(new URL(url).hostname.replace(/^www\./, "")))
      return fetch(url, init);
    const allowed =
      (init.method === "GET" &&
        (isRegionalFeedUrl(url) || isGoogleNewsPage(url))) ||
      (init.method === "POST" &&
        url === GOOGLE_NEWS_RPC &&
        init.body instanceof Uint8Array &&
        validGoogleNewsRequest(init.body));
    if (!allowed)
      throw new FetchError("地域別のRSS取得で許可していないURLです");
    if (!service) throw new FetchError("RSS取得用Workerの接続設定がありません");
    return service.fetch(new Request(url, init));
  });
}
