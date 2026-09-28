// SPDX-License-Identifier: MIT
/** Calendar precision survives storage and gates every automatic path. */
import { afterEach, describe, expect, it, vi } from "vitest";

import { Application } from "../src/application.ts";
import { Jev } from "../src/jev.ts";
import { POST_INTERVAL_SECONDS } from "../src/publication-policy.ts";
import { BufferClient, Publisher } from "../src/publishing.ts";
import type { CollectedItem, SourceConfig } from "../src/sources/types.ts";

import { testRepository } from "./helpers/storage.ts";

const NOON = Date.parse("2026-09-28T12:00:00+09:00") / 1000;
const source: SourceConfig = {
  id: "fixture",
  name: "日付検証",
  description: "日付検証",
  url: "https://example.org/feed",
  kind: "rss",
  enabled: true,
};
const dateOnly: CollectedItem = {
  title: "昨日の鳥獣対策を発表",
  url: "https://example.org/yesterday",
  excerpt: "",
  publishedAt: "2026-09-26T15:00:00Z",
  metadata: { publicationPrecision: "date" },
};
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});
async function setup() {
  let now = NOON;
  const store = testRepository([source], () => now);
  cleanup.push(store.close);
  await store.repo.initialize();
  return {
    ...store,
    clock: () => now,
    at: (t: number) => {
      now = t;
    },
  };
}
describe("calendar publication across automatic processing", () => {
  it("retains yesterday's date-only item but excludes the same instant with an exact timestamp", async () => {
    const { repo, clock } = await setup();
    expect(
      await repo.ingest(source, [
        dateOnly,
        { ...dateOnly, url: "https://example.org/exact", metadata: {} },
        {
          ...dateOnly,
          url: "https://example.org/two-days",
          publishedAt: "2026-09-25T15:00:00Z",
        },
      ]),
    ).toBe(1);
    const [article] = await repo.articles();
    await repo.review(article!.id, "saved");
    expect((await repo.postCandidates()).map((a) => a.id)).toEqual([
      article!.id,
    ]);
    const app = new Application(repo, new Jev(), new BufferClient(), { clock });
    expect((await app.state()).articles[0]).toMatchObject({
      freshness: "fresh",
    });
  });
  it("classifies a queued date-only yesterday item and skips it after the next JST midnight", async () => {
    const { repo, clock, at } = await setup();
    await repo.ingest(source, [dateOnly]);
    await repo.updateSettings({ autoAnalyze: true });
    const jev = new Jev("test-key");
    const analyze = vi
      .spyOn(jev, "analyze")
      .mockResolvedValue({ analysisStatus: "done", decision: "candidate" });
    const app = new Application(repo, jev, new BufferClient(), { clock });
    await app.scheduled();
    expect(analyze).toHaveBeenCalledTimes(1);
    const [article] = await repo.articles();
    expect((await repo.postCandidates()).map((a) => a.id)).toEqual([
      article!.id,
    ]);
    at(Date.parse("2026-09-29T00:00:00+09:00") / 1000);
    expect(await repo.postCandidates()).toEqual([]);
    expect((await app.state()).articles[0]).toMatchObject({
      freshness: "stale",
    });
  });
  it("keeps a date-only item unsent overnight and excludes it after the next JST midnight", async () => {
    const { repo, clock, at } = await setup();
    await repo.ingest(source, [dateOnly]);
    const [article] = await repo.articles();
    await repo.review(article!.id, "saved");
    await repo.updateSettings({ autoPost: true });
    const midnight = Date.parse("2026-09-29T00:00:00+09:00") / 1000;
    at(midnight - 1);
    const client = {
      channel: "test",
      verifyAccount: vi.fn(),
      post: vi.fn(),
      getPost: vi.fn(),
    };
    expect(await repo.postCandidates()).toHaveLength(1);
    const publisher = new Publisher(repo, client, clock);
    await publisher.tick();
    at(midnight);
    expect(await repo.postCandidates()).toEqual([]);
    at(midnight + 6 * 3600);
    await publisher.tick();
    expect(client.verifyAccount).not.toHaveBeenCalled();
    expect(client.post).not.toHaveBeenCalled();
    expect((await repo.publicationState()).posts).toEqual([]);
    expect((await repo.settings()).autoPost).toBe(true);
    expect(POST_INTERVAL_SECONDS).toBe(3600);
  });
  it("drops a date-only item from a round paused overnight after the next JST midnight", async () => {
    const { repo, clock, at } = await setup();
    await repo.ingest(source, [
      dateOnly,
      {
        ...dateOnly,
        url: "https://example.org/evening",
        publishedAt: "2026-09-28T20:00:00+09:00",
        metadata: {},
      },
    ]);
    for (const article of await repo.articles())
      await repo.review(article.id, "saved");
    await repo.updateSettings({ autoPost: true });
    const client = {
      channel: "test",
      verifyAccount: vi.fn(async () => undefined),
      post: vi.fn(async (text: string) => ({
        id: "buffer-1",
        channelId: "test",
        channelService: "twitter" as const,
        text,
        status: "sending" as const,
      })),
      getPost: vi.fn(async (_id: string, text: string) => ({
        id: "buffer-1",
        channelId: "test",
        channelService: "twitter" as const,
        text,
        status: "sent" as const,
      })),
    };
    const publisher = new Publisher(repo, client, clock);
    at(Date.parse("2026-09-28T22:59:00+09:00") / 1000);
    expect(await repo.postCandidates()).toHaveLength(2);
    await publisher.tick();
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post.mock.calls[0]?.[0]).toContain("/evening");
    // Confirmed after 23:00; the date-only item waits for the morning.
    at(Date.parse("2026-09-28T23:01:00+09:00") / 1000);
    await publisher.tick();
    expect(client.getPost).toHaveBeenCalledTimes(1);
    at(Date.parse("2026-09-29T06:00:00+09:00") / 1000);
    await publisher.tick();
    expect(client.post).toHaveBeenCalledTimes(1);
    const { posts } = await repo.publicationState();
    expect(posts.map((post) => post.status)).toEqual(["posted"]);
    expect(await repo.postCandidates()).toEqual([]);
    expect((await repo.settings()).autoPost).toBe(true);
  });
  it("keeps date precision when a later timestamp cannot replace the original date", async () => {
    const { repo } = await setup();
    await repo.ingest(source, [dateOnly]);
    await repo.ingest(source, [
      {
        ...dateOnly,
        publishedAt: "2026-09-28T03:00:00Z",
        metadata: { agency: "test" },
      },
    ]);
    const [article] = await repo.articles();
    expect(article).toMatchObject({
      publishedAt: dateOnly.publishedAt,
      metadata: { publicationPrecision: "date", agency: "test" },
    });
    await repo.review(article!.id, "saved");
    expect(await repo.postCandidates()).toHaveLength(1);
  });
  it("uses an actual publication time when it resolves the same calendar day", async () => {
    const { repo } = await setup();
    await repo.ingest(source, [dateOnly]);
    await repo.ingest(source, [
      { ...dateOnly, publishedAt: "2026-09-27T11:00:00Z", metadata: {} },
    ]);
    const [article] = await repo.articles();
    expect(article!.publishedAt).toBe("2026-09-27T11:00:00Z");
    expect(article!.metadata?.publicationPrecision).not.toBe("date");
    // Re-reading the date-only page cannot erase the already known exact time.
    await repo.ingest(source, [dateOnly]);
    expect((await repo.article(article!.id)).publishedAt).toBe(
      "2026-09-27T11:00:00Z",
    );
    expect(
      (await repo.article(article!.id)).metadata?.publicationPrecision,
    ).not.toBe("date");
  });
});
