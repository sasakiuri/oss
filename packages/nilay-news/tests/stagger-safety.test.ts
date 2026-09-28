// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it } from "vitest";

import type { SourceConfig } from "../src/sources/types.ts";

import { testRepository } from "./helpers/storage.ts";

const START = Date.parse("2026-09-28T00:00:00+09:00") / 1000;
const close: (() => void)[] = [];
afterEach(() => close.splice(0).forEach((fn) => fn()));
const source = (id: string, period = 240, offset = 0): SourceConfig => ({
  id,
  name: id,
  description: id,
  kind: "rss",
  enabled: true,
  url: `https://example.org/${id}`,
  minCollectionMinutes: period,
  collectionOffsetMinutes: offset,
});

describe("staggered scheduler recovery safety", () => {
  it("does not round a completed request a second time into an eight-hour gap", async () => {
    const feed = source("feed");
    const storage = testRepository([feed], () => START + 600);
    close.push(storage.close);
    await storage.repo.initialize();
    await storage.repo.putRecord("crawl_source", feed.id, {
      last_requested: START + 10,
    });
    await storage.repo.updateSettings({ autoCollect: true });
    await storage.repo.queueAutomaticJob(false);
    expect(
      Date.parse((await storage.repo.sources())[0]!.autoCollectAt!) / 1000,
    ).toBe(START + 4 * 3600 + 10);
  });
  it("rejects expired and replaced job owners before they move a source's next run", async () => {
    let now = START;
    const feed = source("feed");
    const storage = testRepository([feed], () => now);
    close.push(storage.close);
    const repo = storage.repo;
    await repo.initialize();
    await repo.queueJob("collect");
    const first = await repo.claimJob(now, 60);
    await repo.scheduleAutoCollection(feed.id, START + 1000, first!.token!);
    const before = (await repo.sources())[0]!.autoCollectAt;
    now += 61;
    await expect(
      repo.scheduleAutoCollection(feed.id, START + 20000, first!.token!),
    ).rejects.toThrow(/所有権|有効期限/);
    expect((await repo.sources())[0]!.autoCollectAt).toBe(before);
    const next = await repo.claimJob(now, 60);
    await repo.scheduleAutoCollection(feed.id, START + 1500, next!.token!);
    await expect(
      repo.scheduleAutoCollection(feed.id, START + 30000, first!.token!),
    ).rejects.toThrow(/所有権|有効期限/);
    expect(Date.parse((await repo.sources())[0]!.autoCollectAt!) / 1000).toBe(
      START + 1500,
    );
  });
  it("spreads resumption after a shared host block across the next phase slots", async () => {
    const feeds = [
      source("a", 60, 0),
      source("b", 60, 20),
      source("c", 60, 40),
    ];
    const storage = testRepository(feeds, () => START);
    close.push(storage.close);
    const repo = storage.repo;
    await repo.initialize();
    await repo.putRecord("crawl_host", "example.org", {
      blocked_until: START + 86400 + 34 * 60,
    });
    for (const feed of feeds)
      await repo.putRecord("crawl_source", feed.id, {
        last_requested: 0,
        retry_at: START + 86400 + 34 * 60,
      });
    await repo.updateSettings({ autoCollect: true });
    await repo.queueAutomaticJob(false);
    expect(
      (await repo.sources()).map(
        (row) => Date.parse(row.autoCollectAt!) / 1000,
      ),
    ).toEqual([
      START + 86400 + 60 * 60,
      START + 86400 + 80 * 60,
      START + 86400 + 40 * 60,
    ]);
  });
});
