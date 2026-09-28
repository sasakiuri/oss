// SPDX-License-Identifier: MIT
/** Fixed 11:00 JST collection through the real scheduler, repository and crawl gate. */
import { afterEach, describe, expect, it, vi } from "vitest";

import { Application } from "../src/application.ts";
import { CachedFetch } from "../src/crawl.ts";
import { Jev } from "../src/jev.ts";
import { BufferClient } from "../src/publishing.ts";
import { dailySlot, nextDailyRun } from "../src/schedule.ts";
import type { SourceConfig } from "../src/sources/types.ts";

import { testRepository } from "./helpers/storage.ts";

// 2026-09-28 11:00 JST is 02:00 UTC.
const ELEVEN = Date.UTC(2026, 8, 28, 2) / 1000;
const DAY = 86400;
const MINUTE = 60;

function feed(id: string, changes: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id,
    name: id,
    description: id,
    url: `https://example.org/${id}`,
    kind: "rss",
    enabled: true,
    ...changes,
  };
}
const daily = (id: string) =>
  feed(id, { dailyAtJst: "11:00", minCollectionMinutes: 1440 });
/** Like the 鳥獣ニュース roundup: a rolling 24-hour source. */
const rolling = feed("roundup", { minCollectionMinutes: 1440 });

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});

async function setup(sources: SourceConfig[], jev = new Jev()) {
  let now = ELEVEN - DAY;
  const clock = () => now;
  const storage = testRepository(sources, clock);
  cleanup.push(storage.close);
  const repo = storage.repo;
  await repo.initialize();
  const collected: string[] = [];
  let serial = 0;
  const collector = vi.fn(async (source: SourceConfig) => {
    collected.push(source.id);
    serial += 1;
    return {
      items: [
        {
          title: `${source.id} の記事 ${serial}`,
          url: `https://example.org/${source.id}/${serial}`,
          excerpt: "",
          publishedAt: new Date((ELEVEN - 4 * MINUTE) * 1000).toISOString(),
        },
      ],
      warnings: [] as string[],
      notes: [] as string[],
    };
  });
  const crawl = new CachedFetch(repo, sources, {
    clock,
    transport: () => Promise.reject(new Error("unexpected network")),
  });
  const app = new Application(repo, jev, new BufferClient(), {
    clock,
    collector,
    crawl,
  });
  return {
    repo,
    app,
    collected,
    now: () => now,
    at: (epoch: number) => {
      now = epoch;
    },
    /** Run one scheduler tick at `epoch`. */
    tick: async (epoch: number) => {
      now = epoch;
      await app.scheduled();
    },
  };
}

describe("fixed daily JST helpers", () => {
  it("uses fixed UTC+9 slots", () => {
    expect(dailySlot(ELEVEN - 1, "11:00")).toBe(ELEVEN);
    expect(new Date(dailySlot(ELEVEN, "11:00") * 1000).toISOString()).toBe(
      "2026-09-28T02:00:00.000Z",
    );
    // 00:30 JST belongs to the new JST day even though UTC is still the previous date.
    const halfPastMidnight = ELEVEN + 13 * 3600 + 30 * MINUTE;
    expect(dailySlot(halfPastMidnight, "11:00")).toBe(ELEVEN + DAY);
    expect(nextDailyRun(ELEVEN - 1, "11:00", null)).toBe(ELEVEN);
    expect(nextDailyRun(ELEVEN, "11:00", null)).toBe(ELEVEN);
    expect(
      nextDailyRun(ELEVEN + 3600, "11:00", ELEVEN - DAY + 17 * MINUTE),
    ).toBe(ELEVEN);
    expect(nextDailyRun(ELEVEN + 3600, "11:00", ELEVEN + 17 * MINUTE)).toBe(
      ELEVEN + DAY,
    );
  });
});

describe("fixed daily collection", () => {
  it("starts at 11:00 JST independently of the regular interval, one source per tick", async () => {
    const { repo, collected, tick } = await setup([
      daily("kanpo"),
      daily("env"),
      feed("rss"),
      rolling,
    ]);
    await repo.updateSettings({ autoCollect: true, pollMinutes: 60 });
    await tick(ELEVEN - 2 * MINUTE);
    await tick(ELEVEN - MINUTE);
    // Regular automatic collection leaves the daily sources out.
    expect(collected).toEqual(["rss", "roundup"]);
    await tick(ELEVEN - 1);
    expect(collected).toHaveLength(2);
    // The regular interval is not due until 11:58, but the daily batch starts.
    await tick(ELEVEN);
    const started = await repo.getJob();
    expect(started).toMatchObject({
      running: true,
      automatic: true,
      kind: "collect",
      dailyCollectionAt: ELEVEN,
      workIds: ["kanpo", "env"],
      total: 2,
      progress: 1,
    });
    // The partial batch continues instead of being re-queued.
    await tick(ELEVEN + MINUTE);
    expect(await repo.getJob()).toMatchObject({
      id: started.id,
      running: false,
      progress: 2,
      error: null,
    });
    expect(collected).toEqual(["rss", "roundup", "kanpo", "env"]);
    for (let minute = 2; minute < 58; minute += 1)
      await tick(ELEVEN + minute * MINUTE);
    expect(collected).toHaveLength(4);
    // The regular hourly run collects RSS; the rolling 24-hour source waits.
    await tick(ELEVEN + 58 * MINUTE);
    await tick(ELEVEN + 59 * MINUTE);
    expect(collected).toEqual(["rss", "roundup", "kanpo", "env", "rss"]);
    const roundup = (await repo.sources()).find(
      (source) => source.id === "roundup",
    );
    expect(roundup?.nextFetchAt).toBe("2026-09-29T01:59:00+00:00");
    const kanpo = (await repo.sources()).find(
      (source) => source.id === "kanpo",
    );
    expect(kanpo?.lastFetchedAt).toBe("2026-09-28T02:00:00+00:00");
  });

  it("keeps 11:00 after a late run and catches up only the current day", async () => {
    const { repo, collected, tick } = await setup([
      daily("kanpo"),
      feed("rss"),
    ]);
    await repo.updateSettings({ autoCollect: true, pollMinutes: 1440 });
    // The first run after deployment starts late at 11:17.
    await tick(ELEVEN - DAY + 17 * MINUTE);
    await tick(ELEVEN - DAY + 18 * MINUTE);
    expect(collected).toEqual(["kanpo", "rss"]);
    await tick(ELEVEN - 1);
    expect(collected).toHaveLength(2);
    await tick(ELEVEN);
    expect(collected).toEqual(["kanpo", "rss", "kanpo"]);
    // Three days are missed; 10:00 runs regular collection only.
    await tick(ELEVEN + 4 * DAY - 3600);
    expect(collected).toEqual(["kanpo", "rss", "kanpo", "rss"]);
    for (let minute = 0; minute < 5; minute += 1)
      await tick(ELEVEN + 4 * DAY + minute * MINUTE);
    expect(collected).toEqual(["kanpo", "rss", "kanpo", "rss", "kanpo"]);
  });

  it("queues nothing before 11:00 when only daily sources are enabled", async () => {
    const { repo, collected, tick } = await setup([daily("kanpo")]);
    await repo.updateSettings({ autoCollect: true, pollMinutes: 15 });
    const version = await repo.stateVersion();
    await tick(ELEVEN - 3600);
    await tick(ELEVEN - 1);
    expect(await repo.stateVersion()).toBe(version);
    expect((await repo.getJob()).running).toBe(false);
    await tick(ELEVEN);
    expect(collected).toEqual(["kanpo"]);
  });

  it("interrupts idle automatic classification between items and resumes it afterwards", async () => {
    const jev = new Jev("test-key");
    const analyzed: string[] = [];
    vi.spyOn(jev, "analyze").mockImplementation(async (article) => {
      analyzed.push(article.id);
      return { analysisStatus: "done", decision: "candidate" };
    });
    const { repo, collected, tick } = await setup(
      [daily("kanpo"), feed("rss")],
      jev,
    );
    const source = feed("rss");
    await repo.ingest(
      source,
      Array.from({ length: 60 }, (_, index) => ({
        title: `既存記事 ${index}`,
        url: `https://example.org/existing/${index}`,
        excerpt: "",
        publishedAt: new Date((ELEVEN - 4 * MINUTE) * 1000).toISOString(),
      })),
    );
    const reviewed = (await repo.articles()).at(-1)!;
    await repo.review(reviewed.id, "saved");
    await repo.updateSettings({
      autoCollect: true,
      autoAnalyze: true,
      pollMinutes: 60,
    });
    await tick(ELEVEN - 3 * MINUTE);
    await tick(ELEVEN - 2 * MINUTE);
    await tick(ELEVEN - MINUTE);
    const batch = await repo.getJob();
    // Each invocation classifies up to ten articles.
    expect(batch).toMatchObject({
      kind: "analyze",
      running: true,
      progress: 20,
    });
    await tick(ELEVEN);
    expect(analyzed).toHaveLength(20);
    expect(collected).toEqual(["rss", "kanpo"]);
    expect(await repo.getJob()).toMatchObject({
      kind: "collect",
      dailyCollectionAt: ELEVEN,
      running: false,
    });
    // Classification resumes with the articles still pending; none is sent twice.
    await tick(ELEVEN + MINUTE);
    await tick(ELEVEN + 2 * MINUTE);
    expect(await repo.getJob()).toMatchObject({
      kind: "analyze",
      running: true,
    });
    expect(analyzed).toHaveLength(40);
    expect(new Set(analyzed).size).toBe(40);
    expect((await repo.article(reviewed.id)).reviewStatus).toBe("saved");
  });

  it("interrupts a classification run at 11:00 and collects one daily source per invocation", async () => {
    const jev = new Jev("test-key");
    const analyzed: string[] = [];
    const context = await setup(
      [daily("kanpo"), daily("env"), feed("rss")],
      jev,
    );
    const { repo, collected, tick, now, at } = context;
    // Before 11:00 each classification takes 5 seconds.
    vi.spyOn(jev, "analyze").mockImplementation(async (article) => {
      analyzed.push(article.id);
      if (now() < ELEVEN) at(now() + 5);
      return { analysisStatus: "done", decision: "candidate" };
    });
    await repo.ingest(
      feed("rss"),
      Array.from({ length: 30 }, (_, index) => ({
        title: `既存記事 ${index}`,
        url: `https://example.org/existing/${index}`,
        excerpt: "",
        publishedAt: new Date((ELEVEN - 4 * MINUTE) * 1000).toISOString(),
      })),
    );
    await repo.updateSettings({
      autoCollect: true,
      autoAnalyze: true,
      pollMinutes: 60,
    });
    await tick(ELEVEN - 3 * MINUTE);
    expect(collected).toEqual(["rss"]);
    expect(analyzed).toHaveLength(0);
    // Articles start at 10:59:40, :45, :50 and :55; 11:00 is due before the fifth.
    await tick(ELEVEN - 20);
    expect(analyzed).toHaveLength(4);
    expect(collected).toEqual(["rss", "kanpo"]);
    expect(await repo.getJob()).toMatchObject({
      kind: "collect",
      automatic: true,
      dailyCollectionAt: ELEVEN,
      workIds: ["kanpo", "env"],
      running: true,
      token: null,
      progress: 1,
    });
    // The daily batch continues one source per invocation before classification.
    await tick(ELEVEN + MINUTE);
    expect(collected).toEqual(["rss", "kanpo", "env"]);
    expect(analyzed).toHaveLength(4);
    expect((await repo.getJob()).running).toBe(false);
    await tick(ELEVEN + 2 * MINUTE);
    expect(collected).toHaveLength(3);
    expect(analyzed).toHaveLength(14);
    expect(new Set(analyzed).size).toBe(14);
  });

  it("retains manual jobs and does not fetch a source twice in one day", async () => {
    const { app, repo, collected, tick } = await setup([
      daily("kanpo"),
      daily("env"),
      feed("rss"),
    ]);
    await repo.updateSettings({ autoCollect: true, pollMinutes: 1440 });
    await tick(ELEVEN - 2 * MINUTE);
    expect(collected).toEqual(["rss"]);
    const manual = await app.start("collect");
    // Before 11:00 the manual job defers the first daily source.
    await tick(ELEVEN - MINUTE);
    expect(collected).toEqual(["rss"]);
    expect(await repo.getJob()).toMatchObject({ id: manual.id, deferred: 1 });
    // At 11:00 the manual job is kept and claims the next daily source itself.
    await tick(ELEVEN);
    expect(await repo.getJob()).toMatchObject({ id: manual.id, progress: 2 });
    await tick(ELEVEN + MINUTE);
    expect(await repo.getJob()).toMatchObject({
      id: manual.id,
      running: false,
    });
    // Only the source the manual job deferred remains for today's batch.
    await tick(ELEVEN + 2 * MINUTE);
    expect(await repo.getJob()).toMatchObject({ workIds: ["kanpo"] });
    for (let minute = 3; minute < 10; minute += 1)
      await tick(ELEVEN + minute * MINUTE);
    expect(collected.filter((id) => id === "kanpo")).toHaveLength(1);
    expect(collected.filter((id) => id === "env")).toHaveLength(1);
  });

  it("waits for a live lease and fences the replaced job's stale owner", async () => {
    const { repo, at } = await setup([
      daily("kanpo"),
      feed("rss"),
      feed("atom"),
    ]);
    await repo.updateSettings({ autoCollect: true, pollMinutes: 60 });
    at(ELEVEN - MINUTE);
    const regular = await repo.queueAutomaticJob(false);
    const claimed = await repo.claimJob(ELEVEN - MINUTE, 600);
    const token = claimed?.token ?? "";
    await repo.updateJob(token, {
      workIds: ["rss", "atom"],
      total: 2,
      progress: 1,
      rubric: "基準",
      failed: 0,
      created: 0,
      limited: 0,
      deferred: 0,
    });
    // At 11:00 the lease is still live, so the regular job keeps running.
    at(ELEVEN);
    expect(await repo.queueAutomaticJob(false)).toBeNull();
    expect((await repo.getJob()).id).toBe(regular?.id);
    // Once the lease has expired, the daily batch replaces it and keeps its remaining source.
    at(ELEVEN + 10 * MINUTE);
    const replaced = await repo.queueAutomaticJob(false);
    expect(replaced).toMatchObject({
      automatic: true,
      dailyCollectionAt: ELEVEN,
      workIds: ["kanpo", "atom"],
      progress: 0,
      total: 2,
      token: null,
    });
    expect(replaced?.id).not.toBe(regular?.id);
    await expect(repo.updateJob(token, { progress: 2 })).rejects.toThrow(
      "所有権",
    );
    await expect(
      repo.putRecord(
        "scheduler",
        "collection",
        { nextAt: 0 },
        { jobToken: token },
      ),
    ).rejects.toThrow("所有権");
    // The daily marker cannot be rewritten by a job owner.
    const owner = await repo.claimJob(ELEVEN + 10 * MINUTE, 600);
    await expect(
      repo.updateJob(owner?.token ?? "", { dailyCollectionAt: 0 }),
    ).rejects.toThrow("所有権");
    // A live daily lease is not replaced either.
    expect(await repo.queueAutomaticJob(false)).toBeNull();
    expect((await repo.getJob()).id).toBe(replaced?.id);
  });
});
