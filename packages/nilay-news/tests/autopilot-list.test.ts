// SPDX-License-Identifier: MIT
/** Eligibility and list projections use bounded SQL and one settings revision. */
import { describe, expect, it } from "vitest";

import { Application } from "../src/application.ts";
import type { Article } from "../src/domain.ts";
import { ArticlePageConflictError } from "../src/errors.ts";
import { Jev } from "../src/jev/client.ts";
import { evidenceHash } from "../src/jev/evidence.ts";
import { BufferClient } from "../src/publishing/buffer-client.ts";

import { fakeClock } from "./helpers/clock.ts";
import { rssSource } from "./helpers/fixtures.ts";
import { testRepository } from "./helpers/storage.ts";

async function setup() {
  const clock = fakeClock(Date.UTC(2026, 10, 12, 2) / 1000);
  const source = rssSource({ id: "fixture" });
  const { repo, driver } = testRepository([source], clock.now);
  await repo.initialize();
  async function add(
    title: string,
    patch: Partial<Article> = {},
    ruled = false,
  ) {
    await repo.ingest(
      ruled ? { ...source, id: "clay-shooting-news" } : source,
      [
        {
          title,
          url: `https://example.org/${title}`,
          excerpt: "Evidence",
          publishedAt: new Date(clock.now() * 1000).toISOString(),
          ...patch,
        },
      ],
    );
    const article = (
      await repo.articlePage({ bucket: "all", query: title }, clock.now())
    ).articles.find((item) => item.title === title)!;
    if (patch.analysisStatus === "done")
      await repo.analyzeResult(
        article.id,
        await evidenceHash(await repo.article(article.id)),
        (await repo.settings()).rubric,
        { ...patch, analysisStatus: "done" },
      );
    if (patch.reviewStatus) await repo.review(article.id, patch.reviewStatus);
    return article.id;
  }
  return { repo, driver, clock, add };
}

describe("autopilot lists", () => {
  it.each(["saved", "candidates", "both"])(
    "matches counts and eligibility under %s selection",
    async (postSelection) => {
      const { repo, driver, clock, add } = await setup();
      const done = { analysisStatus: "done", decision: "candidate" } as const;
      const expected = new Map<string, boolean>();
      expected.set(await add("ordinary", done), postSelection !== "saved");
      expected.set(await add("ruled", {}, true), postSelection !== "saved");
      expected.set(
        await add("ruled-duplicate", { ...done, relation: "duplicate" }, true),
        postSelection !== "saved",
      );
      expected.set(
        await add(
          "ruled-irrelevant",
          { ...done, decision: "irrelevant" },
          true,
        ),
        postSelection !== "saved",
      );
      expected.set(
        await add("saved-irrelevant", {
          ...done,
          decision: "irrelevant",
          reviewStatus: "saved",
        }),
        postSelection !== "candidates",
      );
      expected.set(
        await add("saved-candidate", { ...done, reviewStatus: "saved" }),
        true,
      );
      expected.set(
        await add("approved", {
          ...done,
          decision: "review",
          relation: "duplicate",
          reviewStatus: "approved",
        }),
        true,
      );
      expected.set(
        await add("saved-uncertain", {
          ...done,
          relation: "uncertain",
          reviewStatus: "saved",
        }),
        false,
      );
      expected.set(
        await add("duplicate", { ...done, relation: "duplicate" }),
        false,
      );
      expected.set(
        await add("uncertain", { ...done, relation: "uncertain" }),
        false,
      );
      expected.set(
        await add("irrelevant", {
          ...done,
          decision: "irrelevant",
          reason: "対象外の可能性が高い（確度低）：理由",
        }),
        false,
      );
      expected.set(await add("review", { ...done, decision: "review" }), false);
      expected.set(await add("pending"), false);
      expected.set(
        await add("dismissed", { ...done, reviewStatus: "dismissed" }),
        false,
      );
      expected.set(
        await add("posted", { ...done, reviewStatus: "posted" }),
        false,
      );
      expected.set(
        await add("saved-pending", { reviewStatus: "saved" }),
        postSelection !== "candidates",
      );
      expected.set(
        await add(
          "saved-source",
          { ...done, relation: "duplicate", reviewStatus: "saved" },
          true,
        ),
        true,
      );
      for (const [title, publishedAt, metadata, fresh] of [
        [
          "boundary-exact",
          new Date((clock.now() - 86400) * 1000).toISOString(),
          {},
          true,
        ],
        [
          "stale",
          new Date((clock.now() - 86401) * 1000).toISOString(),
          {},
          false,
        ],
        ["undated", null, {}, false],
        ["future", new Date((clock.now() + 1) * 1000).toISOString(), {}, false],
        [
          "date-yesterday",
          "2026-11-11T00:00:00+09:00",
          { publicationPrecision: "date" },
          true,
        ],
        [
          "date-expired",
          "2026-11-10T00:00:00+09:00",
          { publicationPrecision: "date" },
          false,
        ],
      ] as const) {
        // Ingest history before it expires; ingestion rejects already stale items.
        const now = clock.now();
        clock.set(now - 3 * 86400);
        const id = await add(title, {
          ...done,
          reviewStatus: "saved",
          publishedAt,
          metadata,
        });
        clock.set(now);
        expected.set(id, fresh);
      }
      const alias = await add("alias", done);
      const postedAlias = await add("posted-alias", {
        ...done,
        reviewStatus: "posted",
      });
      await driver.batch([
        [
          "UPDATE news_articles SET data=json_set(data,'$.url',?) WHERE id=?",
          ["https://example.org/posted-alias", alias],
        ],
      ]);
      expected.set(alias, false);
      expected.set(postedAlias, false);
      await repo.review(postedAlias, "unread");
      await driver.batch([
        [
          "INSERT INTO news_posts(id,data) VALUES (?,?)",
          [postedAlias, JSON.stringify({ status: "posted" })],
        ],
      ]);

      const keyed = await add("keyed", {
        ...done,
        url: "https://example.org/posted-alias",
        sourceKey: "separate-notice",
      });
      expected.set(keyed, postSelection !== "saved");
      await repo.updateSettings({ autoPost: true });
      for (const status of [
        "posted",
        "submitted",
        "unknown",
        "failed",
        "publishing",
      ]) {
        const id = await add(`history-${status}`, done);
        await driver.batch([
          [
            "INSERT INTO news_posts(id,data) VALUES (?,?)",
            [id, JSON.stringify({ status })],
          ],
        ]);
        expected.set(id, false);
      }
      await repo.updateSettings({ postSelection });
      const all = await repo.articlePage(
        { bucket: "all", limit: 100 },
        clock.now(),
      );
      for (const article of all.articles)
        expect({ id: article.id, autoPost: article.autoPost }).toEqual({
          id: article.id,
          autoPost: expected.get(article.id),
        });
      const queued = await repo.articlePage(
        { bucket: "queued", limit: 100 },
        clock.now(),
      );
      expect(queued.articles.map((a) => a.id).sort()).toEqual(
        [...expected]
          .filter(([, yes]) => yes)
          .map(([id]) => id)
          .sort(),
      );
      const counts = await repo.articleCounts(clock.now());
      expect(counts.queued).toBe(queued.total);
      for (const [bucket, count] of Object.entries(counts.buckets))
        expect({
          bucket,
          total: (await repo.articlePage({ bucket, limit: 100 }, clock.now()))
            .total,
        }).toEqual({ bucket, total: count });
      expect(counts.buckets).toMatchObject({
        duplicate: 1,
        irrelevant: 1,
        review: 2,
        dismissed: 1,
      });
      // The global posting switch and unresolved posts do not promise a send time.
      await repo.updateSettings({ autoPost: false });
      expect(
        (await repo.articlePage({ bucket: "queued" }, clock.now())).total,
      ).toBe(queued.total);
    },
  );

  it("joins comparison summaries beyond the page and distinguishes confirmed history from attempts", async () => {
    const { repo, driver, clock, add } = await setup();
    const target = await add("comparison");
    const item = await add("duplicate", {
      analysisStatus: "done",
      decision: "candidate",
      relation: "duplicate",
      relatedArticleId: target,
    });
    const read = () =>
      repo.articlePage({ bucket: "duplicate", limit: 1 }, clock.now());
    expect((await read()).articles[0]).toMatchObject({
      id: item,
      relatedSummary: { id: target, title: "comparison", posted: false },
    });
    await repo.review(target, "posted");
    expect((await read()).articles[0]!.relatedSummary?.posted).toBe(true);
    await repo.review(target, "unread");
    for (const status of ["submitted", "unknown", "failed", "posted"]) {
      await driver.batch([
        [
          "INSERT OR REPLACE INTO news_posts(id,data) VALUES (?,?)",
          [target, JSON.stringify({ status })],
        ],
      ]);
      expect((await read()).articles[0]!.relatedSummary?.posted).toBe(
        status === "posted",
      );
    }
    const reads: { sql: string; rows: Record<string, unknown>[] }[] = [];
    const original = driver.batch.bind(driver);
    driver.batch = async (statements) => {
      const results = await original(statements);
      const index = statements.findIndex(([sql]) =>
        sql.includes("LEFT JOIN news_articles related"),
      );
      if (index >= 0)
        reads.push({
          sql: statements[index]![0],
          rows: results[index]!.results,
        });
      return results;
    };
    await read();
    expect(reads).toHaveLength(1);
    expect(reads[0]!.sql).toContain("page AS MATERIALIZED");
    expect(reads[0]!.sql).toContain("related.id=json_extract");
    expect(reads[0]!.rows).toHaveLength(1);
    expect(String(reads[0]!.rows[0]!.data)).not.toContain('"body"');
    await driver.batch([
      ["DELETE FROM news_posts WHERE id=?", [target]],
      ["DELETE FROM news_articles WHERE id=?", [target]],
    ]);
    expect((await read()).articles[0]!.relatedSummary).toBeNull();
  });

  it("supplies server eligibility for related navigation and returns null for a deleted target", async () => {
    const { repo, driver, clock, add } = await setup();
    const target = await add("target", {
      analysisStatus: "done",
      decision: "candidate",
    });
    const id = await add("uncertain", {
      analysisStatus: "done",
      decision: "candidate",
      relation: "uncertain",
      relatedArticleId: target,
    });
    const app = new Application(repo, new Jev(), new BufferClient(), {
      clock: clock.now,
    });
    expect((await app.article(id)).related).toMatchObject({
      id: target,
      autoPost: true,
    });
    await repo.updateSettings({ postSelection: "saved" });
    expect((await app.article(id)).related).toMatchObject({
      id: target,
      autoPost: false,
    });
    await repo.review(target, "saved");
    expect((await app.article(id)).related).toMatchObject({
      id: target,
      autoPost: true,
    });
    await driver.batch([["DELETE FROM news_articles WHERE id=?", [target]]]);
    expect((await app.article(id)).related).toBeNull();
  });

  it.each(["page", "counts"])(
    "rereads settings after a revision race in snapshot-free %s reads",
    async (kind) => {
      const { repo, driver, clock, add } = await setup();
      await add("candidate", { analysisStatus: "done", decision: "candidate" });
      const first = await repo.articlePage({ bucket: "queued" }, clock.now());
      const original = driver.batch.bind(driver);
      let reads = 0;
      driver.batch = async (statements) => {
        if (statements.some(([sql]) => sql.startsWith("WITH clock"))) {
          reads++;
          if (reads === 1)
            await repo.updateSettings({ postSelection: "saved" });
        }
        return original(statements);
      };
      const result =
        kind === "page"
          ? await repo.articlePage({ bucket: "queued" }, clock.now())
          : await repo.articleCounts(clock.now());
      expect(result).toMatchObject(
        kind === "page"
          ? { total: 0, articles: [] }
          : { queued: 0, buckets: { queued: 0 } },
      );
      expect(reads).toBe(2);
      await expect(
        repo.articlePage(
          { bucket: "queued", snapshot: first.snapshot },
          clock.now(),
        ),
      ).rejects.toBeInstanceOf(ArticlePageConflictError);
      expect(reads).toBe(3);
      expect(
        (await repo.articlePage({ bucket: "all" }, clock.now())).articles[0]!
          .autoPost,
      ).toBe(false);
    },
  );

  it.each(["page", "state"])(
    "absorbs a periodic revision update during a snapshot-free %s read",
    async (kind) => {
      const { repo, driver, clock, add } = await setup();
      await add("candidate", { analysisStatus: "done", decision: "candidate" });
      const app = new Application(repo, new Jev(), new BufferClient(), {
        clock: clock.now,
      });
      const original = driver.batch.bind(driver);
      let reads = 0;
      driver.batch = async (statements) => {
        if (statements.some(([sql]) => sql.startsWith("WITH clock"))) {
          reads++;
          if (reads === 1) await repo.queueJob("collect");
        }
        return original(statements);
      };
      const result =
        kind === "page"
          ? await app.articles({ bucket: "queued" })
          : await app.state();
      expect(result).toMatchObject(
        kind === "page"
          ? { total: 1, articles: [{ autoPost: true }] }
          : { stats: { queued: 1, buckets: { queued: 1 } } },
      );
      expect(reads).toBe(2);
    },
  );

  it.each(["page", "counts"])(
    "stops snapshot-free %s reads after three conflicting attempts",
    async (kind) => {
      const { repo, driver, clock } = await setup();
      const original = driver.batch.bind(driver);
      let reads = 0;
      driver.batch = async (statements) => {
        if (statements.some(([sql]) => sql.startsWith("WITH clock"))) {
          reads++;
          await original([
            ["UPDATE news_meta SET revision=revision+1 WHERE id=1", []],
          ]);
        }
        return original(statements);
      };
      await expect(
        kind === "page"
          ? repo.articlePage({}, clock.now())
          : repo.articleCounts(clock.now()),
      ).rejects.toBeInstanceOf(ArticlePageConflictError);
      expect(reads).toBe(3);
    },
  );

  it("does not retry a revision race when the client supplied a page snapshot", async () => {
    const { repo, driver, clock, add } = await setup();
    await add("candidate", { analysisStatus: "done", decision: "candidate" });
    const first = await repo.articlePage(
      { bucket: "queued", limit: 1 },
      clock.now(),
    );
    const original = driver.batch.bind(driver);
    let reads = 0;
    driver.batch = async (statements) => {
      if (statements.some(([sql]) => sql.startsWith("WITH clock"))) {
        reads++;
        await original([
          ["UPDATE news_meta SET revision=revision+1 WHERE id=1", []],
        ]);
      }
      return original(statements);
    };
    await expect(
      repo.articlePage(
        { bucket: "queued", offset: 1, snapshot: first.snapshot },
        clock.now(),
      ),
    ).rejects.toBeInstanceOf(ArticlePageConflictError);
    expect(reads).toBe(1);
  });

  it("keeps eligibility on the snapshot clock across the freshness boundary", async () => {
    const { repo, clock, add } = await setup();
    await add("boundary", {
      analysisStatus: "done",
      decision: "candidate",
      publishedAt: new Date((clock.now() - 86400 + 1) * 1000).toISOString(),
    });
    const first = await repo.articlePage({ bucket: "queued" }, clock.now());
    expect(first.total).toBe(1);
    clock.advance(2);
    expect(
      (
        await repo.articlePage(
          { bucket: "queued", snapshot: first.snapshot },
          clock.now(),
        )
      ).articles[0]?.autoPost,
    ).toBe(true);
    expect(
      (await repo.articlePage({ bucket: "queued" }, clock.now())).total,
    ).toBe(0);
    expect((await repo.articleCounts(clock.now())).queued).toBe(0);
    clock.advance(28);
    await expect(
      repo.articlePage(
        { bucket: "queued", snapshot: first.snapshot },
        clock.now(),
      ),
    ).rejects.toBeInstanceOf(ArticlePageConflictError);
  });
});
