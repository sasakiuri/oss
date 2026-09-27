// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from "vitest";

import { Application } from "../src/application.ts";
import { CrawlDeferred } from "../src/crawl.ts";
import type { Job } from "../src/domain.ts";
import { UserError } from "../src/errors.ts";
import { Jev } from "../src/jev.ts";
import type { Notifier } from "../src/notifications.ts";
import { BufferClient } from "../src/publishing.ts";
import type { SourceConfig } from "../src/sources/types.ts";
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
const item = {
  title: "クマの出没と対策",
  url: "https://example.org/a",
  excerpt: "市が対策を発表",
  publishedAt: null,
};
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
  options: { jev?: Jev; notifier?: ReturnType<typeof notices> } = {},
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
    beginSource: vi.fn(async () => {}),
    endSource: vi.fn(async () => {}),
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
async function analyzeSetup(count: number) {
  const jev = new Jev("test-key");
  const analyze = vi.spyOn(jev, "analyze").mockResolvedValue({
    analysisStatus: "done",
    decision: "candidate",
  });
  const context = await setup([source], { jev });
  await context.repo.ingest(
    source,
    Array.from({ length: count }, (_, index) => ({
      ...item,
      url: `${item.url}/${index}`,
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
    const { app, repo, analyze } = await analyzeSetup(2);
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
