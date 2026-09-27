// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { Application } from "../src/application.ts";
import { CrawlDeferred } from "../src/crawl.ts";
import type { Job } from "../src/domain.ts";
import { UserError } from "../src/errors.ts";
import { Jev } from "../src/jev.ts";
import type { Notifier } from "../src/notifications.ts";
import { BufferClient } from "../src/publishing.ts";
import type { SourceConfig } from "../src/sources/types.ts";
import type { SQLStatement } from "../src/storage/repository.ts";
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

async function autoSetup(
  days: string[],
  options: { notifier?: ReturnType<typeof notices>; key?: string } = {},
) {
  const jev = new Jev(options.key ?? "test-key");
  const analyze = vi.spyOn(jev, "analyze").mockResolvedValue({
    analysisStatus: "done",
    decision: "candidate",
  });
  const context = await setup([source], { jev, notifier: options.notifier });
  const items = days.map((day, index) => ({
    ...item,
    url: `${item.url}/${index}`,
    publishedAt: `2026-09-${day}T00:00:00Z`,
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

  it("sends only pending articles, oldest first, in bounded batches", async () => {
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
    // The oldest two were already classified or failed.
    const expected = ids.slice(6, 26).reverse();
    expect(job).toMatchObject({ kind: "analyze", total: 20 });
    expect(job.articleIds).toEqual(expected);
    for (let run = 0; run < 25; run += 1) await app.scheduled();
    expect(analyzed()).toEqual(
      [...expected, ...ids.slice(0, 6).reverse()].map((id) => ids.indexOf(id)),
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
    expect((await repo.getJob()).articleIds).toHaveLength(100);
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it("runs due collection first and never replaces a running job", async () => {
    const { app, repo, collector, analyze, advance } = await autoSetup([
      "01",
      "02",
      "03",
    ]);
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
    const { app, repo, analyze, advance, ids, analyzed, now } = await autoSetup(
      ["01", "02", "03", "04", "05"],
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
    const { app, repo, analyze } = await autoSetup(["01", "02", "03"]);
    await app.settings({ autoAnalyze: true });
    await app.scheduled();
    await app.settings({ autoAnalyze: false });
    for (let run = 0; run < 3; run += 1) await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(3);
    expect(await repo.getJob()).toMatchObject({
      running: false,
      progress: 3,
      error: null,
    });
    await repo.ingest(source, [{ ...item, url: `${item.url}/new` }]);
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(3);
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
  const worker = () => {
    const storage = testRepository([source], () => now, join(directory, "db"));
    cleanup.unshift(storage.close);
    const jev = new Jev("test-key");
    const analyze = vi.spyOn(jev, "analyze").mockResolvedValue({
      analysisStatus: "done",
      decision: "candidate",
    });
    const app = new Application(storage.repo, jev, new BufferClient(), {
      clock: () => now,
    });
    return { ...storage, app, analyze };
  };
  const a = worker();
  const b = worker();
  await a.repo.initialize();
  await b.repo.initialize();
  await a.repo.ingest(
    source,
    ["01", "02"].map((day, index) => ({
      ...item,
      url: `${item.url}/${index}`,
      publishedAt: `2026-09-${day}T00:00:00Z`,
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
  );

  it.each([
    ["a stored failure", "error", 1],
    ["a stored result", "done", 0],
  ] as const)(
    "never pays twice after a crash following %s",
    async (_name, status, failures) => {
      const { app, repo, analyze, advance, ids, now } = await autoSetup([
        "01",
        "02",
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
      expect(analyze).toHaveBeenCalledTimes(1);
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
    expect(await repo.getJob()).toMatchObject({ total: 100, progress: 1 });
    expect(analyze).toHaveBeenCalledTimes(1);
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
    const kinds: (string | null)[] = [];
    for (let tick = 0; tick < 40; tick += 1) {
      await app.scheduled();
      kinds.push((await repo.getJob()).kind);
      advance(60);
    }
    // 16 sources, then one batch of the three pending articles, then collection.
    expect(kinds.slice(0, 16).every((kind) => kind === "collect")).toBe(true);
    expect(kinds.slice(16, 19)).toEqual(["analyze", "analyze", "analyze"]);
    expect(kinds.slice(19, 35).every((kind) => kind === "collect")).toBe(true);
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
