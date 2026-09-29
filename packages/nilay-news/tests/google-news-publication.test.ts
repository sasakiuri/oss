// SPDX-License-Identifier: MIT
// cspell:ignore garturlres Fbv4je wrb
import { afterEach, describe, expect, it, vi } from "vitest";

import { Application } from "../src/application.ts";
import { GoogleNewsDeferred, GoogleNewsResolver } from "../src/google-news.ts";
import { Jev } from "../src/jev.ts";
import { GOOGLE_NEWS_LOCALE, GOOGLE_NEWS_RPC } from "../src/net/google-news.ts";
import { FetchError } from "../src/net/http.ts";
import type { FetchBytes } from "../src/net/types.ts";
import { draft } from "../src/posts.ts";
import { BufferClient, Publisher } from "../src/publishing.ts";
import type { BufferPost, PublishingClient } from "../src/publishing.ts";
import type { SourceConfig } from "../src/sources/types.ts";

import { testRepository } from "./helpers/storage.ts";

const SOURCE: SourceConfig = {
  id: "test", name: "テスト新聞", description: "テスト", kind: "rss",
  enabled: true, url: "https://example.org/feed",
};
const TARGET = "https://example.org/news/story";
const WRAPPER = "https://news.google.com/rss/articles/opaque";
const HOST = "google-news-url:news.google.com";
const encode = (value: string) => new TextEncoder().encode(value);
const page = encode('<div data-n-a-ts="1700000000" data-n-a-sg="test-signature"></div>');
const response = (url = TARGET) => encode(
  ")]}'\n\n123\n" + JSON.stringify([["wrb.fr", "Fbv4je", JSON.stringify(["garturlres", url])]]) + "\n",
);
function legacy(url = TARGET): string {
  const bytes = encode(url);
  const prefix = [8, 19, 34];
  let size = bytes.length;
  while (size >= 128) {
    prefix.push((size & 127) | 128);
    size = Math.floor(size / 128);
  }
  prefix.push(size);
  return "https://news.google.com/rss/articles/" +
    Buffer.from([...prefix, ...bytes, 0xd2, 1, 0]).toString("base64url");
}
function remote(text: string, status: BufferPost["status"] = "sent"): BufferPost {
  return {
    id: "buffer-123", channelId: "channel-123", channelService: "twitter",
    status, text, externalLink: "https://x.com/NilayNews/status/123",
  };
}
const cleanup: (() => void)[] = [];
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0)) close();
});
async function setup(url = legacy()) {
  let now = 10_000;
  const storage = testRepository([SOURCE], () => now);
  cleanup.push(storage.close);
  const { repo } = storage;
  await repo.initialize();
  await repo.ingest(SOURCE, [{
    title: "北海道でクマを捕獲", excerpt: "町内で捕獲", url,
    publishedAt: new Date((now - 60) * 1000).toISOString(),
    metadata: { publisher: "テスト新聞" },
  }]);
  const first = (await repo.articles())[0];
  if (!first) throw new Error("Missing fixture");
  await repo.review(first.id, "saved");
  const client: PublishingClient = {
    channel: "channel-123",
    verifyAccount: vi.fn(async () => undefined),
    post: vi.fn(async (text: string) => remote(text)),
    getPost: vi.fn(async (_id: string, text: string) => remote(text)),
  };
  const buffer = new BufferClient("test-key", client.channel);
  vi.spyOn(buffer, "verifyAccount").mockImplementation(client.verifyAccount);
  vi.spyOn(buffer, "post").mockImplementation(client.post);
  vi.spyOn(buffer, "getPost").mockImplementation(client.getPost);
  const transport = vi.fn<FetchBytes>(async (url) => ({
    url, data: url === GOOGLE_NEWS_RPC ? response() : page, contentType: "text/html",
  }));
  return {
    ...storage, id: first.id, client, buffer, transport,
    clock: () => now,
    advance: (seconds: number) => { now += seconds; },
    enable: async () => { await repo.updateSettings({ autoPost: true }); now += 3600; },
    resolver: () => new GoogleNewsResolver(repo, {
      clock: () => now, transport,
      sleep: async (milliseconds) => { now += milliseconds / 1000; },
    }),
  };
}

describe("publication of stored Google News links", () => {
  it("previews the destination without changing business state, then publishes it under the same ID", async () => {
    const { repo, id, client, buffer, clock, transport, enable } = await setup();
    const app = new Application(repo, new Jev(), buffer, { clock, crawlTransport: transport });
    const before = await repo.exportSnapshot();
    const check = await app.publicationPreflight();
    expect(check.ready).toBe(true);
    expect(check.firstCandidate?.text).toContain(TARGET);
    expect(check.firstCandidate?.text).not.toContain("news.google.com");
    expect(await repo.exportSnapshot()).toEqual(before);
    expect(client.post).not.toHaveBeenCalled();
    await enable();
    await app.publisher.tick();
    expect(client.post).toHaveBeenCalledExactlyOnceWith(check.firstCandidate?.text);
    expect(transport).not.toHaveBeenCalled();
    expect(await repo.article(id)).toMatchObject({
      id, url: TARGET, reviewStatus: "posted", analysisStatus: "pending",
      metadata: { googleNewsUrl: legacy(), publisher: "テスト新聞" },
    });
    expect((await repo.publicationState()).posts).toMatchObject([
      { articleId: id, status: "posted", text: check.firstCandidate?.text },
    ]);
    expect(await repo.ingest(SOURCE, [{ title: "見出し更新", excerpt: "", url: TARGET, publishedAt: new Date(clock() * 1000).toISOString() }])).toBe(0);
    expect(await repo.articles()).toHaveLength(1);
  });

  it("uses the configured transport for an opaque URL and reuses its mapping during posting", async () => {
    vi.useFakeTimers();
    const fixture = await setup(WRAPPER);
    const { repo, buffer, client, transport, clock, advance, enable } = fixture;
    const app = new Application(repo, new Jev(), buffer, { clock, crawlTransport: transport });
    const checkPromise = app.publicationPreflight();
    // The injected clock and timer must advance together for request spacing.
    await vi.advanceTimersByTimeAsync(0);
    advance(3);
    await vi.advanceTimersByTimeAsync(3000);
    const check = await checkPromise;
    expect(check.ready).toBe(true);
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      `${WRAPPER}${GOOGLE_NEWS_LOCALE}`, GOOGLE_NEWS_RPC,
    ]);
    expect(await repo.article(fixture.id)).toMatchObject({ url: WRAPPER });
    await enable();
    await app.publisher.tick();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(client.post).toHaveBeenCalledExactlyOnceWith(check.firstCandidate?.text);
    expect((await app.state()).articles[0]?.postDraft).toContain(TARGET);
  });

  it("resolves opaque URLs during claim preparation without a preflight", async () => {
    const { repo, id, resolver, enable } = await setup(WRAPPER);
    await enable();
    const resolve = resolver();
    const claim = await repo.claimPost(13_600, (url) => resolve.resolve(url));
    expect(claim).toMatchObject({ articleId: id });
    expect(claim?.text).toContain(TARGET);
    expect(await repo.article(id)).toMatchObject({ url: TARGET, reviewStatus: "saved" });
  });

  it("deduplicates a legacy ID and an already collected publisher ID without merging records", async () => {
    const { repo, id, client, clock, enable } = await setup();
    await repo.ingest(SOURCE, [{ title: "同じ記事", excerpt: "", url: TARGET, publishedAt: new Date(9_000_000).toISOString() }]);
    const other = (await repo.articles()).find((article) => article.id !== id);
    if (!other) throw new Error("Missing alias");
    await repo.review(other.id, "saved");
    await enable();
    await new Publisher(repo, client, clock).tick();
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(await repo.articles()).toHaveLength(2);
    expect(await repo.article(other.id)).toMatchObject({ reviewStatus: "saved" });
    expect(await repo.postCandidates()).toEqual([]);
    const exported = await repo.exportSnapshot() as { articles: { _identity: string }[] };
    expect(new Set(exported.articles.map((article) => article._identity)).size).toBe(2);
  });

  it("skips a resolved alias that was already posted, retaining the original post and review", async () => {
    const { repo, id, client, buffer, clock, enable } = await setup();
    await repo.ingest(SOURCE, [{ title: "既存記事", excerpt: "", publishedAt: null, url: TARGET }]);
    const other = (await repo.articles()).find((article) => article.id !== id);
    if (!other) throw new Error("Missing alias");
    await repo.review(other.id, "posted");
    const check = await new Application(repo, new Jev(), buffer, { clock }).publicationPreflight();
    expect(check.ready).toBe(false);
    expect(check.blockers.join()).toContain("同じ元記事URL");
    await enable();
    await new Publisher(repo, client, clock).tick();
    expect(client.post).not.toHaveBeenCalled();
    expect(await repo.article(id)).toMatchObject({ url: TARGET, reviewStatus: "saved" });
    expect((await repo.settings()).autoPost).toBe(true);
    expect((await repo.publicationState()).posts).toEqual([]);
    expect(await repo.postCandidates()).toEqual([]);
  });

  it("preserves explicitly distinct source-key notices on a shared publisher URL", async () => {
    const { repo, id, client, clock, enable } = await setup();
    await repo.review(id, "dismissed");
    await repo.ingest(SOURCE, ["one", "two"].map((sourceKey) => ({
      title: `記事 ${sourceKey}`, excerpt: "", url: legacy(), sourceKey,
      publishedAt: new Date(9_000_000).toISOString(),
    })));
    for (const article of await repo.articles()) {
      if (article.sourceKey) await repo.review(article.id, "saved");
    }
    await enable();
    await new Publisher(repo, client, clock).tick();
    expect(client.post).toHaveBeenCalledTimes(2);
    expect((await repo.publicationState()).posts.map((post) =>
      new URL(post.text.match(/https?:\/\/\S+/)?.[0] ?? "").href,
    )).toEqual([TARGET, TARGET]);
  });

  it.each(["dismiss", "disable"])("rechecks a concurrent %s while resolving without stale writes", async (change) => {
    const { repo, id, enable } = await setup(WRAPPER);
    await enable();
    const resolve = vi.fn(async () => {
      if (change === "dismiss") await repo.review(id, "dismissed");
      else await repo.updateSettings({ autoPost: false });
      return TARGET;
    });
    expect(await repo.claimPost(13_600, resolve)).toBeNull();
    expect(await repo.article(id)).toMatchObject({ url: WRAPPER });
    expect((await repo.publicationState()).posts).toEqual([]);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("reserves only once when two invocations resolve the same article concurrently", async () => {
    const { repo, enable } = await setup(WRAPPER);
    await enable();
    const claims = await Promise.all([
      repo.claimPost(13_600, async () => TARGET),
      repo.claimPost(13_600, async () => TARGET),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect((await repo.publicationState()).posts).toHaveLength(1);
  });

  it("does not send after URL resolution crosses the posting window", async () => {
    const { repo, client, clock, advance, enable } = await setup(WRAPPER);
    await enable();
    advance(50_399 - clock()); // 22:59:59 JST
    const claim = await repo.claimPost(clock(), async () => { advance(2); return TARGET; });
    expect(claim).toBeNull();
    await new Publisher(repo, client, clock).tick();
    expect(client.post).not.toHaveBeenCalled();
    expect((await repo.publicationState()).posts).toEqual([]);
  });

  it("withdraws an unsent claim if its publisher alias is marked posted during account verification", async () => {
    const { repo, id, client, clock, enable } = await setup();
    await repo.ingest(SOURCE, [{ title: "別ID", excerpt: "", publishedAt: null, url: TARGET }]);
    const other = (await repo.articles()).find((article) => article.id !== id);
    if (!other) throw new Error("Missing alias");
    vi.mocked(client.verifyAccount).mockImplementation(async () => { await repo.review(other.id, "posted"); });
    await enable();
    await new Publisher(repo, client, clock).tick();
    expect(client.post).not.toHaveBeenCalled();
    expect((await repo.publicationState()).posts).toEqual([]);
    expect((await repo.settings()).autoPost).toBe(true);
  });

  it.each(["http://127.0.0.1/private", WRAPPER, "https://user:pass@example.org/a"])("refuses unsafe resolver results: %s", async (url) => {
    const { repo, id, enable } = await setup(WRAPPER);
    await enable();
    expect(await repo.claimPost(13_600, async () => url)).toBeNull();
    expect(await repo.article(id)).toMatchObject({ url: WRAPPER });
    expect((await repo.publicationState()).posts).toMatchObject([{ status: "failed", text: "" }]);
    expect((await repo.settings()).autoPost).toBe(false);
  });

  it("leaves temporary decoding waits retryable without a failed post or an extended cooldown", async () => {
    const { repo, id, enable, resolver, transport, advance } = await setup(WRAPPER);
    await enable();
    await repo.putRecord("crawl_host", "news.google.com", { blocked_until: 20_000 });
    const resolve = resolver();
    expect(await repo.claimPost(13_600, (url) => resolve.resolve(url))).toBeNull();
    expect((await repo.settings()).autoPost).toBe(true);
    expect((await repo.publicationState()).posts).toEqual([]);
    expect(await repo.getRecord("google_news_url", "opaque")).toBeNull();
    expect(transport).not.toHaveBeenCalled();
    advance(6401);
    const retry = resolver();
    expect(await repo.claimPost(20_001, (url) => retry.resolve(url))).toMatchObject({ articleId: id });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("does not disable posting when the decoding lease is held elsewhere", async () => {
    const { repo, enable, resolver, clock, transport } = await setup(WRAPPER);
    await enable();
    await repo.acquireHost(HOST, clock(), 120);
    const resolve = resolver();
    await expect(resolve.resolve(WRAPPER)).rejects.toBeInstanceOf(GoogleNewsDeferred);
    expect(await repo.claimPost(clock(), (url) => resolve.resolve(url))).toBeNull();
    expect((await repo.settings()).autoPost).toBe(true);
    expect((await repo.publicationState()).posts).toEqual([]);
    expect(transport).not.toHaveBeenCalled();
  });

  it("does not hide storage errors or convert them into a publication failure", async () => {
    const { repo, enable } = await setup(WRAPPER);
    await enable();
    const failure = new Error("storage unavailable");
    await expect(repo.claimPost(13_600, async () => { throw failure; })).rejects.toBe(failure);
    expect((await repo.publicationState()).posts).toEqual([]);
    expect((await repo.settings()).autoPost).toBe(true);
  });

  it("reports a Google network failure without sending or using the wrapper as fallback", async () => {
    const { repo, client, clock, transport, enable } = await setup(WRAPPER);
    transport.mockRejectedValue(new FetchError("remote details", 503));
    await enable();
    await new Publisher(repo, client, clock, undefined, transport).tick();
    expect(client.post).not.toHaveBeenCalled();
    expect((await repo.publicationState()).posts).toMatchObject([{ status: "failed", text: "" }]);
    expect((await repo.publicationState()).posts[0]?.error).not.toContain("remote details");
  });

  it("retains old failed records until explicitly reconciled, then resolves instead of requiring recollection", async () => {
    const { repo, client, clock, enable } = await setup();
    await enable();
    // The previous release's repository path failed the synchronous draft.
    expect(await repo.claimPost(clock())).toBeNull();
    const before = await repo.publicationState();
    await new Publisher(repo, client, clock).tick();
    expect(await repo.publicationState()).toEqual(before);
    expect(client.post).not.toHaveBeenCalled();
    await repo.resolvePost(before.posts[0]?.articleId ?? "", "not_posted");
    await enable();
    await new Publisher(repo, client, clock).tick();
    expect(client.post).toHaveBeenCalledTimes(1);
    expect((await repo.publicationState()).posts[0]?.text).toContain(TARGET);
  });

  it("confirms submitted posts using their original text, without decoding or sending again", async () => {
    const { repo, id, client, clock, advance, enable, transport, driver } = await setup(TARGET);
    await enable();
    const claim = await repo.claimPost(clock());
    if (!claim) throw new Error("Missing claim");
    await repo.submitPost(id, "buffer-123", client.channel, clock(), claim.claimToken);
    // Model historical data: the record submitted to Buffer is authoritative.
    const article = await repo.article(id);
    driver.db.prepare("UPDATE news_articles SET data=? WHERE id=?").run(JSON.stringify({ ...article, url: WRAPPER, _identity: WRAPPER }), id);
    advance(121);
    await new Publisher(repo, client, clock, undefined, transport).tick();
    expect(client.getPost).toHaveBeenCalledExactlyOnceWith("buffer-123", claim.text, client.channel);
    expect(client.post).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect((await repo.publicationState()).posts[0]?.text).toBe(claim.text);
    expect(await repo.article(id)).toMatchObject({ url: WRAPPER, reviewStatus: "posted" });
  });

  it("rejects a preflight whose business state changed during decoding", async () => {
    const { repo, id, buffer, clock } = await setup(WRAPPER);
    const resolve = vi.spyOn(GoogleNewsResolver.prototype, "resolve").mockImplementation(async () => {
      await repo.review(id, "dismissed");
      return TARGET;
    });
    await expect(new Application(repo, new Jev(), buffer, { clock }).publicationPreflight()).rejects.toThrow(/確認中に記事や設定/);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(await repo.article(id)).toMatchObject({ url: WRAPPER, reviewStatus: "dismissed" });
  });

  it("keeps the synchronous guard and avoids decoding ordinary state reads", async () => {
    const { repo, buffer, clock, transport } = await setup();
    const state = await new Application(repo, new Jev(), buffer, { clock, crawlTransport: transport }).state();
    expect(state.articles[0]?.postDraft).toBeNull();
    expect(transport).not.toHaveBeenCalled();
    expect(() => draft({ title: "見出し", url: WRAPPER })).toThrow(/中継URL/);
  });
});
