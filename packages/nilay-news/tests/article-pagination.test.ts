// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it } from "vitest";

import { Application } from "../src/application.ts";
import { ArticlePageConflictError } from "../src/errors.ts";
import { Jev } from "../src/jev.ts";
import { BufferClient } from "../src/publishing.ts";
import type { SQLStatement } from "../src/storage/repository.ts";
import { createHandlers, type Env } from "../src/worker.ts";

import { testRepository } from "./helpers/storage.ts";

const source = {
  id: "fixture",
  name: "Fixture",
  description: "Fixture",
  kind: "rss" as const,
  enabled: true,
  url: "https://example.org/feed",
};
const clean: (() => void)[] = [];
afterEach(() => {
  for (const close of clean.splice(0)) close();
});
async function world(count = 151) {
  let now = Date.UTC(2026, 8, 30, 2) / 1000;
  const storage = testRepository([source], () => now);
  clean.push(storage.close);
  await storage.repo.initialize();
  await storage.repo.ingest(
    source,
    Array.from({ length: count }, (_, i) => ({
      title: `Article ${String(i).padStart(4, "0")}`,
      url: `https://example.org/${i}`,
      excerpt: "Evidence",
      body: `Body-only needle-${i} ${"Evidence ".repeat(1000)}`,
      publishedAt: new Date(now * 1000).toISOString(),
      attachments: [
        { title: `Attachment ${i}`, url: `https://example.org/document-${i}` },
      ],
      metadata: { documentTitle: `Metadata ${i}` },
    })),
  );
  const app = new Application(storage.repo, new Jev(), new BufferClient(), {
    clock: () => now,
  });
  return {
    ...storage,
    app,
    now: () => now,
    advance: (seconds: number) => {
      now += seconds;
    },
  };
}
describe("bounded article APIs", () => {
  it("pages stable ties without omissions, bounds list hydration, and exposes heavy details on demand", async () => {
    const { repo, app } = await world();
    const ids: string[] = [];
    let snapshot: string | undefined;
    for (let offset = 0; offset < 151; offset += 50) {
      const page = await app.articles({
        bucket: "inbox",
        limit: 50,
        offset,
        snapshot,
      });
      snapshot = page.snapshot;
      expect(page.articles.length).toBeLessThanOrEqual(50);
      expect(page.total).toBe(151);
      expect(
        page.articles.every(
          (a) => a.body === undefined && a.attachments === undefined,
        ),
      ).toBe(true);
      ids.push(...page.articles.map((a) => a.id));
    }
    expect(new Set(ids).size).toBe(151);
    expect(ids).toEqual([...ids].sort());
    const detail = await app.article(ids[0]!);
    expect(detail.body).toContain("Body-only");
    expect(detail.attachments).toHaveLength(1);
    expect(detail.postDraft).toContain(detail.url);
    expect(
      await repo.articlePage(
        { bucket: "inbox", query: "needle-150" },
        Date.UTC(2026, 8, 30, 2) / 1000,
      ),
    ).toMatchObject({ total: 1 });
    expect(
      await app.articles({ bucket: "inbox", query: "Attachment 150" }),
    ).toMatchObject({ total: 1 });
    expect(
      await app.articles({ bucket: "inbox", query: "Metadata 150" }),
    ).toMatchObject({ total: 1 });
  });
  it("rejects stale pagination after ingestion, review and a clock-only expiry", async () => {
    const { repo, app, advance } = await world();
    let first = await app.articles({});
    await repo.review(first.articles[0]!.id, "saved");
    await expect(
      app.articles({ offset: 50, snapshot: first.snapshot }),
    ).rejects.toBeInstanceOf(ArticlePageConflictError);
    first = await app.articles({});
    await repo.ingest(source, [
      {
        title: "new",
        url: "https://example.org/new",
        excerpt: "",
        publishedAt: new Date(Date.UTC(2026, 8, 30, 2)).toISOString(),
      },
    ]);
    await expect(
      app.articles({ offset: 50, snapshot: first.snapshot }),
    ).rejects.toBeInstanceOf(ArticlePageConflictError);
    first = await app.articles({});
    advance(86401);
    await expect(
      app.articles({ offset: 50, snapshot: first.snapshot }),
    ).rejects.toBeInstanceOf(ArticlePageConflictError);
    expect(await app.articles({})).toMatchObject({ total: 0 });
    expect((await app.state()).stats).toMatchObject({
      expired: 152,
      pending: 0,
      buckets: { inbox: 0, saved: 1, expired: 151 },
    });
  });
  it("preserves Unicode case matching and backfills older search projections", async () => {
    const { repo, driver, app, now } = await world(0);
    await repo.ingest(source, [
      {
        title: "ÄLTER ＡＢＣ",
        url: "https://example.org/unicode",
        excerpt: "",
        publishedAt: new Date(now() * 1000).toISOString(),
        metadata: { documentTitle: "ÉDITION" },
        attachments: [
          { title: "ÖFFENTLICH", url: "https://example.org/document" },
        ],
      },
    ]);
    for (const query of ["älter", "ａｂｃ", "édition", "öffentlich"])
      expect(await app.articles({ query })).toMatchObject({ total: 1 });
    await driver.batch([
      [
        "UPDATE news_articles SET data=json_remove(json_set(data,'$._publicationIndex',2),'$._listSearch')",
        [],
      ],
    ]);
    await repo.initialize();
    expect(await app.articles({ query: "älter" })).toMatchObject({ total: 1 });
    expect(
      (await repo.articlePage({ query: "älter" }, now())).articles[0],
    ).not.toHaveProperty("_listSearch");
  });
  it("reads only the review target and its publication, and keeps atomic bulk checks", async () => {
    const { repo, driver } = await world(1000);
    const first = (await repo.articlePage({}, Date.UTC(2026, 8, 30, 2) / 1000))
      .articles[0]!;
    const original = driver.batch.bind(driver);
    const reads: { sql: string; rows: number }[] = [];
    driver.batch = async (statements: SQLStatement[]) => {
      const result = await original(statements);
      statements.forEach(([sql], i) => {
        if (sql.startsWith("SELECT") && sql.includes("news_articles"))
          reads.push({ sql, rows: result[i]!.results.length });
      });
      return result;
    };
    await repo.review(first.id, "saved");
    expect(reads.reduce((n, r) => n + r.rows, 0)).toBe(1);
    expect(reads.every((r) => r.sql.includes("WHERE id IN"))).toBe(true);
    expect((await repo.article(first.id)).reviewStatus).toBe("saved");
    await repo.review(first.id, "posted");
    await expect(repo.reviewMany([first.id], "dismissed")).rejects.toThrow(
      "投稿済み",
    );
  });
  it("confirms and resolves one post without hydrating unrelated article or post history", async () => {
    const { repo, driver, now, advance } = await world(101);
    const articles = await repo.articles();
    const target = articles[0]!;
    await repo.review(target.id, "saved");
    await repo.updateSettings({ autoPost: true });
    advance(3601);
    const claim = await repo.claimPost(now());
    expect(claim?.articleId).toBe(target.id);
    await driver.batch(
      articles.slice(1).map((article): SQLStatement => [
        "INSERT INTO news_posts(id,data) VALUES (?,?)",
        [
          article.id,
          JSON.stringify({
            article_id: article.id,
            status: "posted",
            text: "unrelated history",
            attempted_at: new Date(now() * 1000).toISOString(),
            claim_token: "history",
            check_count: 0,
          }),
        ],
      ]),
    );
    const original = driver.batch.bind(driver);
    const rows: number[] = [];
    driver.batch = async (statements) => {
      const result = await original(statements);
      statements.forEach(([sql], index) => {
        if (sql.startsWith("SELECT") && /news_(?:articles|posts)/.test(sql))
          rows.push(result[index]!.results.length);
      });
      return result;
    };
    await repo.submitPost(
      target.id,
      "buffer-id",
      "channel",
      now(),
      claim!.claimToken,
    );
    await repo.deferPostCheck(target.id, claim!.claimToken, {
      timestamp: now(),
      remoteStatus: "sending",
    });
    advance(120);
    const checked = await repo.claimPostCheck(now());
    await repo.finishPost(target.id, "unknown", {
      claimToken: checked!.claim_token,
    });
    await repo.resolvePost(target.id, "posted");
    expect(rows.length).toBeGreaterThan(5);
    expect(Math.max(...rows)).toBe(1);
    driver.batch = original;
    expect((await repo.article(target.id)).reviewStatus).toBe("posted");
    expect((await repo.publicationState()).posts).toHaveLength(101);
  });
  it.each(["candidate", "review", "irrelevant", "pending", "error"])(
    "filters %s by current analysis rather than stale decisions",
    async (analysis) => {
      const { repo, app } = await world(0);
      const labels = ["candidate", "review", "irrelevant", "pending", "error"];
      for (const label of labels) {
        await repo.ingest({ ...source, id: "clay-shooting-news" }, [
          {
            title: label,
            url: `https://example.org/${label}`,
            excerpt: "",
            publishedAt: new Date(Date.UTC(2026, 8, 30, 2)).toISOString(),
          },
        ]);
        const article = (await repo.articles()).find((a) => a.title === label)!;
        await repo.analyzeResult(
          article.id,
          await repo.evidenceHash(article),
          (await repo.settings()).rubric,
          {
            analysisStatus: ["pending", "error"].includes(label)
              ? (label as "pending" | "error")
              : "done",
            decision: ["pending", "error"].includes(label)
              ? "candidate"
              : label,
          },
        );
      }
      expect(
        (await app.articles({ analysis })).articles.map((a) => a.title),
      ).toEqual([analysis]);
    },
  );

  it("combines text/topic/analysis/relation predicates and orders source rules with Jev by priority", async () => {
    const { repo, app } = await world(0);
    const fixtures = [
      {
        title: "北海道のクマ match",
        decision: "review",
        relation: "duplicate",
        topic: "鳥獣",
        priority: 0,
      },
      {
        title: "北海道のクマ uncertain",
        decision: "review",
        relation: "uncertain",
        topic: "鳥獣",
        priority: 0,
      },
      {
        title: "北海道のクマ candidate",
        decision: "candidate",
        relation: "duplicate",
        topic: "鳥獣",
        priority: 1,
      },
      {
        title: "射撃大会 other",
        decision: "review",
        relation: "duplicate",
        topic: "射撃",
        priority: 0,
      },
    ];
    for (const [index, result] of fixtures.entries()) {
      await repo.ingest(source, [
        {
          title: result.title,
          url: `https://example.org/case-${index}`,
          excerpt: "",
          publishedAt: new Date(Date.UTC(2026, 8, 30, 2)).toISOString(),
        },
      ]);
      const article = (await repo.articles()).find(
        (a) => a.title === result.title,
      )!;
      await repo.analyzeResult(
        article.id,
        await repo.evidenceHash(article),
        (await repo.settings()).rubric,
        { ...result, analysisStatus: "done" },
      );
    }
    expect(
      (
        await app.articles({
          query: "クマ",
          topic: "鳥獣",
          analysis: "review",
          relation: "duplicate",
        })
      ).articles.map((a) => a.title),
    ).toEqual([fixtures[0]!.title]);
    expect(
      (
        await app.articles({
          query: "クマ",
          topic: "鳥獣",
          analysis: "review",
          relation: "uncertain",
        })
      ).articles.map((a) => a.title),
    ).toEqual([fixtures[1]!.title]);
    await repo.ingest({ ...source, id: "clay-shooting-news" }, [
      {
        title: "ruled",
        url: "https://example.org/ruled",
        excerpt: "",
        publishedAt: new Date(Date.UTC(2026, 8, 30, 2) - 60000).toISOString(),
      },
    ]);
    const ruled = (await repo.articles()).find((a) => a.title === "ruled")!;
    await repo.analyzeResult(
      ruled.id,
      await repo.evidenceHash(ruled),
      (await repo.settings()).rubric,
      { analysisStatus: "done", decision: "irrelevant", priority: 2 },
    );
    const ranked = (await app.articles({ sort: "priority" })).articles.map(
      (a) => a.title,
    );
    expect(ranked.slice(0, 2)).toEqual(["ruled", fixtures[2]!.title]);
    const newest = (await app.articles({ sort: "newest" })).articles.map(
      (a) => a.title,
    );
    expect(newest.at(-1)).toBe("ruled");
  });

  it("returns lightweight status, bounded lists, details, validation and conflict HTTP responses", async () => {
    const { app, repo } = await world();
    const handlers = createHandlers(
      () => ({ allowed: async () => true }),
      async () => app,
    );
    const env = {} as Env;
    const get = (path: string) =>
      handlers.fetch(new Request(`https://news.example.test${path}`), env);
    const status = (await (await get("/api/state")).json()) as Record<
      string,
      unknown
    >;
    expect(status).not.toHaveProperty("articles");
    const list = (await (await get("/api/articles?limit=50")).json()) as {
      articles: { id: string }[];
      snapshot: string;
    };
    expect(list.articles).toHaveLength(50);
    expect((await get(`/api/articles/${list.articles[0]!.id}`)).status).toBe(
      200,
    );
    expect((await get("/api/articles?limit=101")).status).toBe(400);
    expect((await get("/api/articles?bucket=invalid")).status).toBe(400);
    await repo.review(list.articles[0]!.id, "saved");
    const stale = await get(
      `/api/articles?offset=50&snapshot=${list.snapshot}`,
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "article_page_conflict" });
  });
});
