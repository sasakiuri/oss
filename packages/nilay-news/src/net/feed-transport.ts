// SPDX-License-Identifier: MIT
/** The regional transport only accepts the bundled public RSS endpoints. */
import sources from "../../sources.json" with { type: "json" };

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

/** Redirects, robots, caching and all request budgets remain in CachedFetch. */
export function createFeedTransport(service?: FeedService): FetchBytes {
  return createFetchBytes(async (url, init) => {
    if (!HOSTS.has(new URL(url).hostname.replace(/^www\./, "")))
      return fetch(url, init);
    if (!isRegionalFeedUrl(url))
      throw new FetchError("地域別のRSS取得で許可していないURLです");
    if (!service) throw new FetchError("RSS取得用Workerの接続設定がありません");
    return service.fetch(new Request(url, init));
  });
}
