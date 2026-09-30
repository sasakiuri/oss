// SPDX-License-Identifier: MIT
/** Reproducible local D1 measurements; no remote credentials or outbound APIs. */
import { readFileSync, readdirSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { Miniflare } from "miniflare";

import { Application } from "../src/application.ts";
import { isSourceCandidate } from "../src/candidates.ts";
import { freshness, publicationWindow } from "../src/freshness.ts";
import { Jev } from "../src/jev.ts";
import { ACCOUNT, draft } from "../src/posts.ts";
import { BufferClient } from "../src/publishing.ts";
import {
  SQLRepository,
  type SQLStatement,
  type SQLRow,
} from "../src/storage/repository.ts";

const now = Date.UTC(2026, 8, 30, 2) / 1000;
const source = {
  id: "fixture",
  name: "Fixture",
  description: "Fixture",
  kind: "rss" as const,
  enabled: true,
  url: "https://example.org/feed",
};
const runtime = new Miniflare({
  cf: false,
  workers: [
    {
      config: {
        name: "article-benchmark",
        compatibilityDate: "2026-09-27",
        manifest: {
          mainModule: "worker.js",
          modules: {
            "worker.js": {
              type: "esm",
              contents:
                "export default {fetch(){return new Response('local benchmark')}}",
            },
          },
        },
        env: { DB: { type: "d1", id: "article-benchmark" } },
      },
    },
  ],
});
try {
  const db = await runtime.getD1Database("DB");
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    for (const sql of readFileSync(new URL(name, directory), "utf8")
      .split(";")
      .map((sql) => sql.trim())
      .filter(Boolean))
      await db.prepare(sql).run();
  let rowsRead = 0,
    rowsReturned = 0,
    queries = 0;
  const driver = {
    async batch(statements: SQLStatement[]) {
      const results = await db.batch(
        statements.map(([sql, values]) => db.prepare(sql).bind(...values)),
      );
      return results.map((result, index) => {
        queries++;
        rowsRead += result.meta.rows_read;
        if (
          statements[index]![0].includes("news_articles") &&
          (/^[\s]*SELECT (id,)?data/.test(statements[index]![0]) ||
            statements[index]![0].includes(" AS data"))
        )
          rowsReturned += result.results.length;
        return {
          results: result.results as SQLRow[],
          meta: { changes: result.meta.changes },
        };
      });
    },
  };
  const repo = new SQLRepository(driver, [source], () => now);
  await repo.initialize();
  const app = new Application(repo, new Jev(), new BufferClient(), {
    clock: () => now,
  });
  const results = [];
  for (const count of [1000, 10000]) {
    await db.prepare("DELETE FROM news_articles").run();
    const publishedAt = new Date((now - 60) * 1000).toISOString();
    const window = publicationWindow(publishedAt)!;
    for (let offset = 0; offset < count; offset += 25) {
      const rows = Array.from(
        { length: Math.min(25, count - offset) },
        (_, index) => {
          const id = (offset + index).toString(16).padStart(24, "0");
          return {
            id,
            data: JSON.stringify({
              id,
              _identity: `https://example.org/${id}`,
              title: `Article ${id}`,
              url: `https://example.org/${id}`,
              excerpt: "市が鳥獣被害対策を発表",
              body: "詳細なニュース本文。".repeat(200),
              sourceName: source.name,
              sourceIds: [source.id],
              publishedAt,
              discoveredAt: new Date(now * 1000).toISOString(),
              reviewStatus: "unread",
              analysisStatus: "pending",
              _publicationIndex: 2,
              _publicationSeconds: window.seconds,
              _publicationUntil: window.until,
              _publicationDate: window.date,
              _sourceCandidate: false,
              _listOrder: window.seconds,
            }),
          };
        },
      );
      await db
        .prepare(
          "INSERT INTO news_articles(id,data) SELECT json_extract(value,'$.id'),json_extract(value,'$.data') FROM json_each(?)",
        )
        .bind(JSON.stringify(rows))
        .run();
    }
    const measure = async (name: string, read: () => Promise<unknown>) => {
      const samples = [];
      for (let run = 0; run < 3; run++) {
        rowsRead = 0;
        rowsReturned = 0;
        queries = 0;
        const started = performance.now();
        const value = await read();
        samples.push({
          milliseconds: Number((performance.now() - started).toFixed(2)),
          responseBytes: Buffer.byteLength(JSON.stringify(value)),
          databaseRowsRead: rowsRead,
          articleRowsHydrated: rowsReturned,
          queries,
        });
      }
      return { name, samples };
    };
    const before = await measure("legacy all-article status", async () => {
      const articles = (await repo.articles()).map((article) => ({
        ...article,
        sourceCandidate: isSourceCandidate(article),
        freshness: freshness(
          article.publishedAt,
          now,
          article.metadata?.publicationPrecision,
        ),
        postDraft: draft(article),
      }));
      await repo.getRecord("scheduler", "analysis");
      return {
        articles,
        sources: await repo.sources(),
        job: await repo.getJob(),
        settings: {
          ...(await repo.settingsSnapshot()),
          jevConfigured: false,
          model: "jev-latest",
          slackConfigured: false,
          autoAnalyzePausedUntil: null,
        },
        publication: {
          ...(await repo.publicationState()),
          configured: false,
          account: ACCOUNT,
          provider: "Buffer",
          error: null,
          queued: (await repo.postCandidates()).length,
        },
        stats: {
          total: articles.length,
          pending: articles.length,
          expired: 0,
          dateReview: 0,
        },
      };
    });
    const after = await measure("status plus first bounded page", async () => ({
      status: await app.state(),
      page: await app.articles({ limit: 50 }),
    }));
    results.push({ articles: count, before, after });
  }
  process.stdout.write(
    JSON.stringify(
      {
        fixtureVersion: 1,
        clock: now,
        environment:
          "local Miniflare D1; timings do not predict deployed latency",
        results,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await runtime.dispose();
}
