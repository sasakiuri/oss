// SPDX-License-Identifier: MIT
// cspell:ignore garturlres garturlreq Fbv4je rpcids batchexecute CBMigg wrb
import { afterEach, describe, expect, it, vi } from "vitest";

import { Application } from "../src/application.ts";
import { UserError } from "../src/errors.ts";
import { createFeedHandler } from "../src/feed-worker.ts";
import { resolveGoogleNewsItems } from "../src/google-news.ts";
import { Jev } from "../src/jev.ts";
import { createFeedTransport } from "../src/net/feed-transport.ts";
import {
  GOOGLE_NEWS_LOCALE,
  GOOGLE_NEWS_RPC,
  googleNewsId,
  googleNewsParameters,
  googleNewsRequest,
  googleNewsResponse,
  isGoogleNewsPage,
  legacyGoogleNewsUrl,
  publisherUrl,
  validGoogleNewsRequest,
} from "../src/net/google-news.ts";
import { FetchError, type Fetcher } from "../src/net/http.ts";
import type { FetchBytes } from "../src/net/types.ts";
import { draft } from "../src/posts.ts";
import { BufferClient } from "../src/publishing.ts";
import { citationOnly, collection, type SourceConfig } from "../src/sources/types.ts";

import { testRepository } from "./helpers/storage.ts";

const encode = (value: string) => new TextEncoder().encode(value);
const parameters = { timestamp: 1_700_000_000, signature: "test-signature" };
const page = encode('<div data-n-a-ts="1700000000" data-n-a-sg="test-signature"></div>');
const article = (id: string) => `https://news.google.com/rss/articles/${id}`;
const pageUrl = (id: string) => `${article(id)}${GOOGLE_NEWS_LOCALE}`;
const publisher = "https://example.org/story";
const item = (url: string) => ({ title: "記事", url, excerpt: "概要", publishedAt: null });
const rpc = (url = publisher) => encode(
  ")]}'\n\n123\n" + JSON.stringify([["wrb.fr", "Fbv4je", JSON.stringify(["garturlres", url])]]) + "\n",
);
function legacy(url: string): string {
  const bytes = encode(url);
  const prefix = [8, 19, 34];
  let size = bytes.length;
  while (size >= 128) { prefix.push((size & 127) | 128); size = Math.floor(size / 128); }
  prefix.push(size);
  return Buffer.from([...prefix, ...bytes, 0xd2, 1, 0]).toString("base64url");
}
const cleanup: (() => void)[] = [];
afterEach(() => { for (const close of cleanup.splice(0)) close(); });
async function setup() {
  let now = 10_000;
  const storage = testRepository([], () => now);
  cleanup.push(storage.close);
  await storage.repo.initialize();
  const calls: string[] = [];
  const transport: FetchBytes = vi.fn(async (url) => {
    calls.push(url);
    return { url, data: url === GOOGLE_NEWS_RPC ? rpc() : page, contentType: "text/html" };
  });
  return {
    repo: storage.repo,
    calls,
    advance: (seconds: number) => { now += seconds; },
    options: {
      clock: () => now,
      transport,
      sleep: async (milliseconds: number) => { now += milliseconds / 1000; },
    },
  };
}

describe("Google News URL protocol", () => {
  it("decodes legacy variable-length UTF-8 URLs, not fixed byte offsets", () => {
    for (const path of ["short", "x".repeat(300), "日本語".repeat(50)]) {
      const url = `https://example.org/${path}`;
      expect(legacyGoogleNewsUrl(legacy(url))).toBe(publisherUrl(url));
    }
    expect(legacyGoogleNewsUrl("AAAA")).toBeNull();
    expect(legacyGoogleNewsUrl("CBMigg")).toBeNull();
  });

  it.each([
    "http://127.0.0.1/private", "http://[::1]/private", "http://10.0.0.1/a",
    "https://user:pass@example.org/a", "javascript:alert(1)",
    "https://news.google.com/rss/articles/opaque", "https://consent.google.com/m",
    "https://accounts.google.com/login", "https://www.google.com/sorry/index",
    "https://www.google.com/url?q=https://example.org/",
  ])("refuses an unsafe or unresolved destination: %s", (url) => {
    expect(publisherUrl(url)).toBeNull();
    expect(legacyGoogleNewsUrl(legacy(url))).toBeNull();
    expect(() => googleNewsResponse(rpc(url))).toThrow();
  });

  it("recognizes article aliases but exposes only the fixed locale page to the service", () => {
    for (const path of ["rss/articles", "articles", "read"])
      expect(googleNewsId(`https://news.google.com/${path}/opaque?oc=5`)).toBe("opaque");
    expect(isGoogleNewsPage(pageUrl("opaque"))).toBe(true);
    for (const url of [article("opaque"), `${pageUrl("opaque")}&url=https://evil.example/`,
      "https://news.google.com/rss/articles/a%2Fb", "https://news.google.com.evil.example/rss/articles/a"])
      expect(isGoogleNewsPage(url)).toBe(false);
  });

  it("extracts attributes from one element and parses framed nested JSON", () => {
    expect(googleNewsParameters(page)).toEqual(parameters);
    expect(googleNewsResponse(rpc("https://example.org/a?x=1&y=2")))
      .toBe("https://example.org/a?x=1&y=2");
    expect(() => googleNewsParameters(encode('<i data-n-a-ts="1700000000"></i><b data-n-a-sg="x"></b>'))).toThrow();
    expect(() => googleNewsResponse(encode('["https://example.org/not-a-result"]'))).toThrow();
    expect(() => googleNewsResponse(encode('[["wrb.fr","other","[\\"garturlres\\",\\"https://example.org/a\\"]"]]'))).toThrow();
    for (const parse of [googleNewsParameters, googleNewsResponse])
      expect(() => parse(new Uint8Array([255]))).toThrow(/Google News/);
  });

  it("accepts only its exact single-article RPC body", () => {
    const body = googleNewsRequest("opaque", parameters);
    expect(validGoogleNewsRequest(body)).toBe(true);
    expect(validGoogleNewsRequest(googleNewsRequest("opaque", { ...parameters, signature: "A+/=" }))).toBe(true);
    expect(validGoogleNewsRequest(encode(`${new TextDecoder().decode(body)}&extra=x`))).toBe(false);
    expect(validGoogleNewsRequest(new Uint8Array(16_385))).toBe(false);
    expect(validGoogleNewsRequest(encode("f.req=%5B%5D"))).toBe(false);
    expect(() => googleNewsRequest("../private", parameters)).toThrow();
  });
});

describe("bounded Google News resolution", () => {
  it("resolves once, caches across invocations, preserves attribution, and deduplicates", async () => {
    const { repo, options, calls } = await setup();
    const result = collection([item(article("opaque")), item(publisher), item(article("opaque") + "?oc=5")]);
    await resolveGoogleNewsItems(result, repo, options);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.url).toBe(publisher);
    expect(result.items[0]?.metadata?.googleNewsUrl).toBe(article("opaque"));
    expect(citationOnly(result.items[0]?.metadata ?? {})).toBe(true);
    expect(calls).toEqual([pageUrl("opaque"), GOOGLE_NEWS_RPC]);
    expect(result.warnings).toEqual([]);
    const again = collection([item(article("opaque"))]);
    await resolveGoogleNewsItems(again, repo, options);
    expect(again.items[0]?.url).toBe(publisher);
    expect(calls).toHaveLength(2);
    expect(options.clock()).toBe(10_003);
  });

  it("preserves distinct source keys and leaves non-Google collections unchanged", async () => {
    const { repo, options } = await setup();
    const first = { ...item(publisher), sourceKey: "one" };
    const second = { ...item(publisher), sourceKey: "two" };
    const plain = collection([first, second]);
    const original = plain.items;
    await resolveGoogleNewsItems(plain, repo, options);
    expect(plain.items).toBe(original);
    const mixed = collection([first, second, item(article(legacy(publisher)))]);
    await resolveGoogleNewsItems(mixed, repo, options);
    expect(mixed.items).toHaveLength(3);
  });

  it("uses local legacy decoding without a network request", async () => {
    const { repo, options, calls } = await setup();
    const result = collection([item(article(legacy(publisher + "?utm_source=google")))]);
    await resolveGoogleNewsItems(result, repo, options);
    expect(result.items[0]?.url).toBe(publisher);
    expect(calls).toEqual([]);
  });

  it("refreshes expired mappings instead of retaining them forever", async () => {
    const { repo, options, calls, advance } = await setup();
    await resolveGoogleNewsItems(collection([item(article("opaque"))]), repo, options);
    advance(7 * 86400 + 1);
    await resolveGoogleNewsItems(collection([item(article("opaque"))]), repo, options);
    expect(calls).toHaveLength(4);
  });

  it("retains unrelated successes and warns when decoding fails", async () => {
    const { repo, options } = await setup();
    const transport = vi.fn<FetchBytes>(async (url) => ({ url, data: encode("bad response"), contentType: "text/html" }));
    const result = collection([item(article("bad")), item(publisher)]);
    await resolveGoogleNewsItems(result, repo, { ...options, transport });
    expect(result.items).toEqual([item(publisher)]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("1 件");
    expect(result.notes).toEqual([]);
    await resolveGoogleNewsItems(collection([item(article("bad"))]), repo, { ...options, transport });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("honors Retry-After across instances without requesting another article", async () => {
    const { repo, options } = await setup();
    const transport = vi.fn<FetchBytes>(async () => { throw new FetchError("limited", 429, 7200); });
    await resolveGoogleNewsItems(collection([item(article("one"))]), repo, { ...options, transport });
    const next = collection([item(article("two"))]);
    await resolveGoogleNewsItems(next, repo, { ...options, transport });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(next.items).toEqual([]);
    expect(await repo.getRecord("google_news_url_rate", "google-news-url:news.google.com"))
      .toMatchObject({ blockedUntil: 17_200 });
  });

  it("respects a feed-host cooldown and a competing durable lease", async () => {
    const { repo, options, calls } = await setup();
    await repo.putRecord("crawl_host", "news.google.com", { blocked_until: 20_000 });
    await resolveGoogleNewsItems(collection([item(article("one"))]), repo, options);
    expect(calls).toEqual([]);
    await repo.deleteRecord("crawl_host", "news.google.com");
    const token = await repo.acquireHost("google-news-url:news.google.com", options.clock(), 120);
    const result = collection([item(article("two"))]);
    await resolveGoogleNewsItems(result, repo, options);
    expect(result.items).toEqual([]);
    expect(calls).toEqual([]);
    expect(token).not.toBeNull();
  });

  it("bounds a large feed and reports the omitted entries", async () => {
    const { repo, options, calls } = await setup();
    const result = collection(Array.from({ length: 100 }, (_, i) => item(article(`opaque-${i}`))));
    await resolveGoogleNewsItems(result, repo, options);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBeLessThanOrEqual(40);
    expect(options.clock()).toBeLessThanOrEqual(10_093);
    expect(result.warnings).toHaveLength(1);
  });

  it("propagates cancellation and non-user storage errors", async () => {
    const { repo, options, calls } = await setup();
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);
    await expect(resolveGoogleNewsItems(collection([item(article("one"))]), repo, {
      ...options, signal: controller.signal,
    })).rejects.toBe(reason);
    expect(calls).toEqual([]);
    const storageError = new UserError("storage unavailable");
    vi.spyOn(repo, "getRecord").mockRejectedValueOnce(storageError);
    await expect(resolveGoogleNewsItems(collection([item(article("two"))]), repo, options)).rejects.toBe(storageError);
  });
});

describe("regional decoding service and publication", () => {
  it("allows only narrow GET/POST requests and strips caller credentials", async () => {
    const upstream = vi.fn<Fetcher>(async () => new Response(page));
    const handler = createFeedHandler(upstream);
    const transport = createFeedTransport({ fetch: handler });
    await transport(pageUrl("opaque"), { headers: { Accept: "text/html", Cookie: "not-forwarded" } });
    await transport(GOOGLE_NEWS_RPC, { body: googleNewsRequest("opaque", parameters) });
    expect(upstream).toHaveBeenCalledTimes(2);
    const init = upstream.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).has("cookie")).toBe(false);
    expect(init?.redirect).toBe("manual");
    expect((await handler(new Request("https://news.google.com/private"))).status).toBe(403);
    expect((await handler(new Request(GOOGLE_NEWS_RPC, { method: "POST", body: "bad" }))).status).toBe(400);
    expect((await handler(new Request(pageUrl("opaque"), { method: "POST" }))).status).toBe(405);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("never follows a decoding redirect or an oversized response", async () => {
    const redirect = vi.fn(async () => new Response(null, { status: 302, headers: { Location: publisher } }));
    const transport = createFeedTransport({ fetch: createFeedHandler(redirect) });
    await expect(transport(pageUrl("opaque"), { headers: { Accept: "text/html" } })).rejects.toBeInstanceOf(FetchError);
    expect(redirect).toHaveBeenCalledTimes(1);
    const large = createFeedHandler(async () => new Response("x", { headers: { "content-length": "1000001" } }));
    expect((await large(new Request(pageUrl("opaque")))).status).toBe(502);
  });

  it("blocks old stored Google URLs while keeping publisher drafts", () => {
    for (const path of ["rss/articles/opaque", "articles/opaque", "read/opaque", "home"])
      expect(() => draft(item(`https://news.google.com/${path}`))).toThrow(/中継URL/);
    expect(draft(item(publisher))).toContain(publisher);
  });

  it("resolves actual collected RSS before storage identity and draft generation", async () => {
    const source: SourceConfig = {
      id: "fixture", name: "Fixture", description: "Fixture", kind: "rss", enabled: true,
      url: "https://example.org/feed",
    };
    const storage = testRepository([source], () => 10_000);
    cleanup.push(storage.close);
    await storage.repo.initialize();
    const data = encode(`<rss><channel><item><title>News</title><link>${article(legacy(publisher))}</link></item></channel></rss>`);
    const app = new Application(storage.repo, new Jev(), new BufferClient(), {
      clock: () => 10_000,
      crawl: {
        beginSource: async () => ({ token: "test", requests: 0 }),
        endSource: async () => undefined,
        nextDue: async () => 0,
        fetch: async () => ({ data, url: source.url, contentType: "application/rss+xml" }),
      },
    });
    await app.start("collect");
    await app.scheduled();
    const articles = await storage.repo.articles();
    expect(articles).toHaveLength(1);
    expect(articles[0]?.url).toBe(publisher);
    expect(draft(articles[0]!)).not.toContain("news.google.com");
    expect((await storage.repo.sources())[0]?.lastWarnings).toEqual([]);
  });
});
