// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CrawlOptions } from "../src/crawl.ts";
import {
  CachedFetch,
  CrawlDeferred,
  CrawlStopped,
  cacheTtl,
} from "../src/crawl.ts";
import { FetchError } from "../src/net/http.ts";
import type { FetchBytes, FetchOptions } from "../src/net/types.ts";
import { RobotsPolicy } from "../src/robots.ts";
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
    await cache.beginSource(configured);
    now += 10;
    await cache.endSource(configured);
    expect(await cache.nextDue(configured)).toBe(now + 21600);
  });

  it("uses the default hourly source interval", async () => {
    const plain = source();
    await crawler().beginSource(plain);
    await expect(crawler().beginSource(plain)).rejects.toBeInstanceOf(
      CrawlDeferred,
    );
    expect(await crawler().nextDue(plain)).toBe(START + 3600);
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
      "取得間隔を守るため 1970-01-12T13:46:40+00:00 まで待機し、次の収集で再確認します",
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
