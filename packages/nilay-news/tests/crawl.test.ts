// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CrawlOptions } from "../src/crawl.ts";
import {
  CachedFetch,
  CrawlBackoff,
  CrawlDeferred,
  CrawlLimit,
  CrawlStopped,
  cacheTtl,
} from "../src/crawl.ts";
import { FetchError } from "../src/net/http.ts";
import type { FetchBytes, FetchOptions } from "../src/net/types.ts";
import { RobotsPolicy } from "../src/robots.ts";
import { MAFF_PRESS, loadSources } from "../src/sources/config.ts";
import type { FetchResult, SourceConfig } from "../src/sources/types.ts";
import type { SQLRepository } from "../src/storage/repository.ts";
import { utf8 } from "../src/text.ts";

import { testRepository } from "./helpers/storage.ts";

interface HostState {
  next_request: number;
  blocked_until: number;
  failures: number;
  crawl_delay: number;
  last_finished: number;
}

const ORIGIN = "https://example.org";
const START = 1_000_000;
const GOOGLE = "https://news.google.com/rss/search?q=%E7%8B%A9%E7%8C%9F";
const text = (result: FetchResult) => new TextDecoder().decode(result.data);

function source(changes: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id: "source",
    name: "テスト",
    description: "テスト",
    url: `${ORIGIN}/configured`,
    kind: "rss",
    enabled: true,
    ...changes,
  };
}

let now: number;
let repo: SQLRepository;
let close: () => void;
let calls: [string, number][];
let errors: Map<string, FetchError>;
let rules: string;
const clock = () => now;
const sleep = async (seconds: number) => {
  expect(seconds).toBeLessThan(3);
  now += seconds;
  await Promise.resolve();
};
const transport: FetchBytes = async (url) => {
  calls.push([url, now]);
  await Promise.resolve();
  const error = errors.get(url);
  if (error) throw error;
  if (url.endsWith("/robots.txt"))
    return { data: utf8(rules), url, contentType: "text/plain" };
  return { data: utf8("content"), url, contentType: "text/html" };
};

function crawler(
  sources: SourceConfig[] = [],
  options: CrawlOptions = {},
): CachedFetch {
  return new CachedFetch(repo, sources, {
    clock,
    transport,
    sleep,
    ...options,
  });
}

async function hostState(host = "example.org"): Promise<HostState | null> {
  return repo.getRecord<HostState>("crawl_host", host);
}

function spaced(): boolean {
  return calls.every(
    ([, at], index) => index === 0 || at - (calls[index - 1]?.[1] ?? 0) >= 3,
  );
}

/** A transport that follows one redirect from `/start` through the crawl guard. */
function redirecting(target: string): FetchBytes {
  return async (url, options?: FetchOptions) => {
    const result = await transport(url, options);
    if (!url.endsWith("/start")) return result;
    await options?.beforeRedirect?.(target);
    return transport(target, options);
  };
}

beforeEach(async () => {
  now = START;
  ({ repo, close } = testRepository([], clock));
  await repo.initialize();
  calls = [];
  errors = new Map();
  rules = "User-agent: *\nDisallow: /denied\n";
});

afterEach(() => {
  close();
  vi.restoreAllMocks();
});

describe("CachedFetch", () => {
  it("stops at a robots denial without requesting the source", async () => {
    await expect(crawler().fetch(`${ORIGIN}/denied`)).rejects.toThrow("禁止");
    expect(calls.map(([url]) => url)).toEqual([`${ORIGIN}/robots.txt`]);
  });

  it("shares host spacing and cached responses across Worker instances", async () => {
    await crawler().fetch(`${ORIGIN}/one`);
    const other = crawler();
    await other.fetch(`${ORIGIN}/two`);
    const before = calls.length;
    expect(text(await other.fetch(`${ORIGIN}/one`))).toBe("content");
    expect(calls).toHaveLength(before);
    expect(other.requests).toBe(1);
    expect(spaced()).toBe(true);
  });

  it("serializes concurrent Workers with the durable host lease", async () => {
    const results = await Promise.allSettled([
      crawler().fetch(`${ORIGIN}/one`),
      crawler().fetch(`${ORIGIN}/two`),
    ]);
    const deferred = results.filter(
      (result) =>
        result.status === "rejected" && result.reason instanceof CrawlDeferred,
    );
    expect(deferred).toHaveLength(1);
    expect(calls).toHaveLength(2);
    const token = await repo.acquireHost("example.org", now, 1);
    expect(token).not.toBeNull();
  });

  it("keeps Retry-After backoff durable and never retries automatically", async () => {
    const url = `${ORIGIN}/one`;
    errors.set(url, new FetchError("limited", 429, 7200));
    await expect(crawler().fetch(url)).rejects.toThrow("limited");
    let state = await hostState();
    expect([state?.blocked_until, state?.failures]).toEqual([now + 7200, 1]);
    await expect(crawler().fetch(`${ORIGIN}/two`)).rejects.toBeInstanceOf(
      CrawlStopped,
    );
    expect(calls).toHaveLength(2);
    now = (state?.blocked_until ?? 0) + 1;
    errors.set(url, new FetchError("limited", 429));
    await expect(crawler().fetch(url)).rejects.toThrow("limited");
    state = await hostState();
    expect([state?.blocked_until, state?.failures]).toEqual([now + 7200, 2]);
  });

  it.each([
    ["a 503 and the longer host interval", undefined, 1800],
    ["a longer Retry-After", 7200, 7200],
  ])(
    "defers other URLs of a cooling host until %s without a request",
    async (_, retryAfter, wait) => {
      const sources = [
        source({ id: "one", url: `${ORIGIN}/one` }),
        source({
          id: "two",
          url: `${ORIGIN}/two`,
          minRequestIntervalSeconds: 1800,
        }),
      ];
      errors.set(
        `${ORIGIN}/one`,
        new FetchError("unavailable", 503, retryAfter),
      );
      // The first run only caches robots.txt, as in production.
      await expect(crawler(sources).fetch(`${ORIGIN}/one`)).rejects.toThrow(
        CrawlDeferred,
      );
      now += 1800;
      await expect(crawler(sources).fetch(`${ORIGIN}/one`)).rejects.toThrow(
        "unavailable",
      );
      const failed = now;
      const before = await hostState();
      expect(before?.failures).toBe(1);
      expect(before?.blocked_until).toBe(failed + (retryAfter ?? 900));
      expect(calls).toHaveLength(2);

      now += 60;
      const deferral = await crawler(sources)
        .fetch(`${ORIGIN}/two`)
        .catch((caught: unknown) => caught);
      expect(deferral).toBeInstanceOf(CrawlBackoff);
      expect(deferral).toBeInstanceOf(CrawlDeferred);
      expect((deferral as CrawlBackoff).until).toBe(failed + wait);
      expect(String(deferral)).toContain("最も早い時刻");
      expect(calls).toHaveLength(2);
      expect(await hostState()).toEqual(before);

      now = failed + wait;
      expect(text(await crawler(sources).fetch(`${ORIGIN}/two`))).toBe(
        "content",
      );
      expect(calls.map(([url]) => url).at(-1)).toBe(`${ORIGIN}/two`);
      expect((await hostState())?.failures).toBe(0);
    },
  );

  it.each([
    [403, 86400],
    [503, 900],
    [undefined, 900],
  ])("cools the host down after HTTP %s", async (status, seconds) => {
    const origin = `https://host-${status}.example.org`;
    errors.set(`${origin}/one`, new FetchError("failed", status));
    await expect(crawler().fetch(`${origin}/one`)).rejects.toThrow("failed");
    expect((await hostState(`host-${status}.example.org`))?.blocked_until).toBe(
      now + seconds,
    );
  });

  it("does not back off for an ordinary client error", async () => {
    errors.set(`${ORIGIN}/gone`, new FetchError("gone", 404));
    await expect(crawler().fetch(`${ORIGIN}/gone`)).rejects.toThrow("gone");
    expect((await hostState())?.blocked_until).toBe(0);
  });

  it.each([
    new FetchError("unavailable", 503),
    new FetchError("forbidden", 403, 172800),
  ])("fails closed when robots.txt is unavailable", async (error) => {
    errors.set(`${ORIGIN}/robots.txt`, error);
    const failure = await crawler()
      .fetch(`${ORIGIN}/news`)
      .catch((caught: unknown) => caught);
    expect(failure).toBeInstanceOf(CrawlStopped);
    expect(String(failure)).toContain("robots.txt");
    expect((failure as CrawlStopped).status).toBe(error.status);
    expect(calls.some(([url]) => url.endsWith("/news"))).toBe(false);
    expect((await hostState())?.failures).toBe(1);
  });

  it.each([404, 410])(
    "treats a missing robots.txt (%s) as allow-all",
    async (status) => {
      errors.set(`${ORIGIN}/robots.txt`, new FetchError("missing", status));
      expect(text(await crawler().fetch(`${ORIGIN}/news`))).toBe("content");
      expect(await repo.getRecord("crawl_robots", ORIGIN)).toEqual({
        rules: "",
      });
    },
  );

  it.each([
    ["an HTML challenge", "<html>challenge</html>", "text/plain"],
    ["an HTML content type", "User-agent: *\n", "text/html"],
    ["an invalid delay", "User-agent: *\nCrawl-delay: soon\n", "text/plain"],
  ])("fails closed and backs off on %s", async (_, body, contentType) => {
    const robots: FetchBytes = async (url, options) =>
      url.endsWith("/robots.txt")
        ? (calls.push([url, now]), { data: utf8(body), url, contentType })
        : transport(url, options);
    await expect(
      crawler([], { transport: robots }).fetch(`${ORIGIN}/new`),
    ).rejects.toBeInstanceOf(CrawlStopped);
    expect((await hostState())?.blocked_until).toBeGreaterThan(now);
    expect(calls).toHaveLength(1);
  });

  it("refuses robots.txt that is not UTF-8", async () => {
    const robots: FetchBytes = async (url) => ({
      data: new Uint8Array([0xff, 0xfe, 0x00]),
      url,
      contentType: "text/plain",
    });
    await expect(
      crawler([], { transport: robots }).fetch(`${ORIGIN}/new`),
    ).rejects.toThrow("読み取れない");
  });

  it("defers a long robots delay without recording a failure", async () => {
    rules += "Crawl-delay: 600\n";
    const error = await crawler()
      .fetch(`${ORIGIN}/one`)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CrawlDeferred);
    expect((error as CrawlDeferred).until).toBe(now + 600);
    expect(calls).toHaveLength(1);
    const state = await hostState();
    expect([state?.blocked_until, state?.failures]).toEqual([0, 0]);
    now += 600;
    await crawler().fetch(`${ORIGIN}/one`);
    expect(calls).toHaveLength(2);
  });

  it("checks the redirect target robots.txt and www origin under shared pacing", async () => {
    await crawler([], {
      transport: redirecting("https://www.example.org/final"),
    }).fetch(`${ORIGIN}/start`);
    expect(calls.map(([url]) => url)).toEqual([
      `${ORIGIN}/robots.txt`,
      `${ORIGIN}/start`,
      "https://www.example.org/robots.txt",
      "https://www.example.org/final",
    ]);
    expect(spaced()).toBe(true);
  });

  it("refuses a redirect to another host from the guard", async () => {
    await expect(
      crawler([], {
        transport: redirecting("https://other.example/final"),
      }).fetch(`${ORIGIN}/start`),
    ).rejects.toThrow("許可していない転送先");
    expect((await hostState())?.failures).toBe(0);
  });

  it("turns a long delay on a redirect into a stop", async () => {
    rules = "User-agent: *\nCrawl-delay: 10\n";
    await expect(crawler().fetch(`${ORIGIN}/start`)).rejects.toBeInstanceOf(
      CrawlDeferred,
    );
    now += 10;
    const error = await crawler([], {
      transport: redirecting(`${ORIGIN}/final`),
    })
      .fetch(`${ORIGIN}/start`)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CrawlStopped);
    expect(error).not.toBeInstanceOf(CrawlDeferred);
    expect(String(error)).toContain("転送先の正式 URL");
  });

  it("counts a redirect robots.txt failure once", async () => {
    errors.set(
      "https://www.example.org/robots.txt",
      new FetchError("restricted", 403, 172800),
    );
    await expect(
      crawler([], {
        transport: redirecting("https://www.example.org/final"),
      }).fetch(`${ORIGIN}/start`),
    ).rejects.toBeInstanceOf(CrawlStopped);
    const state = await hostState();
    expect([state?.failures, state?.blocked_until]).toEqual([1, now + 172800]);
  });

  it("keeps the source interval across errors and expanded request URLs", async () => {
    const configured = source({ minCollectionMinutes: 360 });
    const cache = crawler([configured]);
    expect(await cache.nextDue(configured)).toBe(0);
    await cache.beginSource(configured);
    await cache.fetch(`${ORIGIN}/expanded?Page=1`);
    const error = await crawler([configured])
      .beginSource(configured)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CrawlDeferred);
    expect((error as CrawlDeferred).until).toBe(START + 21600);
    expect(await cache.nextDue(configured)).toBe(START + 21600);
    now = START + 21600;
    const attempt = await cache.beginSource(configured);
    now += 10;
    await cache.endSource(configured, attempt, null);
    expect(await cache.nextDue(configured)).toBe(now + 21600);
  });

  it("gates Yahoo at one hour and Google and CEEK at four hours", async () => {
    const bundled = loadSources(
      JSON.parse(
        readFileSync(new URL("../sources.json", import.meta.url), "utf8"),
      ),
    );
    const ordinary = bundled.filter(
      (item) => !item.dailyAtJst && item.id !== "tyoujuu-blog",
    );
    expect(ordinary.map((item) => item.id)).toEqual([
      "google-1",
      "google-2",
      "ceek-1",
      "ceek-2",
      "ceek-3",
      "yahoo-domestic",
      "yahoo-local",
      "yahoo-science",
    ]);
    const cache = crawler(bundled);
    for (const item of ordinary) {
      const yahoo = item.id.startsWith("yahoo-");
      expect(item.minCollectionMinutes).toBe(yahoo ? 60 : 240);
      // Search feeds keep their 30-minute host spacing; Yahoo adds none.
      expect(item.minRequestIntervalSeconds).toBe(yahoo ? undefined : 1800);
      await cache.beginSource(item);
    }
    expect(
      ordinary.filter((item) => item.robotsException).map((item) => item.id),
    ).toEqual(["google-1", "google-2"]);
    now = START + 3600 - 1;
    for (const item of ordinary) {
      await expect(cache.beginSource(item)).rejects.toBeInstanceOf(
        CrawlDeferred,
      );
      expect(await cache.nextDue(item)).toBe(
        START + (item.id.startsWith("yahoo-") ? 3600 : 4 * 3600),
      );
    }
    now += 1;
    for (const item of ordinary.filter((feed) => feed.id.startsWith("yahoo-")))
      await cache.beginSource(item);
    for (const item of ordinary.filter(
      (feed) => !feed.id.startsWith("yahoo-"),
    )) {
      await expect(cache.beginSource(item)).rejects.toBeInstanceOf(
        CrawlDeferred,
      );
    }
    now = START + 4 * 3600;
    for (const item of ordinary) await cache.beginSource(item);
    const google = ordinary[0]!;
    expect(() =>
      loadSources([{ ...google, minCollectionMinutes: 239 }]),
    ).toThrow("robots");
    // Feeds share the hourly minimum with every other source.
    const yahoo = ordinary.at(-1)!;
    expect(() => loadSources([{ ...yahoo, minCollectionMinutes: 59 }])).toThrow(
      "minCollectionMinutes",
    );
  });

  it("collects the bundled daily sources at most once a day", async () => {
    const bundled = loadSources(
      JSON.parse(
        readFileSync(new URL("../sources.json", import.meta.url), "utf8"),
      ),
    );
    const byId = new Map(bundled.map((item) => [item.id, item]));
    const daily = byId.get("tyoujuu-blog")!;
    await crawler(bundled).beginSource(daily);
    now = START + 86399;
    const error = await crawler(bundled)
      .beginSource(daily)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CrawlDeferred);
    expect((error as CrawlDeferred).until).toBe(START + 86400);
    now = START + 86400;
    await crawler(bundled).beginSource(daily);
    // Fixed daily sources wait for the next 11:00 JST, not 24 hours.
    const gazette = byId.get("kanpo")!;
    expect(gazette.dailyAtJst).toBe("11:00");
    await crawler(bundled).beginSource(gazette);
    const later = await crawler(bundled)
      .beginSource(gazette)
      .catch((caught: unknown) => caught);
    expect(later).toBeInstanceOf(CrawlDeferred);
    const until = (later as CrawlDeferred).until;
    expect(new Date(until * 1000).toISOString()).toMatch(/T02:00:00\.000Z$/);
    expect(until - now).toBeLessThan(86400);
  });

  describe("fixed daily JST sources", () => {
    // 2026-09-28 11:00 JST is 02:00 UTC.
    const ELEVEN = Date.UTC(2026, 8, 28, 2) / 1000;
    const DAY = 86400;
    const daily = source({
      url: `${ORIGIN}/daily`,
      dailyAtJst: "11:00",
      minCollectionMinutes: 1440,
    });
    const deferral = (promise: Promise<unknown>) =>
      promise.then(
        () => null,
        (error: unknown) => {
          expect(error).toBeInstanceOf(CrawlDeferred);
          return (error as CrawlDeferred).until;
        },
      );

    it("starts at 11:00 JST and never drifts after a late run", async () => {
      now = ELEVEN - 1;
      expect(await crawler([daily]).nextDue(daily)).toBe(ELEVEN);
      expect(await deferral(crawler([daily]).beginSource(daily))).toBe(ELEVEN);
      // Yesterday's run started late at 11:17 and finished at 11:27.
      now = ELEVEN - DAY + 17 * 60;
      let attempt = await crawler([daily]).beginSource(daily);
      now += 600;
      await crawler([daily]).endSource(daily, attempt, null);
      now = ELEVEN - 1;
      expect(await deferral(crawler([daily]).beginSource(daily))).toBe(ELEVEN);
      now = ELEVEN;
      expect(await crawler([daily]).nextDue(daily)).toBe(0);
      attempt = await crawler([daily]).beginSource(daily);
      now = ELEVEN + 17 * 60;
      // A deferral without requests does not give a daily slot back either.
      await crawler([daily]).endSource(daily, attempt, new CrawlDeferred(now));
      expect(await deferral(crawler([daily]).beginSource(daily))).toBe(
        ELEVEN + DAY,
      );
      expect(await crawler([daily]).nextDue(daily)).toBe(ELEVEN + DAY);
      expect(calls).toEqual([]);
    });

    it("catches up only the current JST day after missed days", async () => {
      now = ELEVEN - DAY;
      await crawler([daily]).beginSource(daily);
      now = ELEVEN + 3 * DAY - 3600;
      expect(await deferral(crawler([daily]).beginSource(daily))).toBe(
        ELEVEN + 3 * DAY,
      );
      // 23:59:59 JST the same day is still today's run.
      now = ELEVEN + 3 * DAY + 13 * 3600 - 1;
      const attempt = await crawler([daily]).beginSource(daily);
      // Midnight JST does not make the next day's run due before 11:00.
      now += 1;
      expect(await crawler([daily]).nextDue(daily)).toBe(ELEVEN + 4 * DAY);
      await crawler([daily]).endSource(daily, attempt, null);
      expect(await repo.getRecord("crawl_source", daily.id)).toEqual({
        last_requested: ELEVEN + 3 * DAY + 13 * 3600 - 1,
      });
    });

    it("claims each slot once under concurrent starts and stays blocked when stopped", async () => {
      now = ELEVEN + 60;
      const results = await Promise.allSettled([
        crawler([daily]).beginSource(daily),
        crawler([daily]).beginSource(daily),
      ]);
      expect(
        results.filter((item) => item.status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = results.find((item) => item.status === "rejected");
      expect(rejected?.reason).toBeInstanceOf(CrawlDeferred);
      await expect(
        crawler().beginSource({
          ...daily,
          id: "stopped",
          collectionBlocked: "停止",
        }),
      ).rejects.toBeInstanceOf(CrawlStopped);
    });

    it("reuses a response within one run but never the previous day's", async () => {
      now = ELEVEN;
      const url = daily.url;
      await crawler([daily]).fetch(url);
      now += 1800;
      await crawler([daily]).fetch(url);
      expect(calls.filter(([called]) => called === url)).toHaveLength(1);
      now = ELEVEN + DAY;
      await crawler([daily]).fetch(url);
      expect(calls.filter(([called]) => called === url)).toHaveLength(2);
      // The rolling 24-hour source keeps its cache and URL interval.
      const rolling = source({
        id: "rolling",
        url: `${ORIGIN}/rolling`,
        minCollectionMinutes: 1440,
      });
      await crawler([rolling]).fetch(rolling.url);
      now += DAY - 1;
      await crawler([rolling]).fetch(rolling.url);
      expect(calls.filter(([called]) => called === rolling.url)).toHaveLength(
        1,
      );
    });

    it("refreshes the root after upgrading from a rolling 24-hour cache", async () => {
      const rolling = source({ url: daily.url, minCollectionMinutes: 1440 });
      now = ELEVEN - DAY + 17 * 60;
      await crawler([rolling]).fetch(daily.url);
      // The old unscoped response is still valid until today's 11:17.
      now = ELEVEN;
      await crawler([daily]).beginSource(daily);
      await crawler([daily]).fetch(daily.url);
      expect(calls.filter(([url]) => url === daily.url)).toHaveLength(2);
      now += 60;
      await crawler([daily]).fetch(daily.url);
      expect(calls.filter(([url]) => url === daily.url)).toHaveLength(2);
    });
  });

  it("uses the default hourly source interval", async () => {
    const plain = source();
    await crawler().beginSource(plain);
    await expect(crawler().beginSource(plain)).rejects.toBeInstanceOf(
      CrawlDeferred,
    );
    expect(await crawler().nextDue(plain)).toBe(START + 3600);
  });

  describe("rolling source attempts", () => {
    const feed = source({
      url: `${ORIGIN}/feed`,
      minCollectionMinutes: 240,
      minRequestIntervalSeconds: 1800,
    });
    const record = () => repo.getRecord("crawl_source", feed.id);

    it("gives back the interval of a deferral that sent no source request", async () => {
      const cache = crawler([feed]);
      let attempt = await cache.beginSource(feed);
      expect(await record()).toEqual({
        last_requested: START,
        attempt: attempt.token,
        previous: 0,
      });
      // robots.txt takes the host slot; the feed itself is not requested.
      const deferred = await cache
        .fetch(feed.url)
        .catch((error: unknown) => error);
      expect(deferred).toBeInstanceOf(CrawlDeferred);
      expect(calls.map(([url]) => url)).toEqual([`${ORIGIN}/robots.txt`]);
      await cache.endSource(feed, attempt, deferred);
      expect(await record()).toEqual({
        last_requested: 0,
        retry_at: START + 1800,
      });
      expect(await repo.getRecord("crawl_url", feed.url)).toBeNull();
      expect(await cache.nextDue(feed)).toBe(START + 1800);
      await expect(cache.beginSource(feed)).rejects.toBeInstanceOf(
        CrawlDeferred,
      );
      now = START + 1800;
      attempt = await cache.beginSource(feed);
      await cache.fetch(feed.url);
      now += 5;
      await cache.endSource(feed, attempt, null);
      expect(await record()).toEqual({ last_requested: now });
      expect(await cache.nextDue(feed)).toBe(now + 14400);
    });

    it("consumes the interval for a failed request and a cache hit", async () => {
      errors.set(feed.url, new FetchError("unavailable", 503));
      await repo.putRecord(
        "crawl_robots",
        ORIGIN,
        { rules: "" },
        { expiresAt: START + 10 * 86400 },
      );
      const cache = crawler([feed]);
      let attempt = await cache.beginSource(feed);
      const failure = await cache
        .fetch(feed.url)
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(FetchError);
      now += 5;
      await cache.endSource(feed, attempt, failure);
      expect(await record()).toEqual({ last_requested: START + 5 });
      expect(await cache.nextDue(feed)).toBe(START + 5 + 14400);
      // A later deferral in the same attempt does not undo a sent request.
      now = START + 5 + 14400 + 7200;
      attempt = await cache.beginSource(feed);
      errors.clear();
      await cache.fetch(feed.url);
      await cache.endSource(feed, attempt, new CrawlDeferred(now + 1800));
      expect(await record()).toEqual({ last_requested: now });
      // A successful attempt served only from the cache keeps the cadence.
      const detail = `${ORIGIN}/detail.pdf`;
      now += 14400;
      attempt = await cache.beginSource(feed);
      await cache.fetch(detail);
      await cache.endSource(feed, attempt, null);
      now += 14400;
      attempt = await cache.beginSource(feed);
      await cache.fetch(detail);
      await cache.endSource(feed, attempt, null);
      expect(calls.filter(([url]) => url === detail)).toHaveLength(1);
      expect(await record()).toEqual({ last_requested: now });
    });

    it("does not claim the URL for a request the budget refuses", async () => {
      const plain = source({
        url: `${ORIGIN}/plain`,
        minCollectionMinutes: 240,
      });
      const cache = crawler([plain], { maxRequests: 1 });
      const attempt = await cache.beginSource(plain);
      const refused = await cache
        .fetch(plain.url)
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(CrawlLimit);
      expect(calls.map(([url]) => url)).toEqual([`${ORIGIN}/robots.txt`]);
      expect(await repo.getRecord("crawl_url", plain.url)).toBeNull();
      await cache.endSource(plain, attempt, refused);
      expect(await repo.getRecord("crawl_source", plain.id)).toEqual({
        last_requested: 0,
      });
      expect(await crawler([plain]).nextDue(plain)).toBeLessThanOrEqual(now);
    });

    it("never lets a stale attempt settle a newer claim", async () => {
      const stale = await crawler([feed]).beginSource(feed);
      // The first Worker is lost; its claim still counts as requested.
      now = START + 14400;
      const cache = crawler([feed]);
      const current = await cache.beginSource(feed);
      expect(await record()).toEqual({
        last_requested: now,
        attempt: current.token,
        previous: START,
      });
      await crawler([feed]).endSource(feed, stale, new CrawlDeferred(now));
      await crawler([feed]).endSource(feed, stale, null);
      expect(await record()).toMatchObject({ attempt: current.token });
      await cache.endSource(feed, current, new CrawlDeferred(now + 60));
      expect(await record()).toEqual({
        last_requested: START,
        retry_at: now + 60,
      });
      // Settling twice is a no-op as well.
      await cache.endSource(feed, current, null);
      expect(await record()).toEqual({
        last_requested: START,
        retry_at: now + 60,
      });
    });

    it("reads records without attempt fields and refuses malformed ones", async () => {
      await repo.putRecord("crawl_source", feed.id, { last_requested: START });
      now = START + 14400 - 1;
      await expect(crawler([feed]).beginSource(feed)).rejects.toBeInstanceOf(
        CrawlDeferred,
      );
      now += 1;
      const attempt = await crawler([feed]).beginSource(feed);
      expect(await record()).toMatchObject({ previous: START });
      await crawler([feed]).endSource(feed, attempt, new CrawlDeferred(now));
      for (const bad of [
        { last_requested: START, attempt: "a" },
        { last_requested: START, previous: 0 },
        { last_requested: START, retry_at: "soon" },
        { last_requested: "x" },
      ]) {
        await repo.putRecord("crawl_source", feed.id, bad);
        await expect(crawler([feed]).nextDue(feed)).rejects.toThrow(
          "取得記録が不正",
        );
      }
    });
  });

  it("keeps the URL attempt interval after cache eviction", async () => {
    const url = `${ORIGIN}/one`;
    const slow = source({ url, minCollectionMinutes: 360 });
    await crawler([slow]).fetch(url);
    vi.spyOn(repo, "getBlob").mockResolvedValue(null);
    await expect(crawler([slow]).fetch(url)).rejects.toBeInstanceOf(
      CrawlDeferred,
    );
    expect(calls).toHaveLength(2);
    expect(await crawler([slow]).nextDue(slow)).toBe(
      (calls[1]?.[1] ?? 0) + 21600,
    );
  });

  it("observes a new robots prohibition after the robots cache expires", async () => {
    await crawler().fetch(`${ORIGIN}/news`);
    now += 86401;
    rules = "User-agent: *\nDisallow: /";
    await expect(crawler().fetch(`${ORIGIN}/news`)).rejects.toBeInstanceOf(
      CrawlStopped,
    );
    expect(calls.filter(([url]) => url.endsWith("/news"))).toHaveLength(1);
  });

  it("cannot commit state or cache after its host lease expires", async () => {
    const putBlob = vi.spyOn(repo, "putBlob");
    const slow: FetchBytes = async (url, options) => {
      const result = await transport(url, options);
      now += CachedFetch.LEASE_SECONDS + 1;
      return result;
    };
    await expect(
      crawler([], { transport: slow }).fetch(`${ORIGIN}/news`),
    ).rejects.toThrow(/有効期限|所有権/);
    expect(putBlob).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it("isolates an expired writer from the generation published by a newer writer", async () => {
    const url = `${ORIGIN}/news`;
    const original = repo.putBlob.bind(repo);
    let paused!: () => void;
    let resume!: () => void;
    const reached = new Promise<void>((resolve) => (paused = resolve));
    const released = new Promise<void>((resolve) => (resume = resolve));
    const keys: string[] = [];
    vi.spyOn(repo, "putBlob").mockImplementation(
      async (key, value, expiresAt) => {
        keys.push(key);
        if (keys.length === 1) {
          paused();
          await released;
        }
        await original(key, value, expiresAt);
      },
    );
    const respond =
      (body: string): FetchBytes =>
      async (target) => {
        calls.push([target, now]);
        return target.endsWith("/robots.txt")
          ? { data: utf8(rules), url: target, contentType: "text/plain" }
          : { data: utf8(body), url: target, contentType: "text/html" };
      };
    const expired = crawler([], { transport: respond("old generation") }).fetch(
      url,
    );
    const outcome = expired.catch((caught: unknown) => caught);
    await reached;
    now += CachedFetch.LEASE_SECONDS + 1;
    const fresh = crawler([], { transport: respond("new generation") });
    expect(text(await fresh.fetch(url))).toBe("new generation");
    const published = await repo.getRecord<{ blob: string }>(
      "crawl_response",
      url,
    );
    resume();
    expect(String(await outcome)).toMatch(/有効期限|所有権/);
    expect(await repo.getRecord("crawl_response", url)).toEqual(published);
    expect(text(await fresh.fetch(url))).toBe("new generation");
    expect(new Set(keys).size).toBe(2);
    expect(keys[1]).toBe(published?.blob);
    expect(await repo.getBlob(keys[0] ?? "")).not.toBeNull();
    // The abandoned generation is removed by ordinary TTL pruning.
    now += cacheTtl(url) + 1;
    await repo.putBlob("sweep", utf8("next"), now + 60);
    expect(await repo.getBlob(keys[0] ?? "")).toBeNull();
  });

  it("accepts a robots exception only for the documented Google search feed", () => {
    expect(() =>
      crawler([source({ url: ORIGIN, robotsException: true })]),
    ).toThrow("robots 例外");
    const google = source({
      url: GOOGLE,
      robotsException: true,
      robotsExceptionReason: "公開検索RSS",
      minCollectionMinutes: 360,
      minRequestIntervalSeconds: 1800,
    });
    expect(() => crawler([google])).not.toThrow();
    expect(() =>
      crawler([{ ...google, minRequestIntervalSeconds: 60 }]),
    ).toThrow("robots 例外");
  });

  it("applies the robots exception to the exact URL only, never to other URLs or redirects", async () => {
    rules = "User-agent: *\nDisallow: /rss/search\n";
    const google = source({
      url: GOOGLE,
      robotsException: true,
      robotsExceptionReason: "公開検索RSS",
      minCollectionMinutes: 360,
      minRequestIntervalSeconds: 1800,
    });
    // The first run only reads robots.txt; the 30 minute host delay defers the feed.
    await expect(crawler([google]).fetch(GOOGLE)).rejects.toBeInstanceOf(
      CrawlDeferred,
    );
    now += 1800;
    expect(text(await crawler([google]).fetch(GOOGLE))).toBe("content");
    now += 1800;
    await expect(
      crawler([google]).fetch("https://news.google.com/rss/search?q=other"),
    ).rejects.toThrow("禁止");
    now += 1800;
    const loop: FetchBytes = async (url, options) => {
      calls.push([url, now]);
      if (url.endsWith("/robots.txt"))
        return { data: utf8(rules), url, contentType: "text/plain" };
      await options?.beforeRedirect?.(GOOGLE);
      return { data: utf8("content"), url, contentType: "text/html" };
    };
    await expect(
      crawler([google], { transport: loop }).fetch(
        "https://news.google.com/start",
      ),
    ).rejects.toBeInstanceOf(CrawlStopped);
    expect(calls.filter(([url]) => url === GOOGLE)).toHaveLength(1);
  });

  describe("gazette TOC robots exception", () => {
    const HOME = "https://www.kanpo.go.jp/";
    const TOC = `${HOME}20260925/20260925.fullcontents.html`;
    const gazette = source({
      id: "kanpo",
      url: HOME,
      kind: "kanpo",
      issueDays: 3,
      minCollectionMinutes: 1440,
      minRequestIntervalSeconds: 3,
      robotsException: true,
      robotsExceptionReason: "利用者指定の日別目次",
    });
    beforeEach(() => {
      rules = "User-agent: *\nDisallow: /20\nDisallow: /old/\n";
    });

    it("accepts only the bounded gazette configuration", () => {
      expect(() => crawler([gazette])).not.toThrow();
      for (const changes of [
        { issueDays: 4 },
        { minCollectionMinutes: 1439 },
        { url: `${HOME}index.html` },
        { robotsExceptionReason: "" },
        { kind: "html" as const },
      ]) {
        expect(() => crawler([{ ...gazette, ...changes }])).toThrow(
          "robots 例外",
        );
      }
    });

    it("fetches exact daily TOCs after robots.txt and nothing else under /20", async () => {
      const cache = crawler([gazette]);
      expect(text(await cache.fetch(HOME))).toBe("content");
      expect(text(await cache.fetch(TOC))).toBe("content");
      for (const url of [
        `${HOME}20260925/20260925h01795/20260925h017950002f.html`,
        `${HOME}20260925/20260925h01795/20260925h01795full00010032f.pdf`,
        `${HOME}20260925/20260924.fullcontents.html`,
        `${HOME}20260231/20260231.fullcontents.html`,
        `${TOC}?page=2`,
        `${HOME}old/20260925/20260925.fullcontents.html`,
        "http://www.kanpo.go.jp/20260925/20260925.fullcontents.html",
        "https://www.kanpo.go.jp:8443/20260925/20260925.fullcontents.html",
        "https://kanpo.go.jp/20260925/20260925.fullcontents.html",
      ]) {
        await expect(cache.fetch(url)).rejects.toThrow("禁止");
      }
      const fetched = calls.map(([url]) => url);
      expect(fetched.filter((url) => !url.endsWith("/robots.txt"))).toEqual([
        HOME,
        TOC,
      ]);
      expect(spaced()).toBe(true);
    });

    it("never applies to redirects, disabled sources or other sources", async () => {
      const hop: FetchBytes = async (url, options) => {
        calls.push([url, now]);
        if (url.endsWith("/robots.txt"))
          return { data: utf8(rules), url, contentType: "text/plain" };
        await options?.beforeRedirect?.(
          `${HOME}20260924/20260924.fullcontents.html`,
        );
        return { data: utf8("content"), url, contentType: "text/html" };
      };
      await expect(
        crawler([gazette], { transport: hop }).fetch(TOC),
      ).rejects.toThrow("転送先を取得しません");
      now += 60;
      await expect(
        crawler([{ ...gazette, enabled: false }]).fetch(TOC),
      ).rejects.toThrow("禁止");
      await expect(crawler().fetch(TOC)).rejects.toThrow("禁止");
      const google = source({
        url: GOOGLE,
        robotsException: true,
        robotsExceptionReason: "公開検索RSS",
        minCollectionMinutes: 360,
        minRequestIntervalSeconds: 1800,
      });
      await expect(crawler([google]).fetch(TOC)).rejects.toThrow("禁止");
      expect(calls.filter(([url]) => url === TOC)).toHaveLength(1);
    });

    it("rejects every gazette redirect before requesting its target", async () => {
      const login = `${HOME}login`;
      const hop =
        (from: string): FetchBytes =>
        async (url, options) => {
          const result = await transport(url, options);
          if (url !== from) return result;
          await options?.beforeRedirect?.(login);
          return transport(login, options);
        };
      for (const from of [HOME, TOC]) {
        await expect(
          crawler([gazette], { transport: hop(from) }).fetch(from),
        ).rejects.toThrow("転送先を取得しません");
        now += 60;
      }
      expect(calls.map(([url]) => url)).not.toContain(login);
      // robots.txt allows /login and a direct TOC request still works.
      expect(new RobotsPolicy(rules).allows(login)).toBe(true);
      now += 86400;
      expect(text(await crawler([gazette]).fetch(TOC))).toBe("content");
      // Other hosts keep following robots-allowed same-host redirects.
      expect(
        text(
          await crawler([], {
            transport: redirecting(`${ORIGIN}/moved`),
          }).fetch(`${ORIGIN}/start`),
        ),
      ).toBe("content");
    });

    it("still requires robots.txt and keeps host backoff", async () => {
      errors.set(`${HOME}robots.txt`, new FetchError("unavailable", 503));
      await expect(crawler([gazette]).fetch(TOC)).rejects.toThrow(
        "robots.txt を確認できない",
      );
      expect(calls.map(([url]) => url)).toEqual([`${HOME}robots.txt`]);
      errors.clear();
      now += 86400;
      errors.set(TOC, new FetchError("forbidden", 403));
      await expect(crawler([gazette]).fetch(TOC)).rejects.toThrow("forbidden");
      await expect(
        crawler([gazette]).fetch(`${HOME}20260924/20260924.fullcontents.html`),
      ).rejects.toBeInstanceOf(CrawlBackoff);
      expect((await hostState("kanpo.go.jp"))?.blocked_until).toBeGreaterThan(
        now + 3600,
      );
    });
  });

  describe("MAFF robots.txt 403 treated as unavailable", () => {
    const MAFF_ORIGIN = "https://www.maff.go.jp";
    const MAFF_ROBOTS = `${MAFF_ORIGIN}/robots.txt`;
    const OTHER = `${MAFF_ORIGIN}/j/press/other/260928.html`;
    const maff = source({
      id: "maff-press",
      url: MAFF_PRESS,
      kind: "html",
      allowedPathPattern: "^/j/press/",
      dailyAtJst: "11:00",
      minCollectionMinutes: 1440,
      minRequestIntervalSeconds: 3,
      robotsUnavailableStatus: 403,
      robotsUnavailableReason: "robots.txt が 403 のため取得不能として扱う",
    });
    const pages = () => calls.map(([url]) => url);
    const maffState = () => hostState("maff.go.jp");
    beforeEach(() => {
      errors.set(MAFF_ROBOTS, new FetchError("forbidden", 403));
    });

    it("accepts only the exact, explained, daily MAFF press index", () => {
      expect(() => crawler([maff])).not.toThrow();
      expect(() => loadSources([maff])).not.toThrow();
      for (const changes of [
        { url: "https://www.rinya.maff.go.jp/j/press/index.html" },
        { url: `${MAFF_ORIGIN}/j/press/` },
        { url: `${MAFF_ORIGIN}/j/press/index.html?x=1` },
        { url: "http://www.maff.go.jp/j/press/index.html" },
        { robotsUnavailableStatus: 401 as 403 },
        { robotsUnavailableStatus: undefined },
        { robotsUnavailableReason: " " },
        { robotsUnavailableReason: undefined },
        { kind: "rss" as const },
        { minCollectionMinutes: 360, dailyAtJst: undefined },
        { dailyAtJst: undefined },
        { minRequestIntervalSeconds: undefined },
      ]) {
        const invalid = { ...maff, ...changes };
        expect(() => crawler([invalid])).toThrow("robots.txt 取得不能");
        expect(() => crawler([{ ...invalid, enabled: false }])).toThrow(
          "robots.txt 取得不能",
        );
        expect(() =>
          loadSources([JSON.parse(JSON.stringify(invalid))]),
        ).toThrow("農林水産省");
      }
      // A robots exception must not be combined with, or reused for, this policy.
      const both = {
        ...maff,
        robotsException: true as const,
        robotsExceptionReason: "理由",
      };
      expect(() => crawler([both])).toThrow("robots");
      expect(() => loadSources([both])).toThrow("robots");
    });

    it("fetches only the exact index without caching an empty policy", async () => {
      expect(text(await crawler([maff]).fetch(MAFF_PRESS))).toBe("content");
      expect(pages()).toEqual([MAFF_ROBOTS, MAFF_PRESS]);
      expect(spaced()).toBe(true);
      expect(await repo.getRecord("crawl_robots", MAFF_ORIGIN)).toBeNull();
      let state = await maffState();
      expect([state?.blocked_until, state?.failures]).toEqual([0, 0]);
      // Any other MAFF URL rechecks robots.txt and stops with the usual backoff.
      await expect(crawler([maff]).fetch(OTHER)).rejects.toThrow(
        "robots.txt を確認できない",
      );
      state = await maffState();
      expect([state?.blocked_until, state?.failures]).toEqual([now + 86400, 1]);
      expect(pages()).toEqual([MAFF_ROBOTS, MAFF_PRESS, MAFF_ROBOTS]);
    });

    it("never applies to disabled, blocked or unconfigured sources, or other origins", async () => {
      for (const sources of [
        [{ ...maff, enabled: false }],
        [{ ...maff, collectionBlocked: "停止" }],
        [],
      ]) {
        await expect(crawler(sources).fetch(MAFF_PRESS)).rejects.toThrow(
          "robots.txt を確認できない",
        );
        now += 86401;
      }
      expect(pages()).toEqual([MAFF_ROBOTS, MAFF_ROBOTS, MAFF_ROBOTS]);
      expect((await maffState())?.failures).toBe(3);
      errors.set(`${ORIGIN}/robots.txt`, new FetchError("forbidden", 403));
      await expect(crawler([maff]).fetch(`${ORIGIN}/news`)).rejects.toThrow(
        "robots.txt を確認できない",
      );
      expect((await hostState())?.failures).toBe(1);
    });

    it("still obeys a genuine robots.txt disallow", async () => {
      errors.clear();
      rules = "User-agent: *\nDisallow: /j/press/\n";
      await expect(crawler([maff]).fetch(MAFF_PRESS)).rejects.toThrow("禁止");
      expect(pages()).toEqual([MAFF_ROBOTS]);
      expect(await repo.getRecord("crawl_robots", MAFF_ORIGIN)).toEqual({
        rules,
      });
    });

    it("applies a real robots crawl delay and keeps host pacing", async () => {
      errors.clear();
      rules = "User-agent: *\nCrawl-delay: 10\n";
      await expect(crawler([maff]).fetch(MAFF_PRESS)).rejects.toBeInstanceOf(
        CrawlDeferred,
      );
      now += 10;
      expect(text(await crawler([maff]).fetch(MAFF_PRESS))).toBe("content");
      expect(pages()).toEqual([MAFF_ROBOTS, MAFF_PRESS]);
    });

    it("never follows a page redirect admitted without robots rules", async () => {
      const moved = `${MAFF_ORIGIN}/j/press/moved.html`;
      const hop: FetchBytes = async (url, options) => {
        const result = await transport(url, options);
        if (url !== MAFF_PRESS) return result;
        await options?.beforeRedirect?.(moved);
        return transport(moved, options);
      };
      await expect(
        crawler([maff], { transport: hop }).fetch(MAFF_PRESS),
      ).rejects.toThrow("転送先を取得しません");
      expect(pages()).toEqual([MAFF_ROBOTS, MAFF_PRESS]);
      const state = await maffState();
      expect([state?.blocked_until, state?.failures]).toEqual([0, 0]);
    });

    it("does not accept a 403 reached through a robots.txt redirect", async () => {
      const moved = `${MAFF_ORIGIN}/robots-moved.txt`;
      errors.clear();
      errors.set(moved, new FetchError("forbidden", 403));
      const hop: FetchBytes = async (url, options) => {
        if (url !== MAFF_ROBOTS) return transport(url, options);
        calls.push([url, now]);
        await options?.beforeRedirect?.(moved);
        return transport(moved, options);
      };
      await expect(
        crawler([maff], { transport: hop }).fetch(MAFF_PRESS),
      ).rejects.toThrow("robots.txt を確認できない");
      expect(pages()).toEqual([MAFF_ROBOTS, moved]);
      const state = await maffState();
      expect([state?.blocked_until, state?.failures]).toEqual([now + 86400, 1]);
    });

    it("keeps the 24 hour backoff for a page 403", async () => {
      errors.set(MAFF_PRESS, new FetchError("page forbidden", 403));
      await expect(crawler([maff]).fetch(MAFF_PRESS)).rejects.toThrow(
        "page forbidden",
      );
      const state = await maffState();
      expect([state?.blocked_until, state?.failures]).toEqual([now + 86400, 1]);
    });

    it.each([
      [new FetchError("unauthorized", 401), 86400],
      [new FetchError("limited", 429), 3600],
      [new FetchError("unavailable", 503), 900],
      [new FetchError("network"), 900],
    ])("stops and backs off once for robots.txt %s", async (error, seconds) => {
      errors.set(MAFF_ROBOTS, error);
      await expect(crawler([maff]).fetch(MAFF_PRESS)).rejects.toThrow(
        "robots.txt を確認できない",
      );
      expect(pages()).toEqual([MAFF_ROBOTS]);
      const state = await maffState();
      expect([state?.blocked_until, state?.failures]).toEqual([
        now + seconds,
        1,
      ]);
    });

    it.each([
      ["HTML", utf8("<html>403</html>"), "text/html"],
      ["invalid UTF-8", new Uint8Array([0xff, 0xfe]), "text/plain"],
    ])(
      "stops and backs off once for a 200 %s robots.txt",
      async (_, data, contentType) => {
        const robots: FetchBytes = async (url, options) =>
          url === MAFF_ROBOTS
            ? (calls.push([url, now]), { data, url, contentType })
            : transport(url, options);
        await expect(
          crawler([maff], { transport: robots }).fetch(MAFF_PRESS),
        ).rejects.toThrow("収集停止");
        expect(pages()).toEqual([MAFF_ROBOTS]);
        expect((await maffState())?.failures).toBe(1);
      },
    );

    it("leaves an existing host block in place", async () => {
      const cache = crawler([maff]);
      errors.set(MAFF_PRESS, new FetchError("unavailable", 503));
      await expect(cache.fetch(MAFF_PRESS)).rejects.toThrow("unavailable");
      errors.delete(MAFF_PRESS);
      now += 60;
      await expect(crawler([maff]).fetch(MAFF_PRESS)).rejects.toBeInstanceOf(
        CrawlBackoff,
      );
      expect(pages()).toEqual([MAFF_ROBOTS, MAFF_PRESS]);
    });
  });

  it("refuses blocked and disabled sources before any request", async () => {
    await expect(
      crawler().beginSource(source({ collectionBlocked: "robots blocked" })),
    ).rejects.toThrow("robots blocked");
    await expect(
      crawler().beginSource(source({ enabled: false })),
    ).rejects.toThrow("停止しています");
    expect(calls).toEqual([]);
  });

  it("counts robots.txt in the request budget without retrying or backing off", async () => {
    const cache = crawler([], { maxRequests: 2 });
    await cache.fetch(`${ORIGIN}/one`);
    await expect(cache.fetch(`${ORIGIN}/two`)).rejects.toThrow(
      "リクエスト上限",
    );
    expect(calls).toHaveLength(2);
    expect((await hostState())?.failures).toBe(0);
    await cache.fetch(`${ORIGIN}/one`);
    expect(cache.requests).toBe(2);
  });

  it("defaults to a budget of 40 requests and validates it", async () => {
    const cache = crawler();
    for (let index = 0; index < 39; index += 1) {
      now += 10;
      await cache.fetch(`${ORIGIN}/page-${index}`);
    }
    now += 10;
    await expect(cache.fetch(`${ORIGIN}/page-last`)).rejects.toThrow("40 回");
    expect(cache.requests).toBe(40);
    for (const maxRequests of [0, 1.5, Number.NaN])
      expect(() => crawler([], { maxRequests })).toThrow("上限");
  });

  it("stops for a caller abort without a request or backoff", async () => {
    const controller = new AbortController();
    const reason = new Error("job deadline");
    controller.abort(reason);
    await expect(
      crawler([], { signal: controller.signal }).fetch(`${ORIGIN}/one`),
    ).rejects.toBe(reason);
    expect(calls).toEqual([]);
    const live = new AbortController();
    const aborting: FetchBytes = async (url, options) => {
      calls.push([url, now]);
      live.abort(reason);
      options?.signal?.throwIfAborted();
      return transport(url, options);
    };
    await expect(
      crawler([], { transport: aborting, signal: live.signal }).fetch(
        `${ORIGIN}/one`,
      ),
    ).rejects.toBe(reason);
    expect((await hostState())?.blocked_until).toBe(0);
  });

  it("reports the deferral time in the message", () => {
    const error = new CrawlDeferred(START + 0.9);
    expect(error.until).toBe(START + 0.9);
    expect(error.message).toBe(
      "取得間隔を守るため 1970/1/12 22:46:40 JST まで待機し、次の収集で再確認します",
    );
    expect(error).toBeInstanceOf(FetchError);
  });

  it("chooses cache lifetimes by URL shape", () => {
    expect(cacheTtl("https://example.org/a.PDF")).toBe(86400);
    expect(
      cacheTtl(
        "https://public-comment.e-gov.go.jp/pcm/detail?CLASSNAME=PCMMSTDETAIL&id=1",
      ),
    ).toBe(21600);
    expect(cacheTtl("https://example.org/")).toBe(3600);
  });
});

describe("RobotsPolicy", () => {
  it("selects the NilayNews group, then the wildcard group", () => {
    const policy = new RobotsPolicy(
      "User-agent: *\nDisallow: /\n\nUser-agent: NilayNews\nDisallow: /private\n",
    );
    expect(policy.allows("https://example.org/news")).toBe(true);
    expect(policy.allows("https://example.org/private/a")).toBe(false);
    expect(
      new RobotsPolicy("User-agent: other\nDisallow: /\n").allows(
        "https://example.org/",
      ),
    ).toBe(true);
  });

  it("uses the longest match with Allow winning ties, wildcards and end anchors", () => {
    const policy = new RobotsPolicy(
      "﻿User-agent: *\nDisallow: /a\nAllow: /a/b\nDisallow: /*.pdf$\nAllow: /x\nDisallow: /x\n# Disallow: /c\n",
    );
    expect(policy.allows("https://example.org/a/c")).toBe(false);
    expect(policy.allows("https://example.org/a/b/c")).toBe(true);
    expect(policy.allows("https://example.org/files/doc.pdf")).toBe(false);
    expect(policy.allows("https://example.org/files/doc.pdf?x=1")).toBe(true);
    expect(policy.allows("https://example.org/x")).toBe(true);
    expect(policy.allows("https://example.org/c")).toBe(true);
  });

  it("normalizes unreserved escapes but keeps reserved ones", () => {
    const policy = new RobotsPolicy(
      "User-agent: *\nDisallow: /%7euser\nDisallow: /a%2fb\nDisallow: /?q=1\n",
    );
    expect(policy.allows("https://example.org/~user/x")).toBe(false);
    expect(policy.allows("https://example.org/a/b")).toBe(true);
    expect(policy.allows("https://example.org/a%2Fb")).toBe(false);
    expect(policy.allows("https://example.org/?q=1")).toBe(false);
  });

  it("parses crawl delays and request rates, rejecting unreadable values", () => {
    expect(
      new RobotsPolicy("User-agent: *\nCrawl-delay: 5\nRequest-rate: 1/10\n")
        .delay,
    ).toBe(10);
    for (const line of [
      "Crawl-delay: -1",
      "Crawl-delay: inf",
      "Crawl-delay: 0x10",
      "Request-rate: 0/10",
      "Request-rate: 10",
      "Crawl-delay:",
    ]) {
      expect(() => new RobotsPolicy(`User-agent: *\n${line}\n`)).toThrow(
        "取得間隔",
      );
    }
    expect(() => new RobotsPolicy("<!DOCTYPE html>")).toThrow("HTML");
  });

  it("matches many wildcards without catastrophic backtracking", () => {
    const policy = new RobotsPolicy(
      `User-agent: *\nDisallow: /${"*a".repeat(200)}$\n`,
    );
    const started = performance.now();
    expect(policy.allows(`https://example.org/${"a".repeat(5000)}b`)).toBe(
      true,
    );
    expect(performance.now() - started).toBeLessThan(500);
  });
});
