// SPDX-License-Identifier: MIT
/** Analysis comparisons use posting eligibility without widening the existing window. */
import { describe, expect, it } from "vitest";

import type { Article, Settings } from "../src/domain.ts";
import { UserError } from "../src/errors.ts";
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
  const read = () => repo.relationPool(target, clock.now());
  return { repo, driver, clock, at, add, post, target, read };
}

const selections: Settings["postSelection"][] = ["saved", "candidates", "both"];
describe("analysis relation pool", () => {
  it.each(selections)(
    "selects posted or eligible coverage in %s mode",
    async (postSelection) => {
      const { repo, add, post, read } = await setup();
      await repo.updateSettings({ postSelection });
      add("candidate");
      add("saved", { reviewStatus: "saved", decision: "irrelevant" });
      add("saved-candidate", { reviewStatus: "saved" });
      add("approved", {
        reviewStatus: "approved",
        relation: "duplicate",
        decision: "irrelevant",
      });
      add("source", {
        sourceIds: ["clay-shooting-news"],
        analysisStatus: "pending",
        decision: null,
        relation: "uncertain",
      });
      add("saved-source", {
        sourceIds: ["clay-shooting-news"],
        reviewStatus: "saved",
        relation: "duplicate",
      });
      add("posted", { reviewStatus: "posted", relation: "uncertain" });
      add("confirmed", { relation: "duplicate" });
      post("confirmed", "posted");
      for (const relation of ["uncertain", "duplicate"] as const) {
        add(relation, { relation });
        add(`saved-${relation}`, { reviewStatus: "saved", relation });
      }
      add("pending", { analysisStatus: "pending", decision: null });
      add("review", { decision: "review" });
      add("dismissed", { reviewStatus: "dismissed" });
      for (const status of ["publishing", "submitted", "unknown", "failed"]) {
        add(status);
        post(status, status);
      }
      const expected = [
        "approved",
        "posted",
        "confirmed",
        "saved-candidate",
        "saved-source",
      ];
      if (postSelection !== "candidates") expected.push("saved");
      if (postSelection !== "saved") expected.push("candidate", "source");
      expect((await read()).map(({ id }) => id).sort()).toEqual(
        expected.sort(),
      );
    },
  );

  it("retains the unrelated exclusion where posting eligibility does not imply it", async () => {
    const { repo, clock, add, post, read } = await setup();
    await repo.updateSettings({ postSelection: "both" });
    add("source-irrelevant", {
      sourceIds: ["clay-shooting-news"],
      decision: "irrelevant",
    });
    add("record-irrelevant", { decision: "irrelevant" });
    post("record-irrelevant", "posted");
    add("saved-irrelevant", { reviewStatus: "saved", decision: "irrelevant" });
    expect(
      (await repo.articlePage({ bucket: "queued" }, clock.now())).articles.map(
        ({ id }) => id,
      ),
    ).toContain("source-irrelevant");
    expect((await read()).map(({ id }) => id)).toEqual(["saved-irrelevant"]);
  });

  it("uses the supplied clock and excludes missing, future and expired publication dates and URL aliases", async () => {
    const { repo, clock, at, add, post, target } = await setup();
    add("boundary", { publishedAt: at(-86400) });
    add("expired", { publishedAt: at(-86401) });
    add("future", { publishedAt: at(1) });
    add("undated", { publishedAt: null });
    add("alias", { url: "https://example.org/used" });
    add("used", {
      url: "https://example.org/used",
      publishedAt: at(-10 * 86400),
    });
    post("used", "submitted");
    expect(
      (await repo.relationPool(target, clock.now())).map(({ id }) => id),
    ).toEqual(["boundary"]);
    expect(await repo.relationPool(target, clock.now() + 2)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "future" })]),
    );
    expect(
      (await repo.relationPool(target, clock.now() + 2)).map(({ id }) => id),
    ).not.toContain("boundary");
  });

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

  it("filters in SQL before the 2000-row limit and strips unused comparison fields", async () => {
    const { driver, at, add, read } = await setup();
    add("posted", { publishedAt: at(-2 * 86400), reviewStatus: "posted" });
    for (let index = 0; index < 2100; index++) {
      add(`blocked-${index}`, { publishedAt: at(-100), relation: "uncertain" });
      add(`eligible-${String(index).padStart(4, "0")}`, {
        body: "Comparison evidence",
        metadata: { note: "kept" },
        postScreening: null,
      });
    }
    const reads: { sql: string; count: number }[] = [];
    const original = driver.batch.bind(driver);
    driver.batch = async (statements) => {
      const result = await original(statements);
      statements.forEach(([sql], index) => {
        if (sql.includes("FROM news_articles"))
          reads.push({ sql, count: result[index]!.results.length });
      });
      return result;
    };
    const pool = await read();
    expect(pool).toHaveLength(2000);
    expect(pool[0]!.id).toBe("posted");
    expect(pool.at(-1)!.id).toBe("eligible-1998");
    expect(pool[1]).toMatchObject({
      body: "Comparison evidence",
      metadata: { note: "kept" },
    });
    expect(pool[1]).not.toHaveProperty("postScreening");
    expect(pool[1]).not.toHaveProperty("_listSearch");
    expect(reads).toEqual([
      { sql: expect.stringContaining("LIMIT ?"), count: 2000 },
    ]);
  });

  it("rereads the settings after a revision race", async () => {
    const { repo, driver, add, read } = await setup();
    add("candidate");
    const original = driver.batch.bind(driver);
    let reads = 0;
    driver.batch = async (statements) => {
      if (statements.some(([sql]) => sql.includes("FROM news_articles"))) {
        reads++;
        if (reads === 1) await repo.updateSettings({ postSelection: "saved" });
      }
      return original(statements);
    };
    expect(await read()).toEqual([]);
    expect(reads).toBe(2);
  });

  it("fails explicitly after three conflicting reads", async () => {
    const { driver, read } = await setup();
    const original = driver.batch.bind(driver);
    let reads = 0;
    driver.batch = async (statements) => {
      if (statements.some(([sql]) => sql.includes("FROM news_articles"))) {
        reads++;
        await original([
          ["UPDATE news_meta SET revision=revision+1 WHERE id=1", []],
        ]);
      }
      return original(statements);
    };
    await expect(read()).rejects.toBeInstanceOf(UserError);
    expect(reads).toBe(3);
  });
});
