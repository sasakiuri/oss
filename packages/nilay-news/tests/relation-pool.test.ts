// SPDX-License-Identifier: MIT
/** Analysis comparisons use posting eligibility without widening the existing window. */
import { describe, expect, it } from "vitest";

import type { Article, Settings } from "../src/domain.ts";
import { indexArticle } from "../src/storage/article-content.ts";

import { fakeClock } from "./helpers/clock.ts";
import { articleFixture } from "./helpers/fixtures.ts";
import { testRepository } from "./helpers/storage.ts";

async function setup() {
  const clock = fakeClock(Date.UTC(2026, 10, 12, 2) / 1000);
  const { repo, driver } = testRepository([], clock.now);
  await repo.initialize();
  const at = (offset: number) =>
    new Date((clock.now() + offset) * 1000).toISOString();
  const insert = driver.db.prepare(
    "INSERT INTO news_articles(id,data) VALUES (?,?)",
  );
  function add(id: string, changes: Partial<Article> = {}) {
    const article = articleFixture({
      id,
      title: `記事 ${id}`,
      url: `https://example.org/${id}`,
      publishedAt: at(-3600),
      discoveredAt: at(-3000),
      analysisStatus: "done",
      decision: "candidate",
      relation: null,
      ...changes,
    });
    const indexed = { ...article };
    indexArticle(indexed);
    insert.run(id, JSON.stringify(indexed));
    return article;
  }
  function post(id: string, status: string) {
    driver.db
      .prepare("INSERT INTO news_posts(id,data) VALUES (?,?)")
      .run(id, JSON.stringify({ status }));
  }
  const target = add("target", { publishedAt: at(-60) });
  const read = () => repo.relationPool(target);
  return { repo, driver, clock, at, add, post, target, read };
}

describe("analysis relation pool", () => {
  it.each(["saved", "candidates", "both"] as Settings["postSelection"][])(
    "keeps earlier coverage independently of %s selection",
    async (postSelection) => {
      const { repo, add, post, at, read } = await setup();
      await repo.updateSettings({ postSelection });
      add("pending", { analysisStatus: "pending", decision: null });
      add("uncertain", { relation: "uncertain" });
      add("duplicate", { relation: "duplicate", relatedArticleId: "missing" });
      add("expired", { publishedAt: at(-2 * 86400) });
      add("dismissed", { reviewStatus: "dismissed" });
      add("saved", { reviewStatus: "saved", decision: "irrelevant" });
      add("approved", { reviewStatus: "approved", decision: "irrelevant" });
      add("posted", { reviewStatus: "posted", decision: "irrelevant" });
      add("irrelevant", { decision: "irrelevant" });
      add("source-irrelevant", {
        sourceIds: ["clay-shooting-news"],
        decision: "irrelevant",
      });
      add("record-irrelevant", { decision: "irrelevant" });
      post("record-irrelevant", "posted");
      expect((await read()).map(({ id }) => id).sort()).toEqual([
        "approved",
        "dismissed",
        "duplicate",
        "expired",
        "pending",
        "posted",
        "saved",
        "uncertain",
      ]);
    },
  );

  it("keeps the seven-day boundary and the existing posted-first chronological order", async () => {
    const { at, add, post, target, read } = await setup();
    const listed = Date.parse(target.publishedAt!) / 1000;
    add("week", {
      publishedAt: new Date((listed - 7 * 86400) * 1000).toISOString(),
      reviewStatus: "posted",
    });
    add("too-old", {
      publishedAt: new Date((listed - 7 * 86400 - 1) * 1000).toISOString(),
      reviewStatus: "posted",
    });
    add("posted-later", { publishedAt: at(2 * 86400), reviewStatus: "posted" });
    add("earlier");
    add("later", { publishedAt: at(-30) });
    add("record-only-later", { publishedAt: at(2 * 86400) });
    post("record-only-later", "posted");
    // Record-only confirmations do not widen the existing chronological exception.
    expect((await read()).map(({ id }) => id)).toEqual([
      "week",
      "posted-later",
      "earlier",
      "later",
    ]);
  });

  it("keeps the original order and 2000-row limit without displacing new stopped coverage", async () => {
    const { add, at, read, driver } = await setup();
    add("posted", { reviewStatus: "posted", publishedAt: at(-2 * 86400) });
    add("bridge", {
      publishedAt: at(-100),
      relation: "duplicate",
      relatedArticleId: "absent",
    });
    for (let i = 0; i < 2100; i++)
      add(`old-${String(i).padStart(4, "0")}`, {
        body: "Comparison evidence",
        metadata: { note: "kept" },
        postScreening: null,
      });
    const original = driver.batch.bind(driver);
    const statements: { sql: string; rows: number }[] = [];
    driver.batch = async (batch) => {
      const results = await original(batch);
      batch.forEach(([sql], i) =>
        statements.push({ sql, rows: results[i]!.results.length }),
      );
      return results;
    };
    const pool = await read();
    expect(pool).toHaveLength(2000);
    expect(pool.slice(0, 3).map(({ id }) => id)).toEqual([
      "posted",
      "bridge",
      "old-0000",
    ]);
    expect(pool.at(-1)!.id).toBe("old-1997");
    expect(pool[2]).toMatchObject({
      body: "Comparison evidence",
      metadata: { note: "kept" },
    });
    expect(pool[2]).not.toHaveProperty("postScreening");
    expect(pool[2]).not.toHaveProperty("_listSearch");
    expect(statements).toEqual([
      { sql: expect.stringContaining("LIMIT ?"), rows: 2000 },
    ]);
    expect(statements[0]!.sql).not.toContain("relationRoot");
    expect(statements[0]!.sql).not.toContain("news_state");
  });
});
