// SPDX-License-Identifier: MIT
/**
 * Staggered automatic RSS collection through the real scheduler, SQLite
 * repository and crawl gate, with a fake transport instead of the network.
 */
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import { Application } from "../src/application.ts";
import { CachedFetch } from "../src/crawl.ts";
import { Jev } from "../src/jev.ts";
import { FetchError } from "../src/net/http.ts";
import type { FetchBytes } from "../src/net/types.ts";
import { BufferClient } from "../src/publishing.ts";
import { nextPhase } from "../src/schedule.ts";
import { loadSources } from "../src/sources/config.ts";
import { collection, type SourceConfig } from "../src/sources/types.ts";
import { SQLRepository } from "../src/storage/repository.ts";
import { utf8 } from "../src/text.ts";

import { testRepository } from "./helpers/storage.ts";

// 2026-09-28 00:00 JST is 2026-09-27 15:00 UTC.
const MIDNIGHT = Date.UTC(2026, 8, 27, 15) / 1000;
const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
/** Simulated time one feed request takes. */
const REQUEST = 2;

const BUNDLED = loadSources(
  JSON.parse(readFileSync(new URL("../sources.json", import.meta.url), "utf8")),
);
const OFFSET = BUNDLED.filter(
  (source) => source.collectionOffsetMinutes !== undefined,
);
const byId = (id: string): SourceConfig => {
  const source = BUNDLED.find((item) => item.id === id);
  if (!source) throw new Error(id);
  return source;
};
const YAHOO = ["yahoo-domestic", "yahoo-local", "yahoo-science"];
const GOOGLE = ["google-1", "google-2"];
const CEEK = ["ceek-1", "ceek-2", "ceek-3"];

function fake(id: string, changes: Partial<SourceConfig> = {}): SourceConfig {
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
  fake(id, { dailyAtJst: "11:00", minCollectionMinutes: 1440 });

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});

interface Request {
  url: string;
  at: number;
}

/**
 * The real stack over one SQLite database. Each collected source gets a
 * fresh CachedFetch, like production, whose transport records requests.
 */
async function world(
  sources: SourceConfig[],
  { start = MIDNIGHT, robots = true } = {},
) {
  let now = start;
  const clock = () => now;
  const storage = testRepository(sources, clock);
  cleanup.push(storage.close);
  let repo = storage.repo;
  await repo.initialize();
  // Steady state: robots.txt already cached, so pacing starts with the feed.
  if (robots)
    for (const origin of new Set(sources.map((s) => new URL(s.url).origin)))
      await repo.putRecord(
        "crawl_robots",
        origin,
        { rules: "" },
        { expiresAt: start + 7 * DAY },
      );
  const requests: Request[] = [];
  /** Per URL, errors to throw for the next requests instead of a response. */
  const failures = new Map<string, FetchError[]>();
  let inflight = 0;
  let maxInflight = 0;
  const transport: FetchBytes = async (url) => {
    inflight += 1;
    maxInflight = Math.max(maxInflight, inflight);
    try {
      await Promise.resolve();
      const at = now;
      now += REQUEST;
      if (url.endsWith("/robots.txt"))
        return {
          data: utf8("User-agent: *\nAllow: /\n"),
          url,
          contentType: "text/plain",
        };
      requests.push({ url, at });
      const failure = failures.get(url)?.shift();
      if (failure) throw failure;
      return {
        data: utf8("<rss><channel></channel></rss>"),
        url,
        contentType: "application/rss+xml",
      };
    } finally {
      inflight -= 1;
    }
  };
  const crawlOf = (repository: SQLRepository) => {
    const fresh = () =>
      new CachedFetch(repository, sources, {
        clock,
        transport,
        sleep: async (seconds) => {
          now += seconds;
        },
      });
    let current = fresh();
    return {
      beginSource: (source: SourceConfig) => {
        current = fresh();
        return current.beginSource(source);
      },
      fetch: (url: string) => current.fetch(url),
      endSource: (...args: Parameters<CachedFetch["endSource"]>) =>
        current.endSource(...args),
      nextDue: (source: SourceConfig) => current.nextDue(source),
    };
  };
  const appOf = (repository: SQLRepository) =>
    new Application(repository, new Jev(), new BufferClient(), {
      clock,
      collector: async (source, fetch) => {
        await fetch(source.url);
        return collection();
      },
      crawl: crawlOf(repository),
    });
  let app = appOf(repo);
  const urls = new Map(sources.map((source) => [source.url, source.id]));
  return {
    get repo() {
      return repo;
    },
    get app() {
      return app;
    },
    driver: storage.driver,
    requests,
    failures,
    maxInflight: () => maxInflight,
    now: () => now,
    appOf,
    /** Request times of a source. */
    times: (id: string) =>
      requests
        .filter((request) => urls.get(request.url) === id)
        .map((request) => request.at),
    /** A new process: a fresh repository object and application on the same database. */
    restart: async (changed = sources) => {
      repo = new SQLRepository(storage.driver, changed, clock);
      await repo.initialize();
      app = appOf(repo);
    },
    /** Minute Cron ticks from `from` (inclusive) to `to` (exclusive). */
    run: async (from: number, to: number, each?: (at: number) => unknown) => {
      for (let at = from; at < to; at += MINUTE) {
        now = Math.max(now, at);
        await each?.(at);
        await app.scheduled();
      }
    },
    autoCollectAt: async (id: string) => {
      const source = (await repo.sources()).find((item) => item.id === id);
      return source?.autoCollectAt
        ? Date.parse(source.autoCollectAt) / 1000
        : null;
    },
  };
}

function gaps(times: number[]): number[] {
  return times.slice(1).map((time, index) => time - (times[index] ?? 0));
}

function jst(epoch: number): string {
  return new Date((epoch + 9 * HOUR) * 1000).toISOString().slice(11, 19);
}

describe("JST phase slots", () => {
  it("rounds up to the next slot of a period dividing the day", () => {
    expect(nextPhase(MIDNIGHT, 0, 60)).toBe(MIDNIGHT);
    expect(nextPhase(MIDNIGHT + 1, 0, 60)).toBe(MIDNIGHT + HOUR);
    expect(nextPhase(MIDNIGHT + 5 * MINUTE, 20, 60)).toBe(
      MIDNIGHT + 20 * MINUTE,
    );
    expect(nextPhase(MIDNIGHT + 21 * MINUTE, 20, 60)).toBe(
      MIDNIGHT + HOUR + 20 * MINUTE,
    );
    expect(nextPhase(MIDNIGHT + 3 * HOUR, 160, 240)).toBe(
      MIDNIGHT + 4 * HOUR + 160 * MINUTE,
    );
    // Slots are anchored at JST, not UTC, midnight.
    expect(jst(nextPhase(MIDNIGHT - 10, 120, 240))).toBe("02:00:00");
    expect(jst(nextPhase(MIDNIGHT - 3 * HOUR, 120, 240))).toBe("22:00:00");
    expect(() => nextPhase(MIDNIGHT, 60, 60)).toThrow(RangeError);
    expect(() => nextPhase(MIDNIGHT, 0, 7)).toThrow(RangeError);
    expect(() => nextPhase(MIDNIGHT, 1.5, 60)).toThrow(RangeError);
  });
});

describe("staggered automatic RSS collection", () => {
  it("spreads Yahoo, Google and CEEK feeds over a whole day across a restart", async () => {
    const sources = [
      ...OFFSET,
      byId("tyoujuu-blog"),
      daily("daily-a"),
      daily("daily-b"),
    ];
    const w = await world(sources);
    await w.repo.updateSettings({ autoCollect: true, pollMinutes: 60 });
    await w.run(MIDNIGHT, MIDNIGHT + 12 * HOUR);
    // A new process keeps every stored phase.
    const before = await Promise.all(OFFSET.map((s) => w.autoCollectAt(s.id)));
    await w.restart();
    expect(await Promise.all(OFFSET.map((s) => w.autoCollectAt(s.id)))).toEqual(
      before,
    );
    await w.run(MIDNIGHT + 12 * HOUR, MIDNIGHT + DAY);

    expect(w.maxInflight()).toBe(1);
    for (const id of YAHOO) {
      const times = w.times(id);
      expect(times.length).toBeGreaterThanOrEqual(23);
      expect(times.length).toBeLessThanOrEqual(24);
      for (const gap of gaps(times)) {
        // One hour after the previous request ended, never earlier.
        expect(gap).toBeGreaterThanOrEqual(HOUR + REQUEST);
        expect(gap).toBeLessThanOrEqual(HOUR + 4 * MINUTE);
      }
    }
    for (const id of [...GOOGLE, ...CEEK]) {
      const times = w.times(id);
      expect(times.length).toBeGreaterThanOrEqual(5);
      expect(times.length).toBeLessThanOrEqual(6);
      for (const gap of gaps(times)) {
        expect(gap).toBeGreaterThanOrEqual(4 * HOUR + REQUEST);
        expect(gap).toBeLessThanOrEqual(4 * HOUR + 4 * MINUTE);
      }
    }
    // First requests at their JST offsets; three feeds due at 00:00 run one per tick.
    expect(w.times("google-1")[0]).toBe(MIDNIGHT);
    expect(w.times("ceek-1")[0]).toBe(MIDNIGHT + MINUTE);
    expect(w.times("yahoo-domestic")[0]).toBe(MIDNIGHT + 2 * MINUTE);
    expect(w.times("yahoo-local")[0]).toBe(MIDNIGHT + 20 * MINUTE);
    expect(w.times("yahoo-science")[0]).toBe(MIDNIGHT + 40 * MINUTE);
    expect(w.times("ceek-2")[0]).toBe(MIDNIGHT + 80 * MINUTE);
    expect(w.times("google-2")[0]).toBe(MIDNIGHT + 120 * MINUTE);
    expect(w.times("ceek-3")[0]).toBe(MIDNIGHT + 160 * MINUTE);
    // The spacing holds all day, within a few minutes of drift.
    const spacing = (a: string, b: string, minutes: number) => {
      const left = w.times(a);
      const right = w.times(b);
      const count = Math.min(left.length, right.length);
      expect(count).toBeGreaterThan(4);
      for (let n = 0; n < count; n += 1) {
        const apart = ((right[n] ?? 0) - (left[n] ?? 0)) / MINUTE;
        expect(apart).toBeGreaterThanOrEqual(minutes - 6);
        expect(apart).toBeLessThanOrEqual(minutes + 6);
      }
    };
    spacing("yahoo-domestic", "yahoo-local", 20);
    spacing("yahoo-local", "yahoo-science", 20);
    spacing("google-1", "google-2", 120);
    spacing("ceek-1", "ceek-2", 80);
    spacing("ceek-2", "ceek-3", 80);
    // Host pacing (30 minutes for Google and CEEK) always held.
    for (const group of [GOOGLE, CEEK]) {
      const times = group.flatMap((id) => w.times(id)).sort((a, b) => a - b);
      for (const gap of gaps(times)) expect(gap).toBeGreaterThanOrEqual(1800);
    }
    // The daily batch ran once from 11:00, and the hourly path kept its own source.
    for (const id of ["daily-a", "daily-b"]) {
      expect(w.times(id)).toHaveLength(1);
      expect(w.times(id)[0]).toBeGreaterThanOrEqual(MIDNIGHT + 11 * HOUR);
      expect(w.times(id)[0]).toBeLessThanOrEqual(
        MIDNIGHT + 11 * HOUR + 5 * MINUTE,
      );
    }
    expect(w.times("tyoujuu-blog")).toHaveLength(1);
    expect(w.times("tyoujuu-blog")[0]).toBeLessThan(MIDNIGHT + 10 * MINUTE);
  }, 120_000);

  it("never relaxes the real minimum for a nominal or stored time", async () => {
    const yahoo = byId("yahoo-domestic");
    const w = await world([yahoo]);
    // Collected by the previous hourly scheduler at 00:50 before deployment.
    await w.repo.putRecord("crawl_source", yahoo.id, {
      last_requested: MIDNIGHT + 50 * MINUTE,
    });
    await w.repo.updateSettings({ autoCollect: true });
    await w.run(MIDNIGHT + 55 * MINUTE, MIDNIGHT + 150 * MINUTE);
    // The real minimum is 01:50; do not round it to the 02:00 slot.
    expect(w.times(yahoo.id)).toEqual([MIDNIGHT + 110 * MINUTE]);
    // A time forced earlier cannot bypass the real source/URL gate either.
    await w.repo.updateSource(yahoo.id, {
      autoCollectAt: new Date((MIDNIGHT + 150 * MINUTE) * 1000).toISOString(),
    });
    await w.run(MIDNIGHT + 150 * MINUTE, MIDNIGHT + 171 * MINUTE);
    expect(w.times(yahoo.id)).toHaveLength(1);
    await w.run(MIDNIGHT + 171 * MINUTE, MIDNIGHT + 180 * MINUTE);
    expect(w.times(yahoo.id)).toEqual([
      MIDNIGHT + 110 * MINUTE,
      MIDNIGHT + 171 * MINUTE,
    ]);
  });

  it("resumes in staggered slots after a 403 or Retry-After", async () => {
    const sources = [...GOOGLE, ...YAHOO].map(byId);
    const w = await world(sources);
    w.failures.set(byId("google-1").url, [
      new FetchError("rate limited", 429, 3 * HOUR),
    ]);
    w.failures.set(byId("yahoo-local").url, [new FetchError("forbidden", 403)]);
    await w.repo.updateSettings({ autoCollect: true });
    await w.run(MIDNIGHT, MIDNIGHT + 8 * HOUR);
    // The host waits three hours; Google then resumes in its separate
    // 04:00 and 06:00 phases before keeping the normal four-hour rhythm.
    expect(w.times("google-1")).toEqual([
      MIDNIGHT,
      MIDNIGHT + 4 * HOUR + MINUTE,
    ]);
    const google2 = w.times("google-2");
    expect(google2).toEqual([MIDNIGHT + 6 * HOUR]);
    // 403 blocks the Yahoo host for a day: nothing is sent to it again.
    const blocked = MIDNIGHT + 20 * MINUTE + REQUEST + DAY;
    const yahoo = YAHOO.flatMap((id) => w.times(id));
    expect(yahoo.filter((at) => at > MIDNIGHT + 20 * MINUTE)).toEqual([]);
    for (const id of YAHOO)
      expect(await w.autoCollectAt(id)).toBeGreaterThanOrEqual(blocked);
    await w.run(MIDNIGHT + 8 * HOUR, MIDNIGHT + 11 * HOUR);
    const resumed = w.times("google-2");
    expect(resumed).toHaveLength(2);
    expect(gaps(resumed)[0]).toBeGreaterThanOrEqual(4 * HOUR + REQUEST);
    expect(gaps(resumed)[0]).toBeLessThanOrEqual(4 * HOUR + 2 * MINUTE);
    expect(
      YAHOO.flatMap((id) => w.times(id)).filter(
        (at) => at > MIDNIGHT + 20 * MINUTE,
      ),
    ).toEqual([]);
  });

  it("defers for a robots.txt refresh only until the host is free", async () => {
    const w = await world([byId("google-1")], { robots: false });
    await w.repo.updateSettings({ autoCollect: true });
    await w.run(MIDNIGHT, MIDNIGHT + 9 * HOUR);
    // robots.txt at 00:00 takes the 30-minute host interval; the feed follows
    // at 00:31 and then every four hours from there, never a whole period late.
    expect(w.times("google-1")).toEqual([
      MIDNIGHT + 31 * MINUTE,
      MIDNIGHT + 4 * HOUR + 32 * MINUTE,
      MIDNIGHT + 8 * HOUR + 33 * MINUTE,
    ]);
  });

  it("defers for host pacing only until the host is free", async () => {
    // Two Google feeds ten minutes apart share the 30-minute host interval.
    const sources = [
      byId("google-1"),
      { ...byId("google-2"), collectionOffsetMinutes: 10 },
    ];
    const w = await world(sources);
    await w.repo.updateSettings({ autoCollect: true });
    await w.run(MIDNIGHT, MIDNIGHT + 5 * HOUR);
    expect(w.times("google-1")).toEqual([MIDNIGHT, expect.any(Number)]);
    const later = w.times("google-2");
    expect(later).toHaveLength(2);
    expect(later[0]).toBeGreaterThanOrEqual(MIDNIGHT + 30 * MINUTE);
    expect(later[0]).toBeLessThanOrEqual(MIDNIGHT + 32 * MINUTE);
    expect(gaps(later)[0]).toBeLessThanOrEqual(4 * HOUR + 2 * MINUTE);
  });

  it("skips disabled feeds and re-phases them when enabled again", async () => {
    const w = await world(YAHOO.map(byId));
    await w.repo.updateSettings({ autoCollect: true });
    await w.repo.updateSource("yahoo-science", { enabled: false });
    await w.run(MIDNIGHT, MIDNIGHT + 3 * HOUR);
    expect(w.times("yahoo-science")).toEqual([]);
    await w.repo.updateSource("yahoo-science", { enabled: true });
    await w.repo.updateSource("yahoo-local", { enabled: false });
    await w.run(MIDNIGHT + 3 * HOUR + 5 * MINUTE, MIDNIGHT + 5 * HOUR);
    // Enabled at 03:05: the next 40-minute slot, not immediately.
    expect(w.times("yahoo-science")[0]).toBe(MIDNIGHT + 3 * HOUR + 40 * MINUTE);
    const local = w.times("yahoo-local");
    expect(local.every((at) => at < MIDNIGHT + 3 * HOUR)).toBe(true);
    // Re-enabled long after its stored time: back on its 20-minute phase.
    await w.repo.updateSource("yahoo-local", { enabled: true });
    await w.run(MIDNIGHT + 5 * HOUR + 30 * MINUTE, MIDNIGHT + 7 * HOUR);
    expect(
      w.times("yahoo-local").filter((at) => at > MIDNIGHT + 3 * HOUR),
    ).toEqual([MIDNIGHT + 6 * HOUR + 20 * MINUTE]);
  });

  it("serves a due feed inside a running daily batch, and waits for a manual job", async () => {
    const dailies = Array.from({ length: 25 }, (_, n) => daily(`daily-${n}`));
    const yahoo = [byId("yahoo-domestic"), byId("yahoo-local")];
    const w = await world([...yahoo, ...dailies], {
      start: MIDNIGHT + 10 * HOUR,
    });
    await w.repo.updateSettings({ autoCollect: true });
    await w.run(MIDNIGHT + 10 * HOUR + 50 * MINUTE, MIDNIGHT + 11 * HOUR);
    const eleven = MIDNIGHT + 11 * HOUR;
    await w.run(eleven, eleven + MINUTE);
    const first = await w.repo.getJob();
    // The feed due at 11:00 goes first, then the daily batch.
    expect(first).toMatchObject({
      automatic: true,
      dailyCollectionAt: eleven,
      workIds: ["yahoo-domestic", ...dailies.map((s) => s.id)],
    });
    await w.run(eleven + MINUTE, eleven + 40 * MINUTE);
    // yahoo-local joins the running batch at 11:20 ahead of the remaining dailies.
    expect(w.times("yahoo-domestic")).toEqual([eleven]);
    expect(w.times("yahoo-local")).toEqual([eleven + 20 * MINUTE]);
    for (const source of dailies) expect(w.times(source.id)).toHaveLength(1);
    expect(
      Math.max(...dailies.flatMap((source) => w.times(source.id))),
    ).toBeLessThanOrEqual(eleven + 28 * MINUTE);

    // A manual job holds the queue; it collects the feed once, and the
    // automatic time follows that real request.
    const noon = MIDNIGHT + 12 * HOUR;
    await w.run(eleven + 40 * MINUTE, noon + 19 * MINUTE);
    const before = w.times("yahoo-local").length;
    await w.app.start("collect");
    await w.run(noon + 19 * MINUTE, noon + 60 * MINUTE);
    const local = w.times("yahoo-local").slice(before - 1);
    expect(local).toHaveLength(2);
    expect(gaps(local)[0]).toBeGreaterThanOrEqual(HOUR + REQUEST);
    await w.run(noon + HOUR, noon + 2 * HOUR);
    for (const gap of gaps(w.times("yahoo-local")))
      expect(gap).toBeGreaterThanOrEqual(HOUR + REQUEST);
  });

  it("keeps one collection at a time with two concurrent schedulers", async () => {
    const sources = [...YAHOO, ...CEEK].map(byId);
    const w = await world(sources);
    await w.repo.updateSettings({ autoCollect: true });
    const other = w.appOf(new SQLRepository(w.driver, sources, w.now));
    await w.run(MIDNIGHT, MIDNIGHT + 5 * HOUR, async () => {
      await other.scheduled();
    });
    await w.run(MIDNIGHT + 5 * HOUR, MIDNIGHT + 6 * HOUR, () =>
      Promise.all([other.scheduled(), w.app.scheduled()]),
    );
    expect(w.maxInflight()).toBe(1);
    for (const id of YAHOO) {
      expect(w.times(id).length).toBeGreaterThanOrEqual(5);
      for (const gap of gaps(w.times(id)))
        expect(gap).toBeGreaterThanOrEqual(HOUR + REQUEST);
    }
    for (const id of CEEK) {
      expect(w.times(id)).toHaveLength(id === "ceek-3" ? 1 : 2);
      for (const gap of gaps(w.times(id)))
        expect(gap).toBeGreaterThanOrEqual(4 * HOUR + REQUEST);
    }
  });

  it("re-phases only a feed whose offset changed", async () => {
    const sources = YAHOO.map(byId);
    const w = await world(sources);
    await w.repo.updateSettings({ autoCollect: true });
    await w.run(MIDNIGHT, MIDNIGHT + 90 * MINUTE);
    const kept = await w.autoCollectAt("yahoo-domestic");
    await w.restart(
      sources.map((source) =>
        source.id === "yahoo-local"
          ? { ...source, collectionOffsetMinutes: 30 }
          : source,
      ),
    );
    const rows = await w.repo.sources();
    expect(rows.find((row) => row.id === "yahoo-local")).not.toHaveProperty(
      "autoCollectAt",
    );
    expect(await w.autoCollectAt("yahoo-domestic")).toBe(kept);
    await w.run(MIDNIGHT + 90 * MINUTE, MIDNIGHT + 4 * HOUR);
    // Last collected at 01:21:02; the new phase cannot bypass its real
    // 02:21:02 minimum. The next Cron is 02:22, then hourly from completion.
    const local = w.times("yahoo-local");
    expect(local.slice(0, 2)).toEqual([
      MIDNIGHT + 20 * MINUTE,
      MIDNIGHT + HOUR + 21 * MINUTE,
    ]);
    expect(local[2]).toBe(MIDNIGHT + 2 * HOUR + 22 * MINUTE);
  });
});

describe("offset queueing in the repository", () => {
  const yahoo = byId("yahoo-domestic");

  async function repository() {
    let now = MIDNIGHT;
    const storage = testRepository([yahoo, fake("rolling")], () => now);
    cleanup.push(storage.close);
    await storage.repo.initialize();
    return {
      repo: storage.repo,
      at: (epoch: number) => {
        now = epoch;
      },
    };
  }

  it("pre-empts an idle automatic analysis and leaves its articles pending", async () => {
    const { repo, at } = await repository();
    await repo.updateSettings({ autoCollect: false, autoAnalyze: true });
    await repo.ingest(fake("rolling"), [
      {
        title: "記事",
        url: "https://example.org/a",
        excerpt: "",
        publishedAt: new Date((MIDNIGHT - HOUR) * 1000).toISOString(),
      },
    ]);
    at(MIDNIGHT - 5 * MINUTE);
    expect(await repo.queueAutomaticJob(true)).toMatchObject({
      kind: "analyze",
    });
    await repo.updateSettings({ autoCollect: true });
    // A live lease is never replaced.
    at(MIDNIGHT);
    const claimed = await repo.claimJob(MIDNIGHT, 600);
    expect(await repo.queueAutomaticJob(true)).toBeNull();
    await repo.releaseJob(claimed?.token ?? "", {});
    const job = await repo.queueAutomaticJob(true);
    expect(job).toMatchObject({
      kind: "collect",
      automatic: true,
      workIds: [yahoo.id],
    });
    expect(job).not.toHaveProperty("dailyCollectionAt");
    expect((await repo.articles())[0]?.analysisStatus).toBe("pending");
    // Queued once: the same due feed does not replace its own job.
    expect(await repo.queueAutomaticJob(true)).toBeNull();
  });

  it("never replaces a manual job", async () => {
    const { repo, at } = await repository();
    await repo.updateSettings({ autoCollect: true });
    at(MIDNIGHT - 5 * MINUTE);
    const manual = await repo.queueJob("analyze", []);
    at(MIDNIGHT);
    expect(await repo.queueAutomaticJob(false)).toBeNull();
    expect((await repo.getJob()).id).toBe(manual.id);
  });

  it("keeps offset feeds out of the hourly collection", async () => {
    const { repo, at } = await repository();
    await repo.updateSettings({ autoCollect: true });
    at(MIDNIGHT + 5 * MINUTE);
    // yahoo-domestic is phased to 01:00; the hourly job is for the rolling source.
    const hourly = await repo.queueAutomaticJob(false);
    expect(hourly).toMatchObject({ kind: "collect", automatic: true });
    expect(hourly?.workIds).toBeUndefined();
    const [row] = await repo.sources();
    expect(row).toMatchObject({
      autoCollectAt: "2026-09-27T16:00:00+00:00",
      autoCollectPhase: "0/60",
    });
  });
});
