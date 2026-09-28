// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { Application } from "../src/application.ts";
import { CachedFetch, CrawlDeferred } from "../src/crawl.ts";
import type { Job } from "../src/domain.ts";
import { UserError } from "../src/errors.ts";
import { Jev } from "../src/jev.ts";
import { FetchError } from "../src/net/http.ts";
import type { FetchBytes } from "../src/net/types.ts";
import type { Notifier } from "../src/notifications.ts";
import { draft } from "../src/posts.ts";
import { BufferClient, PostError } from "../src/publishing.ts";
import type { SourceConfig } from "../src/sources/types.ts";
import type { SQLStatement } from "../src/storage/repository.ts";
import { utf8 } from "../src/text.ts";
import { isoSeconds } from "../src/time.ts";

import { testRepository } from "./helpers/storage.ts";

const source: SourceConfig = {
  id: "one",
  name: "Source",
  description: "Fixture",
  url: "https://example.org/feed",
  kind: "rss",
  enabled: true,
};
/** Every setup starts at `now = 10_000` (epoch seconds). */
const START = 10_000;
/** A zoned publication time `seconds` after the start clock. */
function published(seconds: number): string {
  return new Date((START + seconds) * 1000).toISOString();
}
const item = {
  title: "クマの出没と対策",
  url: "https://example.org/a",
  excerpt: "市が対策を発表",
  // Fresh for the first 23 hours of a test.
  publishedAt: published(-3600) as string | null,
};
/** A fresh publication time ordered like the day-of-month `day` ("01"–"31"). */
function dayTime(day: string): string {
  return published(-3600 + (Number(day) - 31) * 60);
}
const cleanup: (() => void)[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const close of cleanup.splice(0)) close();
});
function notices() {
  return {
    configured: true,
    report: vi.fn<(key: string, ...text: string[]) => Promise<boolean>>(
      async () => true,
    ),
    recover: vi.fn<(key: string, title: string) => Promise<boolean>>(
      async () => true,
    ),
  };
}
async function setup(
  sources = [source],
  options: {
    jev?: Jev;
    notifier?: ReturnType<typeof notices>;
    maxAnalysisItemsPerTick?: number;
  } = {},
) {
  let now = 10_000;
  const storage = testRepository(sources, () => now);
  cleanup.push(storage.close);
  await storage.repo.initialize();
  const collector = vi.fn(async () => ({
    items: [item],
    warnings: [] as string[],
    notes: [] as string[],
  }));
  const crawl = {
    beginSource: vi.fn(async () => ({ token: "attempt", requests: 0 })),
    endSource: vi.fn(async () => {}),
    nextDue: vi.fn(async () => 0),
    fetch: vi.fn(async () => {
      throw new Error("Unexpected network");
    }),
  };
  const app = new Application(
    storage.repo,
    options.jev ?? new Jev(),
    new BufferClient(),
    {
      clock: () => now,
      collector,
      crawl,
      notifier: options.notifier as unknown as Notifier | undefined,
      maxAnalysisItemsPerTick: options.maxAnalysisItemsPerTick,
    },
  );
  return {
    ...storage,
    app,
    collector,
    crawl,
    advance: (seconds: number) => {
      now += seconds;
    },
    now: () => now,
  };
}
async function analyzeSetup(
  count: number,
  options: { maxAnalysisItemsPerTick?: number } = {},
) {
  const jev = new Jev("test-key");
  const analyze = vi.spyOn(jev, "analyze").mockResolvedValue({
    analysisStatus: "done",
    decision: "candidate",
  });
  const context = await setup([source], { jev, ...options });
  await context.repo.ingest(
    source,
    // A later index is published earlier, so newest first is index order.
    Array.from({ length: count }, (_, index) => ({
      ...item,
      url: `${item.url}/${index}`,
      publishedAt: published(-3600 - index),
    })),
  );
  return { ...context, analyze };
}

describe("durable application jobs", () => {
  it("processes one source per invocation and resumes saved progress", async () => {
    const { app, repo, collector } = await setup([
      source,
      { ...source, id: "two" },
    ]);
    await app.start("collect");
    await app.scheduled();
    expect(collector).toHaveBeenCalledTimes(1);
    expect(await repo.getJob()).toMatchObject({
      running: true,
      progress: 1,
      total: 2,
    });
    await app.scheduled();
    expect(collector).toHaveBeenCalledTimes(2);
    expect(await repo.getJob()).toMatchObject({ running: false, progress: 2 });
    expect((await repo.articles())[0]?.analysisStatus).toBe("pending");
  });
  it("rejects concurrent manual jobs without overwriting progress", async () => {
    const { app, repo } = await setup();
    const results = await Promise.allSettled([
      app.start("collect"),
      app.start("collect"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect((await repo.getJob()).running).toBe(true);
  });
  it("retains partial results and makes individual failures visible", async () => {
    const { app, repo, collector } = await setup([
      source,
      { ...source, id: "two" },
    ]);
    collector.mockRejectedValueOnce(new UserError("取得失敗"));
    await app.start("collect");
    await app.scheduled();
    await app.scheduled();
    expect(await repo.articles()).toHaveLength(1);
    expect((await repo.sources())[0]?.lastError).toBe("取得失敗");
    expect(await repo.getJob()).toMatchObject({
      running: false,
      failed: 1,
      phase: "一部未完了",
    });
  });
  it("obeys the configured automatic collection interval", async () => {
    const { app, repo, collector, advance } = await setup();
    await repo.updateSettings({ autoCollect: true, pollMinutes: 15 });
    await app.scheduled();
    await app.scheduled();
    expect(collector).toHaveBeenCalledTimes(1);
    advance(900);
    await app.scheduled();
    expect(collector).toHaveBeenCalledTimes(2);
  });
  it("does not enable paid classification or posting without credentials", async () => {
    const { app, repo } = await setup();
    await expect(app.start("analyze")).rejects.toThrow(/API キー/);
    await expect(app.settings({ autoPost: true })).rejects.toThrow(/Buffer/);
    expect((await repo.settings()).autoPost).toBe(false);
  });
  it("keeps manual review and coverage notes after collection", async () => {
    const { app, repo, collector } = await setup();
    await repo.ingest(source, [item]);
    const article = (await repo.articles())[0]!;
    await repo.review(article.id, "saved");
    collector.mockResolvedValueOnce({
      items: [item],
      warnings: ["一覧のみ"],
      notes: ["一覧のみ"],
    });
    await app.start("collect");
    await app.scheduled();
    expect((await repo.article(article.id)).reviewStatus).toBe("saved");
    expect(await repo.getJob()).toMatchObject({ error: null, limited: 1 });
    expect((await repo.sources())[0]?.lastWarnings).toEqual(["一覧のみ"]);
  });
  it("stops a pending analysis after a rubric change without another paid call", async () => {
    // The rubric changes between two scheduler invocations.
    const { app, repo, analyze } = await analyzeSetup(2, {
      maxAnalysisItemsPerTick: 1,
    });
    await app.start("analyze");
    await app.scheduled();
    await app.settings({
      rubric: "射撃競技に関係するニュースだけを候補にする",
    });
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(await repo.getJob()).toMatchObject({
      running: false,
      progress: 1,
      error: expect.stringContaining("選定基準"),
    });
    expect(
      (await repo.articles()).every(
        (article) => article.analysisStatus === "pending",
      ),
    ).toBe(true);
  });
  it("stops analysis when the result can no longer be stored", async () => {
    const { app, repo, analyze } = await analyzeSetup(2);
    vi.spyOn(repo, "analyzeResult").mockResolvedValueOnce(false);
    await app.start("analyze");
    await app.scheduled();
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(await repo.getJob()).toMatchObject({
      running: false,
      error: expect.stringContaining("記事が変更された"),
    });
  });
  it("stops analysis after three Jev failures", async () => {
    const { app, repo, analyze } = await analyzeSetup(4);
    analyze.mockRejectedValue(new Error("upstream"));
    await app.start("analyze");
    for (let run = 0; run < 4; run += 1) await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(3);
    expect(await repo.getJob()).toMatchObject({
      running: false,
      progress: 3,
      failed: 3,
      phase: "一部未完了",
    });
    expect(
      (await repo.articles()).filter(
        (article) => article.analysisStatus === "error",
      ),
    ).toHaveLength(3);
  });
  it("reports crawl failures with a curated summary and then recovery", async () => {
    const notifier = notices();
    const { app, collector } = await setup([source], { notifier });
    collector.mockRejectedValueOnce(new Error("private upstream body"));
    await app.start("collect");
    await app.scheduled();
    const crawlReports = notifier.report.mock.calls.filter(
      ([key]) => key === "crawl:one",
    );
    expect(crawlReports).toHaveLength(1);
    expect(JSON.stringify(crawlReports)).not.toContain("private upstream body");
    expect(notifier.recover).not.toHaveBeenCalledWith(
      "crawl:one",
      expect.anything(),
    );
    await app.start("collect");
    await app.scheduled();
    expect(notifier.recover).toHaveBeenCalledWith(
      "crawl:one",
      "Sourceの収集が復旧しました",
    );
  });
  it("reports one host failure once and waits out its cooldown for other feeds", async () => {
    // A real epoch, as a feed without history restores its interval from 0.
    let now = Date.UTC(2026, 8, 28) / 1000;
    const feeds: SourceConfig[] = ["one", "two"].map((id) => ({
      ...source,
      id,
      url: `https://example.org/${id}`,
      minCollectionMinutes: 240,
    }));
    const storage = testRepository(feeds, () => now);
    cleanup.push(storage.close);
    const repo = storage.repo;
    await repo.initialize();
    let failing = true;
    const transport = vi.fn<FetchBytes>(async (url) => {
      if (url.endsWith("/robots.txt"))
        return {
          data: utf8("User-agent: *\n"),
          url,
          contentType: "text/plain",
        };
      if (failing) throw new FetchError("private upstream body", 503);
      return { data: utf8("ok"), url, contentType: "application/xml" };
    });
    const notifier = notices();
    const app = new Application(repo, new Jev(), new BufferClient(), {
      clock: () => now,
      collector: async (feed, fetch) => {
        await fetch(feed.url);
        return { items: [], warnings: [], notes: [] };
      },
      crawl: new CachedFetch(repo, feeds, {
        clock: () => now,
        transport,
        sleep: async (seconds) => {
          now += seconds;
        },
      }),
      notifier: notifier as unknown as Notifier,
    });
    const crawlCalls = (calls: [string, ...unknown[]][], id: string) =>
      calls.filter(([key]) => key === `crawl:${id}`);
    const run = async () => {
      await app.start("collect");
      await app.scheduled();
      await app.scheduled();
    };

    await run();
    const failedAt = now;
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      "https://example.org/robots.txt",
      "https://example.org/one",
    ]);
    const reports = crawlCalls(notifier.report.mock.calls, "one");
    expect(reports).toHaveLength(1);
    expect(reports[0]?.[2]).toContain("HTTP 503");
    expect(JSON.stringify(notifier.report.mock.calls)).not.toContain(
      "private upstream body",
    );
    expect(crawlCalls(notifier.report.mock.calls, "two")).toHaveLength(0);
    expect(crawlCalls(notifier.recover.mock.calls, "two")).toHaveLength(0);
    expect(await repo.getJob()).toMatchObject({ failed: 1, deferred: 1 });
    const [first, two] = await repo.sources();
    expect(first?.lastError).toBeTruthy();
    expect(two).toMatchObject({
      lastError: null,
      nextFetchAt: isoSeconds(failedAt + 900),
    });
    expect(two?.lastDeferred).toContain("待機");

    // Still cooling down: no request, no new report, no false recovery.
    now = failedAt + 600;
    await run();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(notifier.report).toHaveBeenCalledTimes(1);
    expect(notifier.recover).not.toHaveBeenCalledWith(
      expect.stringMatching(/^crawl:/),
      expect.anything(),
    );
    expect(await repo.getJob()).toMatchObject({ failed: 0, deferred: 2 });
    let [one] = await repo.sources();
    expect(one?.lastError).toBe(first?.lastError);

    // After the cooldown the deferred feed is due; the failed one still
    // waits out its own interval, which its real request consumed.
    failing = false;
    now = failedAt + 900;
    await run();
    expect(transport.mock.calls.map(([url]) => url).slice(2)).toEqual([
      "https://example.org/two",
    ]);
    expect((await repo.sources())[1]?.nextFetchAt).toBeNull();
    expect(notifier.recover).not.toHaveBeenCalledWith(
      "crawl:one",
      expect.anything(),
    );

    // Only a real successful fetch recovers the failed source.
    now = failedAt + 14400;
    await run();
    expect(transport).toHaveBeenCalledTimes(4);
    expect(notifier.recover).toHaveBeenCalledWith(
      "crawl:one",
      "Sourceの収集が復旧しました",
    );
    [one] = await repo.sources();
    expect(one?.lastError).toBeNull();
  });
  it("records deferred sources and continues with the next source", async () => {
    const { app, repo, collector, crawl, now } = await setup([
      source,
      { ...source, id: "two" },
    ]);
    const until = now() + 120;
    crawl.beginSource.mockRejectedValueOnce(new CrawlDeferred(until));
    await app.start("collect");
    await app.scheduled();
    const deferred = (await repo.sources()).find((item) => item.id === "one");
    expect(deferred).toMatchObject({ nextFetchAt: isoSeconds(until) });
    expect(deferred?.lastDeferred).toContain("待機");
    expect(await repo.getJob()).toMatchObject({
      running: true,
      progress: 1,
      failed: 0,
      deferred: 1,
    });
    await app.scheduled();
    expect(collector).toHaveBeenCalledTimes(1);
    expect(await repo.getJob()).toMatchObject({
      running: false,
      error: null,
      warning: expect.stringContaining("延期"),
    });
  });
  describe("rolling feeds on one host with the production intervals", () => {
    const HOUR = 3600;
    const ORIGIN = "https://example.org";
    /** A real epoch: a claim without history restores 0, not a recent time. */
    const BASE = Date.UTC(2026, 8, 28) / 1000;

    /**
     * Four-hour feeds with 30-minute host spacing, collected by hourly polls
     * through the real CachedFetch. Returns feed requests as `[id, offset]`.
     */
    async function feeds(ids: string[], robotsSeconds?: number) {
      let now = BASE;
      const configs: SourceConfig[] = ids.map((id) => ({
        ...source,
        id,
        name: id,
        url: `${ORIGIN}/${id}`,
        minCollectionMinutes: 240,
        minRequestIntervalSeconds: 1800,
      }));
      const storage = testRepository(configs, () => now);
      cleanup.push(storage.close);
      const repo = storage.repo;
      await repo.initialize();
      if (robotsSeconds !== undefined)
        await repo.putRecord(
          "crawl_robots",
          ORIGIN,
          { rules: "User-agent: *\n" },
          { expiresAt: BASE + robotsSeconds },
        );
      const failures = new Map<string, FetchError>();
      const requests: [string, number][] = [];
      const transport = vi.fn<FetchBytes>(async (url) => {
        requests.push([url.slice(ORIGIN.length + 1), now - BASE]);
        const failure = failures.get(url);
        failures.delete(url);
        if (failure) throw failure;
        if (url.endsWith("/robots.txt"))
          return {
            data: utf8("User-agent: *\n"),
            url,
            contentType: "text/plain",
          };
        return { data: utf8("ok"), url, contentType: "application/xml" };
      });
      const app = new Application(repo, new Jev(), new BufferClient(), {
        clock: () => now,
        collector: async (feed, fetch) => {
          await fetch(feed.url);
          return { items: [], warnings: [], notes: [] };
        },
        crawl: new CachedFetch(repo, configs, {
          clock: () => now,
          transport,
          maxRequests: 1000,
          sleep: async (seconds) => {
            now += seconds;
          },
        }),
      });
      /** One hourly poll at `hours` after the start, run to completion. */
      const poll = async (hours: number) => {
        now = BASE + hours * HOUR;
        await app.start("collect");
        for (const _ of ids) await app.scheduled();
        expect((await repo.getJob()).running).toBe(false);
      };
      const feedRequests = () => requests.filter(([id]) => id !== "robots.txt");
      const sourceOf = async (id: string) =>
        (await repo.sources()).find((item) => item.id === id);
      return { repo, poll, requests, feedRequests, failures, sourceOf };
    }

    /** No feed is requested within four hours or the host within 30 minutes. */
    function polite(requests: [string, number][]) {
      requests.forEach(([id, at], index) => {
        if (index)
          expect(at - requests[index - 1]![1]).toBeGreaterThanOrEqual(1800);
        const previous = requests
          .slice(0, index)
          .filter(([other]) => other === id)
          .at(-1);
        if (previous && id !== "robots.txt")
          expect(at - previous[1]).toBeGreaterThanOrEqual(4 * HOUR);
      });
    }

    it("recovers every deferred feed at the next hourly poll after host spacing", async () => {
      const { poll, requests, sourceOf } = await feeds(["one", "two", "three"]);
      await poll(0);
      // robots.txt takes the host slot: nothing is lost but 30 minutes.
      expect(requests).toEqual([["robots.txt", 0]]);
      expect((await sourceOf("one"))?.nextFetchAt).toBe(
        isoSeconds(BASE + 1800),
      );
      await poll(1);
      // Due when the host slot frees, collected by the next poll.
      expect((await sourceOf("two"))?.nextFetchAt).toBe(
        isoSeconds(BASE + HOUR + 1800),
      );
      await poll(2);
      // A success clears the stale time.
      expect((await sourceOf("two"))?.nextFetchAt).toBeNull();
      for (let hour = 3; hour <= 9; hour += 1) await poll(hour);
      expect(requests).toEqual([
        ["robots.txt", 0],
        ["one", HOUR],
        ["two", 2 * HOUR],
        ["three", 3 * HOUR],
        ["one", 5 * HOUR],
        ["two", 6 * HOUR],
        ["three", 7 * HOUR],
        ["one", 9 * HOUR],
      ]);
      polite(requests);
      // A later deferral shows the source interval, not only the host's.
      expect((await sourceOf("two"))?.nextFetchAt).toBe(
        isoSeconds(BASE + 10 * HOUR),
      );
    });

    it("keeps a Retry-After of two hours for the other feed without requests", async () => {
      const { poll, feedRequests, failures, sourceOf } = await feeds(
        ["one", "two"],
        10 * 86400,
      );
      failures.set(`${ORIGIN}/one`, new FetchError("unavailable", 503, 7200));
      await poll(0);
      expect(feedRequests()).toEqual([["one", 0]]);
      expect(await sourceOf("two")).toMatchObject({
        lastError: null,
        nextFetchAt: isoSeconds(BASE + 7200),
      });
      await poll(1);
      expect(feedRequests()).toHaveLength(1);
      await poll(2);
      expect((await sourceOf("two"))?.nextFetchAt).toBeNull();
      await poll(3);
      // The failed request consumed its own four hours.
      expect(feedRequests()).toEqual([
        ["one", 0],
        ["two", 2 * HOUR],
      ]);
      await poll(4);
      expect(feedRequests().at(-1)).toEqual(["one", 4 * HOUR]);
      expect((await sourceOf("one"))?.lastError).toBeNull();
      polite(feedRequests());
    });

    it("fetches the feed at the next poll after refreshing an expired robots.txt", async () => {
      const { poll, requests } = await feeds(["one"], 4 * HOUR);
      await poll(0);
      await poll(4);
      await poll(5);
      await poll(8);
      expect(requests).toEqual([
        ["one", 0],
        ["robots.txt", 4 * HOUR],
        ["one", 5 * HOUR],
      ]);
      await poll(9);
      expect(requests.at(-1)).toEqual(["one", 9 * HOUR]);
      polite(requests);
    });

    it("sends nothing during a 24-hour 403 block and then resumes one feed per poll", async () => {
      const { poll, feedRequests, failures } = await feeds(
        ["one", "two", "three"],
        10 * 86400,
      );
      failures.set(`${ORIGIN}/one`, new FetchError("forbidden", 403));
      await poll(0);
      for (let hour = 1; hour < 24; hour += 1) await poll(hour);
      expect(feedRequests()).toEqual([["one", 0]]);
      for (let hour = 24; hour <= 26; hour += 1) await poll(hour);
      expect(feedRequests()).toEqual([
        ["one", 0],
        ["one", 24 * HOUR],
        ["two", 25 * HOUR],
        ["three", 26 * HOUR],
      ]);
      polite(feedRequests());
    });
  });
  it("notifies an expired publication claim even without a Buffer key", async () => {
    const notifier = notices();
    const { app, repo, advance, now } = await setup([source], { notifier });
    await repo.ingest(source, [item]);
    await repo.review((await repo.articles())[0]!.id, "saved");
    await repo.updateSettings({ autoPost: true });
    advance(3601);
    expect(await repo.claimPost(now())).not.toBeNull();
    advance(601);
    await app.scheduled();
    expect((await repo.publicationState()).posts[0]?.status).toBe("unknown");
    expect(notifier.report).toHaveBeenCalledWith(
      "publication",
      expect.any(String),
      expect.any(String),
    );
  });
});

async function autoSetup(
  days: string[],
  options: {
    notifier?: ReturnType<typeof notices>;
    key?: string;
    maxAnalysisItemsPerTick?: number;
  } = {},
) {
  const jev = new Jev(options.key ?? "test-key");
  const analyze = vi.spyOn(jev, "analyze").mockResolvedValue({
    analysisStatus: "done",
    decision: "candidate",
  });
  const context = await setup([source], {
    jev,
    notifier: options.notifier,
    maxAnalysisItemsPerTick: options.maxAnalysisItemsPerTick,
  });
  const items = days.map((day, index) => ({
    ...item,
    url: `${item.url}/${index}`,
    publishedAt: dayTime(day),
  }));
  await context.repo.ingest(source, items);
  const byUrl = new Map(
    (await context.repo.articles()).map((article) => [article.url, article.id]),
  );
  const ids = items.map((value) => byUrl.get(value.url)!);
  const analyzed = () =>
    analyze.mock.calls.map(([article]) => ids.indexOf(article.id));
  return { ...context, analyze, ids, analyzed };
}

describe("source-rule candidates", () => {
  it("derives the flag from stored source IDs without calling Jev", async () => {
    const jev = new Jev("test-key");
    const analyze = vi.spyOn(jev, "analyze");
    const { app, repo } = await setup([source], { jev });
    // An imported flag is ignored: only the stored source IDs count.
    const scratch = testRepository([source], () => 10_000);
    cleanup.push(scratch.close);
    await scratch.repo.initialize();
    await scratch.repo.ingest(source, [item]);
    const snapshot = JSON.parse(
      JSON.stringify(await scratch.repo.exportSnapshot()),
    ) as { articles: Record<string, unknown>[] };
    for (const article of snapshot.articles) article.sourceCandidate = true;
    await repo.importSnapshot(snapshot);
    expect((await repo.articles())[0]).toMatchObject({ sourceCandidate: true });
    for (const id of ["riflesports-news", "clay-shooting-news", "gibier-news"])
      await repo.ingest({ ...source, id }, [
        { ...item, url: `https://example.org/${id}` },
      ]);
    await repo.updateSettings({ postSelection: "candidates" });
    const state = await app.state();
    expect(
      state.articles
        .map((article) => [
          article.url,
          article.sourceCandidate,
          article.analysisStatus,
        ])
        .sort(),
    ).toEqual([
      ["https://example.org/a", false, "pending"],
      ["https://example.org/clay-shooting-news", true, "pending"],
      ["https://example.org/gibier-news", true, "pending"],
      ["https://example.org/riflesports-news", true, "pending"],
    ]);
    expect(state.publication.queued).toBe(3);
    expect(state.settings.autoPost).toBe(false);
    expect(analyze).not.toHaveBeenCalled();
  });
});

describe("automatic classification", () => {
  it("is disabled by default and sends nothing", async () => {
    const { app, repo, analyze } = await autoSetup(["01", "02"]);
    expect((await app.state()).settings).toMatchObject({
      autoCollect: false,
      autoAnalyze: false,
      autoPost: false,
      autoAnalyzePausedUntil: null,
    });
    const version = await repo.stateVersion();
    for (let run = 0; run < 3; run += 1) await app.scheduled();
    expect(analyze).not.toHaveBeenCalled();
    expect(await repo.getJob()).toMatchObject({ running: false, kind: null });
    expect(await repo.stateVersion()).toBe(version);
  });

  it("classifies collected articles on later ticks without touching review", async () => {
    const jev = new Jev("test-key");
    const analyze = vi.spyOn(jev, "analyze").mockResolvedValue({
      analysisStatus: "done",
      decision: "candidate",
    });
    const { app, repo, collector } = await setup([source], { jev });
    await app.settings({ autoCollect: true, autoAnalyze: true });
    await app.scheduled();
    expect(collector).toHaveBeenCalledTimes(1);
    expect(analyze).not.toHaveBeenCalled();
    expect(await repo.getJob()).toMatchObject({
      running: false,
      kind: "collect",
    });
    const article = (await repo.articles())[0]!;
    await repo.review(article.id, "saved");
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(await repo.getJob()).toMatchObject({
      running: false,
      kind: "analyze",
      articleIds: [article.id],
      error: null,
    });
    expect(await repo.article(article.id)).toMatchObject({
      analysisStatus: "done",
      decision: "candidate",
      reviewStatus: "saved",
    });
    const version = await repo.stateVersion();
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(await repo.stateVersion()).toBe(version);
  });

  it("sends only pending articles, newest first, in bounded batches", async () => {
    const days = Array.from({ length: 28 }, (_, index) =>
      String(28 - index).padStart(2, "0"),
    );
    const { app, repo, ids, analyzed } = await autoSetup(days);
    const rubric = (await repo.settings()).rubric;
    for (const [index, analysisStatus] of [
      [27, "done"],
      [26, "error"],
    ] as const) {
      const article = await repo.article(ids[index]!);
      await repo.analyzeResult(
        article.id,
        await repo.evidenceHash(article),
        rubric,
        { analysisStatus },
      );
    }
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 20 });
    await app.scheduled();
    const job = await repo.getJob();
    // Index 0 is the newest; the oldest two were already classified or failed.
    const expected = ids.slice(0, 20);
    expect(job).toMatchObject({ kind: "analyze", total: 20 });
    expect(job.articleIds).toEqual(expected);
    for (let run = 0; run < 25; run += 1) await app.scheduled();
    expect(analyzed()).toEqual(
      [...expected, ...ids.slice(20, 26)].map((id) => ids.indexOf(id)),
    );
    expect(analyzed()).not.toContain(26);
    expect(analyzed()).not.toContain(27);
    expect((await repo.article(ids[26]!)).analysisStatus).toBe("error");
  });

  it("limits a batch to 100 articles", async () => {
    const { app, repo, analyze } = await autoSetup(
      Array.from({ length: 101 }, () => "01"),
    );
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 1440 });
    await app.scheduled();
    expect(await repo.getJob()).toMatchObject({
      running: true,
      token: null,
      total: 100,
      progress: 10,
    });
    expect((await repo.getJob()).articleIds).toHaveLength(100);
    expect(analyze).toHaveBeenCalledTimes(10);
  });

  it("runs due collection first and never replaces a running job", async () => {
    // A running batch must span invocations, so each invocation takes one item.
    const { app, repo, collector, analyze, advance } = await autoSetup(
      ["01", "02", "03"],
      { maxAnalysisItemsPerTick: 1 },
    );
    await repo.updateSettings({
      autoCollect: true,
      autoAnalyze: true,
      pollMinutes: 15,
    });
    await app.scheduled();
    expect(collector).toHaveBeenCalledTimes(1);
    expect(analyze).not.toHaveBeenCalled();
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(await repo.getJob()).toMatchObject({
      running: true,
      kind: "analyze",
    });
    // The collected item is a fourth pending article.
    expect((await repo.getJob()).total).toBe(4);
    advance(900);
    // Collection is due, but the started batch keeps its progress.
    for (let run = 0; run < 3; run += 1) await app.scheduled();
    expect(collector).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledTimes(4);
    expect(await repo.getJob()).toMatchObject({
      running: false,
      kind: "analyze",
    });
    await app.scheduled();
    expect(collector).toHaveBeenCalledTimes(2);
    const manual = await app.start("collect");
    await repo.updateSettings({ autoCollect: false });
    advance(900);
    await app.scheduled();
    expect(await repo.getJob()).toMatchObject({
      id: manual.id,
      kind: "collect",
    });
  });

  it("pauses one interval after failures and never retries failed articles", async () => {
    const notifier = notices();
    // Newest first, so index order.
    const { app, repo, analyze, advance, ids, analyzed, now } = await autoSetup(
      ["05", "04", "03", "02", "01"],
      { notifier },
    );
    analyze.mockRejectedValue(new Error("upstream"));
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 15 });
    for (let run = 0; run < 3; run += 1) await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(3);
    expect(await repo.getJob()).toMatchObject({
      running: false,
      failed: 3,
      phase: "一部未完了",
    });
    expect((await app.state()).settings.autoAnalyzePausedUntil).toBe(
      now() + 900,
    );
    const version = await repo.stateVersion();
    advance(899);
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(3);
    expect(await repo.stateVersion()).toBe(version);
    advance(1);
    analyze.mockResolvedValue({
      analysisStatus: "done",
      decision: "candidate",
    });
    for (let run = 0; run < 3; run += 1) await app.scheduled();
    expect(analyzed()).toEqual([0, 1, 2, 3, 4]);
    expect(await repo.getJob()).toMatchObject({ articleIds: [ids[3], ids[4]] });
    expect(
      (await repo.articles()).filter(
        (article) => article.analysisStatus === "error",
      ),
    ).toHaveLength(3);
    // Nothing pending remains; failed articles wait for an explicit request.
    advance(3600);
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(5);
    expect(notifier.report).toHaveBeenCalledWith(
      "jev",
      expect.any(String),
      expect.any(String),
    );
  });

  it("pauses after a failed manual classification too", async () => {
    const { app, repo, analyze, advance } = await autoSetup(["01", "02"]);
    analyze.mockRejectedValueOnce(new Error("upstream"));
    const [older, newer] = (await repo.articles()).reverse();
    await repo.updateSettings({ pollMinutes: 15 });
    await app.start("analyze", [older!.id]);
    await app.scheduled();
    await repo.updateSettings({ autoAnalyze: true });
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(1);
    advance(900);
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(analyze.mock.calls[1]?.[0].id).toBe(newer!.id);
  });

  it("stops queueing when disabled but lets a started batch finish", async () => {
    const { app, repo, analyze } = await autoSetup(
      Array.from({ length: 12 }, (_, index) =>
        String(index + 1).padStart(2, "0"),
      ),
    );
    await app.settings({ autoAnalyze: true });
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(10);
    expect(await repo.getJob()).toMatchObject({ running: true, progress: 10 });
    await app.settings({ autoAnalyze: false });
    for (let run = 0; run < 3; run += 1) await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(12);
    expect(await repo.getJob()).toMatchObject({
      running: false,
      progress: 12,
      error: null,
    });
    await repo.ingest(source, [{ ...item, url: `${item.url}/new` }]);
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(12);
  });

  it("requires the Jev key to enable and does not send without it", async () => {
    const notifier = notices();
    const { app, repo, analyze } = await autoSetup(["01"], {
      key: "",
      notifier,
    });
    await expect(app.settings({ autoAnalyze: true })).rejects.toThrow(
      "自動仕分けには Jev の API キーを設定してください",
    );
    expect((await repo.settings()).autoAnalyze).toBe(false);
    // The key was removed after the setting was enabled.
    await repo.updateSettings({ autoAnalyze: true });
    await app.settings({ autoAnalyze: false });
    await repo.updateSettings({ autoAnalyze: true });
    const version = await repo.stateVersion();
    await app.scheduled();
    expect(analyze).not.toHaveBeenCalled();
    expect(await repo.stateVersion()).toBe(version);
    expect(notifier.report).toHaveBeenCalledWith(
      "auto-analysis",
      "自動仕分けを実行できません",
      expect.stringContaining("API キー"),
    );
  });
});

/** Two workers with their own connection to one database file. */
async function competingSetup() {
  const directory = mkdtempSync(join(tmpdir(), "nilay-application-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const now = 10_000;
  const worker = (maxAnalysisItemsPerTick?: number) => {
    const storage = testRepository([source], () => now, join(directory, "db"));
    cleanup.unshift(storage.close);
    const jev = new Jev("test-key");
    const analyze = vi.spyOn(jev, "analyze").mockResolvedValue({
      analysisStatus: "done",
      decision: "candidate",
    });
    const app = new Application(storage.repo, jev, new BufferClient(), {
      clock: () => now,
      maxAnalysisItemsPerTick,
    });
    return { ...storage, app, analyze };
  };
  const a = worker();
  // B's invocations stand for single manual items that end before A decides,
  // so B must not continue into automatic work within one invocation.
  const b = worker(1);
  await a.repo.initialize();
  await b.repo.initialize();
  await a.repo.ingest(
    source,
    ["01", "02"].map((day, index) => ({
      ...item,
      url: `${item.url}/${index}`,
      publishedAt: dayTime(day),
    })),
  );
  const [newer, older] = await a.repo.articles();
  await a.repo.updateSettings({ autoAnalyze: true, pollMinutes: 15 });
  return { a, b, older: older!, newer: newer! };
}

describe("automatic classification races and replays", () => {
  type Competing = Awaited<ReturnType<typeof competingSetup>>;
  it.each([
    [
      "another worker classified the sole pending article",
      true,
      1,
      async ({ b, newer }: Competing) => {
        await b.app.start("analyze", [newer.id]);
        await b.app.scheduled();
      },
    ],
    [
      "another worker failed and paused automation",
      false,
      1,
      async ({ b, older }: Competing) => {
        b.analyze.mockRejectedValueOnce(new Error("upstream"));
        await b.app.start("analyze", [older.id]);
        await b.app.scheduled();
      },
    ],
    [
      "only the pause record changed",
      true,
      0,
      async ({ b }: Competing) => {
        await b.repo.putRecord("scheduler", "analysis", { nextAt: 20_000 });
      },
    ],
    [
      "automatic classification was disabled",
      true,
      0,
      async ({ b }: Competing) => {
        await b.app.settings({ autoAnalyze: false });
      },
    ],
  ] as const)(
    "does not queue a stale decision when %s",
    async (_name, olderDone, calls, interleave) => {
      const context = await competingSetup();
      const { a, b, older } = context;
      if (olderDone) {
        // Only the newer article is pending when A decides.
        await b.app.start("analyze", [older.id]);
        await b.app.scheduled();
      }
      const paid = b.analyze.mock.calls.length;
      const original = a.driver.batch.bind(a.driver);
      let decided = false;
      a.driver.batch = async (statements: SQLStatement[]) => {
        // A has read its snapshot and computed its job; B commits first.
        if (!decided && statements[0]?.[0].startsWith("UPDATE news_meta")) {
          decided = true;
          await interleave(context);
        }
        return original(statements);
      };
      expect(await a.repo.queueAutomaticJob(true)).toBeNull();
      expect(decided).toBe(true);
      a.driver.batch = original;
      for (let run = 0; run < 3; run += 1) await a.app.scheduled();
      expect(a.analyze).not.toHaveBeenCalled();
      expect(b.analyze.mock.calls.length).toBe(paid + calls);
      expect((await a.repo.getJob()).automatic).toBe(false);
    },
    // Two real SQLite connections and completed jobs can exceed 5 s on Windows CI.
    30_000,
  );

  it.each([
    ["a stored failure", "error", 1],
    ["a stored result", "done", 0],
  ] as const)(
    "never pays twice after a crash following %s",
    async (_name, status, failures) => {
      // Newest first, so index order.
      const { app, repo, analyze, advance, ids, now } = await autoSetup([
        "02",
        "01",
      ]);
      if (status === "error")
        analyze.mockRejectedValueOnce(new Error("upstream"));
      await repo.updateSettings({ autoAnalyze: true, pollMinutes: 15 });
      // The result is stored, but neither progress nor failure is recorded.
      vi.spyOn(repo, "releaseJob").mockRejectedValueOnce(new Error("crash"));
      vi.spyOn(repo, "finishJob").mockRejectedValueOnce(new Error("crash"));
      const crashedAt = now();
      await expect(app.scheduled()).rejects.toThrow("crash");
      expect(await repo.article(ids[0]!)).toMatchObject({
        analysisStatus: status,
      });
      expect(await repo.getJob()).toMatchObject({ running: true, progress: 0 });
      advance(601);
      await app.scheduled();
      // The replayed result is not sent again. A replayed stored failure ends
      // the invocation; a stored success lets it continue with the next item.
      expect(analyze).toHaveBeenCalledTimes(failures ? 1 : 2);
      await app.scheduled();
      expect(analyze).toHaveBeenCalledTimes(2);
      expect(analyze.mock.calls[1]?.[0].id).toBe(ids[1]);
      const job = await repo.getJob();
      expect(job).toMatchObject({
        running: false,
        automatic: true,
        progress: 2,
        failed: failures,
      });
      expect(Boolean(job.error)).toBe(failures > 0);
      // The interrupted slice paused automation; a counted replayed failure
      // pauses it again from the end of the batch.
      expect(
        await repo.getRecord<{ nextAt: number }>("scheduler", "analysis"),
      ).toEqual({ nextAt: (failures ? now() : crashedAt) + 900 });
    },
  );

  it("lets an explicit request classify an analyzed article again", async () => {
    const { app, repo, analyze, ids } = await autoSetup(["01"]);
    await app.start("analyze", [ids[0]!]);
    await app.scheduled();
    await app.start("analyze", [ids[0]!]);
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(2);
    expect((await repo.getJob()).automatic).toBe(false);
  });

  it("bounds a persisted oversized job to 100 paid articles", async () => {
    const { app, repo, driver, ids, analyze } = await autoSetup(
      Array.from({ length: 101 }, () => "01"),
    );
    const job = { ...(await repo.getJob()) };
    driver.db.prepare("UPDATE news_state SET data=? WHERE id='job'").run(
      JSON.stringify({
        ...job,
        id: "oversized",
        running: true,
        kind: "analyze",
        articleIds: ids,
      }),
    );
    await app.scheduled();
    expect(await repo.getJob()).toMatchObject({ total: 100, progress: 10 });
    expect(analyze).toHaveBeenCalledTimes(10);
  });
});

describe("automatic job fairness", () => {
  it("classifies between collections that take longer than their interval", async () => {
    const jev = new Jev("test-key");
    const analyze = vi.spyOn(jev, "analyze").mockResolvedValue({
      analysisStatus: "done",
      decision: "candidate",
    });
    const sources = Array.from({ length: 16 }, (_, index) => ({
      ...source,
      id: `source-${index}`,
    }));
    const { app, repo, collector, advance } = await setup(sources, { jev });
    await repo.ingest(source, [
      { ...item, url: `${item.url}/1` },
      { ...item, url: `${item.url}/2` },
    ]);
    await repo.updateSettings({
      autoCollect: true,
      autoAnalyze: true,
      pollMinutes: 15,
    });
    const ticks: [number, number][] = [];
    for (let tick = 0; tick < 40; tick += 1) {
      const before = [collector.mock.calls.length, analyze.mock.calls.length];
      await app.scheduled();
      ticks.push([
        collector.mock.calls.length - before[0]!,
        analyze.mock.calls.length - before[1]!,
      ]);
      advance(60);
    }
    // 16 sources, then one batch of the three pending articles followed by
    // the next due collection's first source in the same invocation.
    expect(ticks.slice(0, 16).every(([c, a]) => c === 1 && a === 0)).toBe(true);
    expect(ticks[16]).toEqual([1, 3]);
    expect(ticks.slice(17).every(([c, a]) => c === 1 && a === 0)).toBe(true);
    expect(analyze).toHaveBeenCalledTimes(3);
    expect(collector.mock.calls.length).toBeGreaterThanOrEqual(32);
  });

  it("classifies pending articles when no source is enabled", async () => {
    const jev = new Jev("test-key");
    const analyze = vi.spyOn(jev, "analyze").mockResolvedValue({
      analysisStatus: "done",
      decision: "candidate",
    });
    const { app, repo, collector } = await setup(
      [{ ...source, enabled: false }],
      { jev },
    );
    await repo.ingest(source, [item]);
    await repo.updateSettings({ autoCollect: true, autoAnalyze: true });
    await app.scheduled();
    expect(collector).not.toHaveBeenCalled();
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(await repo.getJob()).toMatchObject({
      kind: "analyze",
      running: false,
      error: null,
    });
    const version = await repo.stateVersion();
    await app.scheduled();
    expect(await repo.stateVersion()).toBe(version);
  });
});

describe("slice deadline", () => {
  it("does not report failure when the slice released the job before the deadline write", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const notifier = notices();
    const { app, repo, collector } = await setup(
      [source, { ...source, id: "two" }],
      { notifier },
    );
    const release = repo.releaseJob.bind(repo);
    const finish = repo.finishJob.bind(repo);
    let reached!: () => void;
    const releasing = new Promise<void>((resolve) => (reached = resolve));
    let commit!: () => void;
    const gate = new Promise<void>((resolve) => (commit = resolve));
    let released: Promise<Job> | undefined;
    vi.spyOn(repo, "releaseJob").mockImplementation((...args) => {
      reached();
      released = gate.then(() => release(...args));
      return released;
    });
    // The deadline write lands after the in-flight release has committed.
    vi.spyOn(repo, "finishJob").mockImplementation(async (...args) => {
      commit();
      await released;
      return finish(...args);
    });
    await app.start("collect");
    const run = app.scheduled();
    await releasing;
    await vi.advanceTimersByTimeAsync(240_000);
    await expect(run).resolves.toBeUndefined();
    expect(await repo.getJob()).toMatchObject({
      running: true,
      token: null,
      progress: 1,
      error: null,
      phase: "1/2 件完了・次の処理を待機中",
    });
    expect(notifier.report).not.toHaveBeenCalledWith(
      "job",
      expect.anything(),
      expect.anything(),
    );
    vi.mocked(repo.releaseJob).mockRestore();
    vi.mocked(repo.finishJob).mockRestore();
    await app.scheduled();
    expect(collector).toHaveBeenCalledTimes(2);
    expect(await repo.getJob()).toMatchObject({ running: false, error: null });
  });
  it("propagates storage errors from recording a deadline failure", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { app, repo, collector } = await setup();
    let reached!: () => void;
    const collecting = new Promise<void>((resolve) => (reached = resolve));
    collector.mockImplementationOnce(() => {
      reached();
      return new Promise(() => {});
    });
    vi.spyOn(repo, "finishJob").mockRejectedValueOnce(
      new Error("D1 unavailable"),
    );
    await app.start("collect");
    const run = app.scheduled();
    const outcome = run.then(
      () => null,
      (error: unknown) => error,
    );
    await collecting;
    await vi.advanceTimersByTimeAsync(240_000);
    expect(await outcome).toHaveProperty("message", "D1 unavailable");
    expect(await repo.getJob()).toMatchObject({ running: true, progress: 0 });
  });
});

describe("bounded classification per invocation (production default 10 items / 45 s)", () => {
  /** Descending days: index 0 is the newest, so classification follows index order. */
  const days = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      String(count - index).padStart(2, "0"),
    );
  const pending = async (repo: Awaited<ReturnType<typeof setup>>["repo"]) =>
    (await repo.articles()).filter(
      (article) => article.analysisStatus === "pending",
    ).length;

  it("rejects an item cap outside 1 to 10", async () => {
    const { repo } = await setup();
    for (const maxAnalysisItemsPerTick of [0, 11, 1.5, Number.NaN])
      expect(
        () =>
          new Application(repo, new Jev(), new BufferClient(), {
            maxAnalysisItemsPerTick,
          }),
      ).toThrow(RangeError);
  });

  it("classifies exactly 10 of 25 pending articles per invocation, newest first", async () => {
    const { app, repo, analyzed } = await autoSetup(days(25));
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    await app.scheduled();
    expect(analyzed()).toEqual(days(10).map((_, index) => index));
    expect(await repo.getJob()).toMatchObject({
      kind: "analyze",
      automatic: true,
      running: true,
      token: null,
      leaseUntil: 0,
      total: 25,
      progress: 10,
      failed: 0,
    });
    expect(await pending(repo)).toBe(15);
    await app.scheduled();
    expect(analyzed()).toHaveLength(20);
    expect(await pending(repo)).toBe(5);
    await app.scheduled();
    expect(analyzed()).toEqual(days(25).map((_, index) => index));
    expect(await repo.getJob()).toMatchObject({
      running: false,
      progress: 25,
      error: null,
    });
    expect(await pending(repo)).toBe(0);
  });

  it("finishes a manual batch of 10 in one invocation", async () => {
    const { app, repo, analyze, ids } = await autoSetup(days(12));
    const job = await app.start("analyze", ids.slice(0, 10));
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(10);
    expect(await repo.getJob()).toMatchObject({
      id: job.id,
      automatic: false,
      running: false,
      progress: 10,
      total: 10,
      error: null,
    });
    // Automatic classification is off, so the other two stay pending.
    expect(await pending(repo)).toBe(2);
  });

  it("starts no item once 45 seconds have elapsed", async () => {
    const { app, repo, analyze, advance } = await autoSetup(days(12));
    // Each classification takes 15 s: items start at 0, 15 and 30 s.
    analyze.mockImplementation(async () => {
      advance(15);
      return { analysisStatus: "done", decision: "candidate" };
    });
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(3);
    expect(await repo.getJob()).toMatchObject({
      running: true,
      token: null,
      progress: 3,
    });
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(6);
  });

  it("lets a slow article finish without cancelling it at 45 seconds", async () => {
    const { app, repo, analyze, advance, ids } = await autoSetup(days(3));
    let aborted: boolean | undefined;
    analyze.mockImplementationOnce(
      async (_article, _rubric, _others, signal) => {
        advance(100);
        await new Promise((resolve) => setTimeout(resolve, 5));
        // The 45-second budget never aborts the request in flight.
        aborted = signal?.aborted;
        return { analysisStatus: "done", decision: "candidate" };
      },
    );
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(aborted).toBe(false);
    expect(await repo.article(ids[0]!)).toMatchObject({
      analysisStatus: "done",
    });
    expect(await repo.getJob()).toMatchObject({
      running: true,
      token: null,
      progress: 1,
      error: null,
    });
  });

  it("ends the invocation at the first new failure and resumes on the next", async () => {
    const { app, repo, analyze, analyzed, ids } = await autoSetup(days(6));
    analyze
      .mockResolvedValueOnce({ analysisStatus: "done", decision: "candidate" })
      .mockRejectedValueOnce(new Error("upstream"));
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    await app.scheduled();
    expect(analyzed()).toEqual([0, 1]);
    expect(await repo.getJob()).toMatchObject({
      running: true,
      token: null,
      progress: 2,
      failed: 1,
    });
    // The failed article is not sent again; the batch resumes after it.
    await app.scheduled();
    expect(analyzed()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(await repo.getJob()).toMatchObject({
      running: false,
      failed: 1,
      phase: "一部未完了",
    });
    expect((await repo.article(ids[1]!)).analysisStatus).toBe("error");
  });

  it("ends the invocation when a batch finishes with an earlier failure", async () => {
    const { app, repo, analyze, collector } = await analyzeSetup(3);
    analyze.mockRejectedValueOnce(new Error("upstream"));
    await app.start("analyze");
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(1);
    await repo.updateSettings({ autoCollect: true });
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(3);
    expect(await repo.getJob()).toMatchObject({
      kind: "analyze",
      running: false,
      failed: 1,
      phase: "一部未完了",
    });
    // Due collection waits for the next invocation.
    expect(collector).not.toHaveBeenCalled();
    await app.scheduled();
    expect(collector).toHaveBeenCalledTimes(1);
  });

  it("stops the whole batch after three failures across invocations", async () => {
    const { app, repo, analyze, now } = await autoSetup(days(12));
    analyze.mockRejectedValue(new Error("upstream"));
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 15 });
    for (let run = 0; run < 3; run += 1) {
      await app.scheduled();
      expect(analyze).toHaveBeenCalledTimes(run + 1);
    }
    expect(await repo.getJob()).toMatchObject({
      running: false,
      progress: 3,
      failed: 3,
    });
    expect(
      await repo.getRecord<{ nextAt: number }>("scheduler", "analysis"),
    ).toEqual({ nextAt: now() + 900 });
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(3);
    expect(await pending(repo)).toBe(9);
  });

  it("records durable progress before every item", async () => {
    const { app, repo, analyze } = await autoSetup(days(12));
    const seen: [number, string | null][] = [];
    analyze.mockImplementation(async () => {
      const job = await repo.getJob();
      seen.push([job.progress, job.token]);
      return { analysisStatus: "done", decision: "candidate" };
    });
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    await app.scheduled();
    expect(seen.map(([progress]) => progress)).toEqual(
      days(10).map((_, index) => index),
    );
    // Every item runs under its own fresh lease token.
    expect(new Set(seen.map(([, token]) => token)).size).toBe(10);
    expect(seen.every(([, token]) => token !== null)).toBe(true);
  });

  it("replays a stored result after a crash without paying again, then continues", async () => {
    const { app, repo, analyze, advance, ids } = await autoSetup(days(12));
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 15 });
    const release = repo.releaseJob.bind(repo);
    let releases = 0;
    // The fourth result is stored, but its progress is lost in a crash.
    vi.spyOn(repo, "releaseJob").mockImplementation(async (...args) => {
      releases += 1;
      if (releases === 4) throw new Error("crash");
      return release(...args);
    });
    vi.spyOn(repo, "finishJob").mockRejectedValueOnce(new Error("crash"));
    await expect(app.scheduled()).rejects.toThrow("crash");
    expect(analyze).toHaveBeenCalledTimes(4);
    expect(await repo.getJob()).toMatchObject({ running: true, progress: 3 });
    vi.mocked(repo.releaseJob).mockRestore();
    advance(601);
    await app.scheduled();
    // Item 4 is replayed from storage; the other eight follow in this invocation.
    expect(analyze).toHaveBeenCalledTimes(12);
    expect(
      new Set(analyze.mock.calls.map(([article]) => article.id)).size,
    ).toBe(12);
    expect(
      analyze.mock.calls.map(([article]) => ids.indexOf(article.id)),
    ).toEqual(days(12).map((_, index) => index));
  });

  it("stops without another paid call when the rubric changes mid-invocation", async () => {
    const { app, repo, analyze } = await autoSetup(days(5));
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    analyze
      .mockResolvedValueOnce({ analysisStatus: "done", decision: "candidate" })
      .mockImplementationOnce(async () => {
        await app.settings({
          rubric: "射撃競技に関係するニュースだけを候補にする",
        });
        return { analysisStatus: "done", decision: "candidate" };
      });
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(await repo.getJob()).toMatchObject({
      running: false,
      token: null,
      error: expect.stringContaining("選定基準"),
    });
    // The rubric change reset stored results; nothing was stored under it.
    expect(await pending(repo)).toBe(5);
  });

  it("stops when an article changes during its classification and keeps manual review", async () => {
    const { app, repo, analyze, ids } = await autoSetup(days(5));
    await repo.review(ids[0]!, "saved");
    await repo.review(ids[2]!, "dismissed");
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    const store = repo.analyzeResult.bind(repo);
    vi.spyOn(repo, "analyzeResult")
      .mockImplementationOnce(store)
      .mockResolvedValueOnce(false);
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(await repo.getJob()).toMatchObject({
      running: false,
      progress: 1,
      error: expect.stringContaining("記事が変更された"),
    });
    expect((await repo.article(ids[0]!)).reviewStatus).toBe("saved");
    expect((await repo.article(ids[2]!)).reviewStatus).toBe("dismissed");
    expect((await repo.article(ids[0]!)).analysisStatus).toBe("done");
    expect((await repo.article(ids[1]!)).analysisStatus).toBe("pending");
  });

  it("does not start while automatic classification is paused or disabled", async () => {
    const { app, repo, analyze, advance, now } = await autoSetup(days(12));
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 15 });
    await repo.putRecord("scheduler", "analysis", { nextAt: now() + 60 });
    const version = await repo.stateVersion();
    await app.scheduled();
    expect(analyze).not.toHaveBeenCalled();
    expect(await repo.stateVersion()).toBe(version);
    await repo.updateSettings({ autoAnalyze: false });
    advance(60);
    await app.scheduled();
    expect(analyze).not.toHaveBeenCalled();
    expect(await repo.settings()).toMatchObject({
      autoAnalyze: false,
      pollMinutes: 15,
    });
  });

  it("runs publication housekeeping once per invocation", async () => {
    const jev = new Jev("test-key");
    vi.spyOn(jev, "analyze").mockResolvedValue({
      analysisStatus: "done",
      decision: "candidate",
    });
    const context = await setup([source], { jev });
    const { repo } = context;
    await repo.ingest(
      source,
      days(12).map((day) => ({ ...item, url: `${item.url}/${day}` })),
    );
    const app = new Application(
      repo,
      jev,
      new BufferClient("buffer-key", "channel", async () => {
        throw new Error("Unexpected network");
      }),
      {
        clock: context.now,
        notifier: notices() as unknown as Notifier,
      },
    );
    const tick = vi.spyOn(app.publisher, "tick").mockResolvedValue();
    const recoverPosts = vi.spyOn(repo, "recoverPosts");
    const publicationState = vi.spyOn(repo, "publicationState");
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    await app.scheduled();
    expect((await repo.getJob()).progress).toBe(10);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(recoverPosts).toHaveBeenCalledTimes(1);
    expect(publicationState).toHaveBeenCalledTimes(1);
  });

  it("never overlaps or pays twice with concurrent invocations", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nilay-burst-"));
    cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
    const now = 10_000;
    let active = 0;
    let overlap = 0;
    const paid: string[] = [];
    const worker = () => {
      const storage = testRepository(
        [source],
        () => now,
        join(directory, "db"),
      );
      cleanup.unshift(storage.close);
      const jev = new Jev("test-key");
      vi.spyOn(jev, "analyze").mockImplementation(async (article) => {
        active += 1;
        overlap = Math.max(overlap, active);
        paid.push(article.id);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return { analysisStatus: "done", decision: "candidate" };
      });
      return {
        ...storage,
        app: new Application(storage.repo, jev, new BufferClient(), {
          clock: () => now,
        }),
      };
    };
    const a = worker();
    const b = worker();
    await a.repo.initialize();
    await b.repo.initialize();
    await a.repo.ingest(
      source,
      days(30).map((day) => ({ ...item, url: `${item.url}/${day}` })),
    );
    await a.repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    await Promise.all([a.app.scheduled(), b.app.scheduled()]);
    await Promise.all([a.app.scheduled(), b.app.scheduled()]);
    expect(overlap).toBe(1);
    expect(new Set(paid).size).toBe(paid.length);
    // Each invocation stops at its own cap or when the other holds the job.
    expect(paid.length).toBeGreaterThanOrEqual(20);
    expect(paid.length).toBeLessThanOrEqual(30);
    const job = await a.repo.getJob();
    expect(job).toMatchObject({ token: null, progress: paid.length });
    expect(
      (await a.repo.articles()).filter(
        (article) => article.analysisStatus === "done",
      ),
    ).toHaveLength(paid.length);
  }, 30_000);
});

describe("invocation boundaries between classification items", () => {
  /** Descending days: index 0 is the newest, so classification follows index order. */
  const days = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      String(count - index).padStart(2, "0"),
    );
  /** The first item has been released; its job waits unclaimed for the next item. */
  const released = {
    running: true,
    token: null,
    leaseUntil: 0,
    progress: 1,
    phase: "1/12 件完了・次の処理を待機中",
  };

  it("starts the first item after slow publication housekeeping, but no additional one", async () => {
    const jev = new Jev("test-key");
    const analyze = vi.spyOn(jev, "analyze").mockResolvedValue({
      analysisStatus: "done",
      decision: "candidate",
    });
    const { repo, advance, now } = await setup([source], { jev });
    await repo.ingest(
      source,
      days(12).map((day) => ({ ...item, url: `${item.url}/${day}` })),
    );
    const app = new Application(
      repo,
      jev,
      new BufferClient("buffer-key", "channel", async () => {
        throw new Error("Unexpected network");
      }),
      { clock: now },
    );
    vi.spyOn(app.publisher, "tick").mockImplementation(async () => {
      advance(50);
    });
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(await repo.getJob()).toMatchObject(released);
  });

  it("does not claim an additional item when queueing crosses 45 seconds", async () => {
    const { app, repo, analyze, advance } = await autoSetup(days(12));
    const queue = repo.queueAutomaticJob.bind(repo);
    let calls = 0;
    vi.spyOn(repo, "queueAutomaticJob").mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 2) advance(45);
      return queue(...args);
    });
    const claim = vi.spyOn(repo, "claimJob");
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(await repo.getJob()).toMatchObject(released);
  });

  it("releases a fresh claim unchanged when claiming crosses 45 seconds", async () => {
    const notifier = notices();
    const { app, repo, analyze, advance, ids } = await autoSetup(days(12), {
      notifier,
    });
    const claim = repo.claimJob.bind(repo);
    let calls = 0;
    vi.spyOn(repo, "claimJob").mockImplementation(async (...args) => {
      calls += 1;
      const job = await claim(...args);
      if (calls === 2) advance(45);
      return job;
    });
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    await app.scheduled();
    expect(calls).toBe(2);
    expect(analyze).toHaveBeenCalledTimes(1);
    const job = await repo.getJob();
    expect(job).toMatchObject({ ...released, failed: 0, error: null });
    // The next invocation continues without a resumption notice.
    await app.scheduled();
    expect(analyze.mock.calls.map(([article]) => article.id)).toEqual(
      ids.slice(0, 11),
    );
    expect(notifier.report).not.toHaveBeenCalledWith(
      "job",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("stops when another worker claims the job after the first release", async () => {
    const { app, repo, analyze, now } = await autoSetup(days(12));
    const release = repo.releaseJob.bind(repo);
    let other: Job | null = null;
    vi.spyOn(repo, "releaseJob").mockImplementationOnce(async (...args) => {
      const job = await release(...args);
      // Another invocation claims the job between the two items.
      other = await repo.claimJob(now(), 600);
      return job;
    });
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(other).not.toBeNull();
    expect(await repo.getJob()).toMatchObject({
      running: true,
      progress: 1,
      token: other!.token,
    });
  });

  it("leaves a manual job queued before the next item for the next invocation", async () => {
    const { app, repo, analyze, ids } = await autoSetup(days(2));
    const finish = repo.finishJob.bind(repo);
    let manual: Job | undefined;
    vi.spyOn(repo, "finishJob").mockImplementationOnce(async (...args) => {
      const job = await finish(...args);
      manual = await app.start("analyze", [ids[0]!]);
      return job;
    });
    const claim = vi.spyOn(repo, "claimJob");
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(2);
    // The manual job is seen before claiming and is never claimed.
    expect(claim).toHaveBeenCalledTimes(2);
    expect(await repo.getJob()).toMatchObject({
      id: manual!.id,
      automatic: false,
      running: true,
      token: null,
      progress: 0,
      phase: "仕分けの準備中",
    });
    expect((await repo.getJob()).workIds).toBeUndefined();
    // The manual request runs on its own invocation.
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(3);
    expect(analyze.mock.calls[2]?.[0].id).toBe(ids[0]);
    expect(await repo.getJob()).toMatchObject({
      id: manual!.id,
      running: false,
      progress: 1,
    });
  });

  it("releases a manual job queued after the pre-claim snapshot unchanged", async () => {
    const { app, repo, analyze, ids } = await autoSetup(days(2));
    const queue = repo.queueAutomaticJob.bind(repo);
    let calls = 0;
    let manual: Job | undefined;
    vi.spyOn(repo, "queueAutomaticJob").mockImplementation(async (...args) => {
      calls += 1;
      // The third item has read the finished automatic job already.
      if (calls === 3) manual = await repo.queueJob("analyze", [ids[0]!]);
      return queue(...args);
    });
    const claim = vi.spyOn(repo, "claimJob");
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    await app.scheduled();
    expect(manual).toBeDefined();
    expect(claim).toHaveBeenCalledTimes(3);
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(await repo.getJob()).toMatchObject({
      id: manual!.id,
      automatic: false,
      running: true,
      token: null,
      leaseUntil: 0,
      progress: 0,
      total: 0,
      phase: "仕分けの準備中",
      error: null,
    });
    expect((await repo.getJob()).workIds).toBeUndefined();
  });

  it("lets a new automatic batch follow a manual batch the invocation started with", async () => {
    const { app, repo, analyze, ids } = await autoSetup(days(4));
    await app.start("analyze", [ids[3]!, ids[2]!]);
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    await app.scheduled();
    expect(analyze.mock.calls.map(([article]) => article.id)).toEqual([
      ids[3],
      ids[2],
      ids[0],
      ids[1],
    ]);
    expect(await repo.getJob()).toMatchObject({
      automatic: true,
      running: false,
      error: null,
    });
  });
});

const CHANNEL = {
  id: "channel-123",
  name: "@NilayNews",
  service: "twitter",
  allowedActions: ["scheduleUpdates", "readUpdates"],
  isDisconnected: false,
  isLocked: false,
  isQueuePaused: false,
  linkShortening: { isEnabled: false },
};

/** An application whose Buffer transport answers every request with `reply`. */
async function publishingSetup(
  reply: () => unknown = () => ({
    data: {
      channel: CHANNEL,
      dailyPostingLimits: [
        { channelId: CHANNEL.id, isAtLimit: false, limit: 100, scheduled: 0 },
      ],
    },
  }),
  credentials: [string, string] = ["buffer-key", "channel-123"],
) {
  const context = await setup();
  const queries: string[] = [];
  const transport = vi.fn<FetchBytes>(async (url, options) => {
    const body = JSON.parse(new TextDecoder().decode(options?.body)) as {
      query: string;
    };
    queries.push(body.query);
    return {
      data: utf8(JSON.stringify(reply())),
      url,
      contentType: "application/json",
    };
  });
  const app = new Application(
    context.repo,
    new Jev(),
    new BufferClient(...credentials, transport),
    { clock: context.now },
  );
  /** Stores saved articles, each published one minute before the previous. */
  const saved = async (...titles: string[]) => {
    await context.repo.ingest(
      source,
      titles.map((title, index) => ({
        ...item,
        title,
        url: `https://example.org/${encodeURIComponent(title)}`,
        publishedAt: published(-3600 - index * 60),
      })),
    );
    for (const article of await context.repo.articles())
      await context.repo.review(article.id, "saved");
  };
  return { ...context, app, transport, queries, saved };
}

describe("publication preflight", () => {
  it("rejects a report whose settings and candidates span different revisions", async () => {
    const { app, repo, saved, queries } = await publishingSetup();
    await saved("記事");
    const publication = repo.publicationState.bind(repo);
    vi.spyOn(repo, "publicationState").mockImplementationOnce(async () => {
      // Another request changes the selection after the settings were read.
      await repo.updateSettings({ postSelection: "saved" });
      return publication();
    });
    await expect(app.publicationPreflight()).rejects.toThrow(
      "確認中に記事や設定が更新されました",
    );
    expect(queries).toHaveLength(1);
    expect((await repo.settings()).autoPost).toBe(false);
    expect((await publication()).posts).toEqual([]);
  });
  it("reports the next post without sending, claiming or changing anything", async () => {
    const { app, repo, queries, saved } = await publishingSetup();
    await saved("新しい記事", "古い記事");
    const before = JSON.stringify(await repo.exportSnapshot());
    const version = await repo.stateVersion();
    const tick = vi.spyOn(app.publisher, "tick");
    const spies = (
      [
        "claimPost",
        "claimPostCheck",
        "recoverPosts",
        "finishPost",
        "submitPost",
        "updateSettings",
        "putRecord",
        "queueJob",
      ] as const
    ).map((name) => vi.spyOn(repo, name));
    const report = await app.publicationPreflight();
    expect(report).toMatchObject({
      checkedAt: isoSeconds(10_000),
      account: "NilayNews",
      configured: true,
      connectionVerified: true,
      autoPost: false,
      postSelection: "both",
      candidates: 2,
      blockers: [],
      ready: true,
    });
    expect(report.firstCandidate?.text).toMatch(/^新しい記事\n/);
    expect(report.notes.join("")).toContain("60分");
    expect(report.notes.join("")).toContain("鮮度条件を満たす最も新しい");
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/^query/);
    expect(queries[0]).not.toContain("createPost");
    expect(tick).not.toHaveBeenCalled();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(await repo.stateVersion()).toBe(version);
    expect(JSON.stringify(await repo.exportSnapshot())).toBe(before);
  });
  it("previews the same article and text the first automatic post claims", async () => {
    const { app, repo, saved, advance, now } = await publishingSetup();
    await saved("三件目", "二件目", "一件目");
    const report = await app.publicationPreflight();
    const [next] = await repo.postCandidates();
    expect(report.firstCandidate).toEqual({
      articleId: next!.id,
      text: draft(next!),
    });
    await app.settings({ autoPost: true });
    advance(3601);
    expect(await repo.claimPost(now())).toMatchObject(report.firstCandidate!);
  });
  it("reports missing credentials without a network request", async () => {
    const { app, transport, saved } = await publishingSetup(undefined, [
      "",
      "",
    ]);
    await saved("記事");
    const report = await app.publicationPreflight();
    expect(report).toMatchObject({
      configured: false,
      connectionVerified: false,
      ready: false,
      blockers: ["Buffer の API キーとチャンネル ID を設定してください"],
    });
    expect(report.firstCandidate).not.toBeNull();
    expect(transport).not.toHaveBeenCalled();
  });
  it("reports connection and account failures as readable blockers", async () => {
    const { app, transport, saved } = await publishingSetup(() => ({
      data: {
        channel: { ...CHANNEL, linkShortening: { isEnabled: true } },
      },
    }));
    await saved("記事");
    const shortening = await app.publicationPreflight();
    expect(shortening).toMatchObject({
      connectionVerified: false,
      ready: false,
    });
    expect(shortening.blockers).toEqual([
      expect.stringContaining("No Shortening"),
    ]);
    transport.mockRejectedValueOnce(new FetchError("private detail", 401));
    const unauthorized = await app.publicationPreflight();
    expect(unauthorized.blockers).toEqual([
      expect.stringContaining("HTTP 401"),
    ]);
    expect(JSON.stringify(unauthorized)).not.toContain("private detail");
  });
  it("propagates unexpected failures instead of reporting them", async () => {
    const { app, transport } = await publishingSetup();
    transport.mockRejectedValueOnce(new Error("private runtime"));
    await expect(app.publicationPreflight()).rejects.toThrow("private runtime");
  });
  it("blocks on an unresolved post", async () => {
    const { app, repo, saved, advance, now } = await publishingSetup();
    await saved("一件目", "二件目");
    await repo.updateSettings({ autoPost: true });
    advance(3601);
    const claim = (await repo.claimPost(now()))!;
    await repo.finishPost(claim.articleId, "failed", {
      error: "失敗",
      claimToken: claim.claimToken,
    });
    const report = await app.publicationPreflight();
    expect(report).toMatchObject({
      autoPost: false,
      connectionVerified: true,
      candidates: 1,
      ready: false,
    });
    expect(report.blockers).toEqual([
      expect.stringContaining("確認待ち・送信中の記事が 1 件"),
    ]);
  });
  it("blocks without candidates or with an invalid next draft", async () => {
    const { app, repo, saved } = await publishingSetup();
    const empty = await app.publicationPreflight();
    expect(empty).toMatchObject({ candidates: 0, firstCandidate: null });
    expect(empty.blockers).toEqual([
      expect.stringContaining("投稿できる記事がありません"),
    ]);
    await repo.ingest(source, [
      { ...item, title: "URL が不正", url: "https://localhost/a" },
    ]);
    await saved();
    const invalid = await app.publicationPreflight();
    expect(invalid).toMatchObject({
      candidates: 1,
      firstCandidate: null,
      ready: false,
    });
    expect(invalid.blockers).toEqual([
      expect.stringContaining(
        "「URL が不正」の投稿文を作成できません（投稿する元記事の URL が不正です）",
      ),
    ]);
  });
  it("reports automatic posting that is already enabled", async () => {
    const { app, repo, saved } = await publishingSetup();
    await saved("記事");
    await repo.updateSettings({ autoPost: true });
    const report = await app.publicationPreflight();
    expect(report).toMatchObject({
      autoPost: true,
      connectionVerified: true,
      ready: false,
    });
    expect(report.blockers).toEqual([expect.stringContaining("すでに有効")]);
  });
});

describe("enabling automatic posting", () => {
  it("verifies the account before saving", async () => {
    const { app, repo, queries } = await publishingSetup();
    const update = vi.spyOn(repo, "updateSettings");
    await app.settings({ autoPost: true });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/^query/);
    expect(update).toHaveBeenCalledTimes(1);
    expect((await repo.settings()).autoPost).toBe(true);
  });
  it("leaves every setting unchanged when verification fails", async () => {
    const { app, repo } = await publishingSetup(() => ({
      data: { channel: { ...CHANNEL, isQueuePaused: true } },
    }));
    const update = vi.spyOn(repo, "updateSettings");
    const settings = await repo.settings();
    const { nextAt } = await repo.publicationState();
    await expect(
      app.settings({ autoPost: true, postSelection: "saved" }),
    ).rejects.toBeInstanceOf(PostError);
    expect(update).not.toHaveBeenCalled();
    expect(await repo.settings()).toEqual(settings);
    expect((await repo.publicationState()).nextAt).toBe(nextAt);
  });
  it("disables and saves other settings without contacting Buffer", async () => {
    const { app, repo, transport } = await publishingSetup();
    await repo.updateSettings({ autoPost: true });
    transport.mockRejectedValue(new Error("Unexpected network"));
    expect(
      await app.settings({ autoPost: false, postSelection: "saved" }),
    ).toMatchObject({ autoPost: false, postSelection: "saved" });
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("publication freshness", () => {
  const DAY = 86400;
  const tail = (url: string) => url.split("/").at(-1);

  it("derives each article's freshness and counts only fresh pending work", async () => {
    const { app, repo, advance } = await setup();
    await repo.ingest(source, [
      { ...item, url: `${item.url}/fresh`, publishedAt: published(-60) },
      { ...item, url: `${item.url}/unknown`, publishedAt: null },
      { ...item, url: `${item.url}/invalid`, publishedAt: "2026-09-28" },
      { ...item, url: `${item.url}/future`, publishedAt: published(60) },
      { ...item, url: `${item.url}/ages`, publishedAt: published(-DAY + 10) },
    ]);
    const before = await app.state();
    expect(
      Object.fromEntries(
        before.articles.map((article) => [
          tail(article.url),
          article.freshness,
        ]),
      ),
    ).toEqual({
      fresh: "fresh",
      unknown: "unknown",
      invalid: "invalid",
      future: "future",
      ages: "fresh",
    });
    expect(before.stats).toEqual({
      total: 5,
      pending: 2,
      expired: 0,
      dateReview: 3,
    });
    // Derived on every read, never stored.
    expect((await repo.articles())[0]).not.toHaveProperty("freshness");
    advance(11);
    const after = await app.state();
    expect(
      after.articles.find((article) => article.url.endsWith("/ages"))
        ?.freshness,
    ).toBe("stale");
    expect(after.stats).toEqual({
      total: 5,
      pending: 1,
      expired: 1,
      dateReview: 3,
    });
  });

  it("skips articles that aged out in a queued automatic batch without paying", async () => {
    const { app, repo, analyze, advance, ids } = await autoSetup([
      "03",
      "02",
      "01",
    ]);
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    expect((await repo.queueAutomaticJob(true))?.articleIds).toEqual(ids);
    // The batch waited past the window, e.g. across a deployment or an outage.
    advance(DAY);
    await app.scheduled();
    expect(analyze).not.toHaveBeenCalled();
    expect(await repo.getJob()).toMatchObject({
      running: false,
      automatic: true,
      progress: 3,
      failed: 0,
      error: null,
    });
    for (const id of ids)
      expect((await repo.article(id)).analysisStatus).toBe("pending");
    expect(await repo.getRecord("scheduler", "analysis")).toBeNull();
    // Nothing fresh remains, so no new batch is queued either.
    await app.scheduled();
    expect(analyze).not.toHaveBeenCalled();
  });

  it("skips an undated article in a batch persisted before the freshness rule", async () => {
    const { app, repo, driver, analyze, ids } = await autoSetup(["02", "01"]);
    await repo.ingest(source, [
      { ...item, url: `${item.url}/undated`, publishedAt: null },
    ]);
    const undated = (await repo.articles()).find((article) =>
      article.url.endsWith("/undated"),
    )!;
    const job = await repo.getJob();
    driver.db.prepare("UPDATE news_state SET data=? WHERE id='job'").run(
      JSON.stringify({
        ...job,
        id: "persisted",
        running: true,
        automatic: true,
        kind: "analyze",
        articleIds: [undated.id, ids[1], ids[0]],
      }),
    );
    await app.scheduled();
    expect(analyze.mock.calls.map(([article]) => article.id)).toEqual([
      ids[1],
      ids[0],
    ]);
    expect(await repo.getJob()).toMatchObject({
      running: false,
      progress: 3,
      failed: 0,
      error: null,
    });
    expect((await repo.article(undated.id)).analysisStatus).toBe("pending");
  });

  it("stops before the paid call when the article ages out while loading", async () => {
    const { app, repo, analyze, advance, ids } = await autoSetup(["01"]);
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    // One second before the article leaves the window.
    advance(DAY - (START - Date.parse(dayTime("01")) / 1000) - 1);
    const articles = repo.articles.bind(repo);
    let reads = 0;
    // The first read builds the work list; the second loads related candidates.
    vi.spyOn(repo, "articles").mockImplementation(async (...args) => {
      if ((reads += 1) === 2) advance(2);
      return articles(...args);
    });
    await app.scheduled();
    expect(reads).toBe(2);
    expect(analyze).not.toHaveBeenCalled();
    expect((await repo.article(ids[0]!)).analysisStatus).toBe("pending");
    expect((await repo.getJob()).error).toBeNull();
  });

  it("classifies everything fresh newest first, but explicit selections as requested", async () => {
    const { app, repo, analyze, advance, ids } = await autoSetup([
      "01",
      "03",
      "02",
    ]);
    await repo.ingest(source, [
      { ...item, url: `${item.url}/undated`, publishedAt: null },
    ]);
    const undated = (await repo.articles()).find((article) =>
      article.url.endsWith("/undated"),
    )!;
    await app.start("analyze");
    await app.scheduled();
    expect(analyze.mock.calls.map(([article]) => article.id)).toEqual([
      ids[1],
      ids[2],
      ids[0],
    ]);
    // A person may still classify an undated or old article deliberately.
    advance(DAY);
    await app.start("analyze", [ids[2]!, undated.id, ids[0]!]);
    await app.scheduled();
    expect(analyze.mock.calls.slice(3).map(([article]) => article.id)).toEqual([
      ids[2],
      undated.id,
      ids[0],
    ]);
    expect((await repo.article(undated.id)).analysisStatus).toBe("done");
    // The stored result is history only: an aged-out candidate is never posted.
    await repo.updateSettings({ postSelection: "candidates" });
    expect(await repo.postCandidates()).toEqual([]);
  });

  it("still offers earlier articles, not later ones, as related candidates", async () => {
    const { app, repo, analyze, ids } = await autoSetup(["01", "02", "03"]);
    await repo.updateSettings({ autoAnalyze: true, pollMinutes: 240 });
    await app.scheduled();
    const calls = analyze.mock.calls.map(([article, , earlier]) => [
      ids.indexOf(article.id),
      earlier.map(({ id }) => ids.indexOf(id)).sort(),
    ]);
    // Newest first, each compared only with what was published before it.
    expect(calls).toEqual([
      [2, [0, 1]],
      [1, [0]],
      [0, []],
    ]);
  });

  it("passes its clock to the source collector", async () => {
    const { app, collector, advance } = await setup();
    advance(42);
    await app.start("collect");
    await app.scheduled();
    expect(collector).toHaveBeenCalledWith(
      expect.objectContaining({ id: source.id }),
      expect.any(Function),
      START + 42,
    );
  });

  it("never previews an article that has aged out", async () => {
    const { app, saved, advance } = await publishingSetup();
    await saved("記事");
    expect((await app.publicationPreflight()).candidates).toBe(1);
    advance(DAY - 3600 + 1);
    const report = await app.publicationPreflight();
    expect(report).toMatchObject({
      candidates: 0,
      firstCandidate: null,
      ready: false,
    });
    expect(report.blockers).toEqual([
      expect.stringContaining("投稿できる記事がありません"),
    ]);
  });

  it("keeps imported historical articles for review without automating them", async () => {
    const { app, repo } = await setup();
    // Collected two days earlier, when the story was still fresh.
    const earlier = testRepository([source], () => START - 2 * DAY);
    cleanup.push(earlier.close);
    await earlier.repo.initialize();
    await earlier.repo.ingest(source, [
      { ...item, publishedAt: published(-2 * DAY - 60) },
    ]);
    const [old] = await earlier.repo.articles();
    await earlier.repo.review(old!.id, "saved");
    await repo.importSnapshot(await earlier.repo.exportSnapshot());
    await repo.updateSettings({ autoAnalyze: true });
    const state = await app.state();
    expect(state.articles).toHaveLength(1);
    expect(state.articles[0]).toMatchObject({
      id: old!.id,
      reviewStatus: "saved",
      freshness: "stale",
    });
    expect(state.stats).toMatchObject({ pending: 0, expired: 1 });
    expect(state.publication.queued).toBe(0);
    expect(await repo.queueAutomaticJob(true)).toBeNull();
  });
});
