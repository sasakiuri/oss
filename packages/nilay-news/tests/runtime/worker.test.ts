// SPDX-License-Identifier: MIT
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

import { build } from "esbuild";
import { Miniflare, Response as MiniflareResponse } from "miniflare";
import { describe, expect, it } from "vitest";

const origin = "https://news.example.test";
const config = {
  STORAGE_BACKEND: "d1",
  NILAY_PUBLIC_ORIGIN: origin,
  CF_ACCESS_TEAM_DOMAIN: "fixture.cloudflareaccess.com",
  CF_ACCESS_AUD: "fixture-audience",
  CF_ACCESS_ALLOWED_EMAILS: "reader@example.test",
};
const migrations = new URL("../../migrations/", import.meta.url);
/** Statements of every D1 migration in the order Wrangler applies them. */
const migrationFiles = readdirSync(migrations)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({
    name,
    sql: readFileSync(new URL(name, migrations), "utf8"),
  }));
const migration = migrationFiles.map((file) => file.sql).join(";\n");
async function bundle(entry: string) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    metafile: true,
  });
  return {
    script: result.outputFiles[0]!.text,
    inputs: Object.keys(result.metafile.inputs),
  };
}

function runtimeFor(
  script: string,
  bindings: Record<string, string>,
  storage = true,
) {
  return new Miniflare({
    cf: false,
    workers: [
      {
        config: {
          name: "nilay-news-test",
          compatibilityDate: "2026-09-27",
          manifest: {
            mainModule: "worker.js",
            modules: { "worker.js": { type: "esm", contents: script } },
          },
          env: {
            ...Object.fromEntries(
              Object.entries(bindings).map(([name, value]) => [
                name,
                { type: "text" as const, value },
              ]),
            ),
            ...(storage
              ? {
                  DB: { type: "d1" as const, id: "test" },
                  ASSETS: { type: "assets" as const },
                }
              : {}),
          },
          ...(storage
            ? {
                assets: {
                  directory: "./public",
                  runWorkerFirst: true,
                  hasUserWorker: true,
                },
              }
            : {}),
        },
        dev: {
          outboundService: {
            type: "fetcher",
            handler: () =>
              new MiniflareResponse("Unexpected external request", {
                status: 503,
              }),
          },
        },
      },
    ],
  });
}

function accessToken() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "runtime",
    alg: "RS256",
    use: "sig",
  };
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const content = `${encode({ alg: "RS256", kid: "runtime" })}.${encode({
    iss: "https://fixture.cloudflareaccess.com",
    aud: ["fixture-audience"],
    sub: "reader",
    email: "reader@example.test",
    iat: 1_800_999_900,
    exp: 1_801_010_000,
  })}`;
  const token = `${content}.${sign("RSA-SHA256", Buffer.from(content), privateKey).toString("base64url")}`;
  return { token, jwks: JSON.stringify({ keys: [jwk] }) };
}

/** The authenticated fixture Worker over a freshly migrated D1 database. */
async function fixtureRuntime() {
  const { token, jwks } = accessToken();
  const { script } = await bundle("tests/runtime/fixture.ts");
  const runtime = runtimeFor(script, { ...config, TEST_JWKS: jwks });
  const db = await runtime.getD1Database("DB");
  await db.batch(
    migration
      .split(";")
      .map((sql) => sql.trim())
      .filter(Boolean)
      .map((sql) => db.prepare(sql)),
  );
  const request = async (
    path: string,
    body?: object,
    headers: Record<string, string> = {},
  ) => {
    if (path === "/api/settings" && body) {
      const response = await runtime.dispatchFetch(origin + "/api/state", {
        headers: { "cf-access-jwt-assertion": token },
      });
      const snapshot = (await response.json()) as {
        settings: { revision: string };
      };
      body = { revision: snapshot.settings.revision, ...body };
    }
    return runtime.dispatchFetch(origin + path, {
      method: body ? "POST" : "GET",
      headers: {
        "cf-access-jwt-assertion": token,
        ...(body ? { "Content-Type": "application/json", Origin: origin } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  };
  return { runtime, request };
}

describe("real Worker, D1 and WebCrypto", () => {
  it("authenticates, collects durably, reviews and posts once through mocked APIs", async () => {
    const { runtime, request } = await fixtureRuntime();
    try {
      expect((await runtime.dispatchFetch(origin + "/")).status).toBe(403);
      expect((await runtime.dispatchFetch(origin + "/api/state")).status).toBe(
        403,
      );
      const page = await request("/");
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("Nilay");
      expect(page.headers.get("Content-Security-Policy")).toContain(
        "frame-ancestors 'none'",
      );
      expect(await (await request("/fixture/encodings")).json()).toEqual([
        "狩猟者への安全対策を発表しました",
        "狩猟者への安全対策を発表しました",
      ]);
      const initial = await request("/api/state");
      expect(initial.status).toBe(200);
      expect(
        (
          await request("/api/state", undefined, {
            "If-None-Match": initial.headers.get("ETag")!,
          })
        ).status,
      ).toBe(304);
      expect(
        (
          await request(
            "/api/collect",
            {},
            { Origin: "https://other.example.test" },
          )
        ).status,
      ).toBe(403);
      expect((await request("/api/collect", {})).status).toBe(202);
      const worker = await runtime.getWorker();
      await worker.scheduled({ cron: "* * * * *" });
      const state = (await (await request("/api/state")).json()) as {
        articles: { id: string; reviewStatus: string; postDraft: string }[];
        job: { running: boolean };
        settings: { autoPost: boolean };
        publication: { posts: { postId: string }[] };
      };
      expect(state.articles).toHaveLength(1);
      expect(state.job.running).toBe(false);
      const article = state.articles[0]!;
      expect(article.postDraft).toMatch(/\n#Fixture #クマ #鳥獣被害対策$/);
      expect(
        (
          await request(`/api/articles/${article.id}/review`, {
            status: "saved",
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await request(
            "/api/publication/preflight",
            {},
            { Origin: "https://other.example.test" },
          )
        ).status,
      ).toBe(403);
      const preflight = await request("/api/publication/preflight", {});
      expect(preflight.status).toBe(200);
      expect(await preflight.json()).toMatchObject({
        connectionVerified: true,
        autoPost: false,
        candidates: 1,
        firstCandidate: { articleId: article.id, text: article.postDraft },
        blockers: [],
        ready: true,
      });
      expect(await (await request("/fixture/calls")).json()).toEqual(["query"]);
      const checked = (await (
        await request("/api/state")
      ).json()) as typeof state;
      expect(checked.settings.autoPost).toBe(false);
      expect((await request("/api/settings", { autoPost: true })).status).toBe(
        200,
      );
      await request("/fixture/advance");
      await worker.scheduled({ cron: "* * * * *" });
      await worker.scheduled({ cron: "* * * * *" });
      const final = (await (
        await request("/api/state")
      ).json()) as typeof state;
      expect(final.articles[0]?.reviewStatus).toBe("posted");
      expect(final.publication.posts[0]?.postId).toBe("123");
      // Preflight, enabling and the send each verify the account first.
      expect(await (await request("/fixture/calls")).json()).toEqual([
        "query",
        "query",
        "query",
        "mutation",
      ]);
    } finally {
      await runtime.dispose();
    }
  });

  it("classifies collected articles automatically and stops after an API failure", async () => {
    const { runtime, request } = await fixtureRuntime();
    try {
      const worker = await runtime.getWorker();
      type State = {
        articles: { analysisStatus: string; reviewStatus: string }[];
        job: { running: boolean; kind: string; failed: number };
        settings: { autoAnalyze: boolean; autoAnalyzePausedUntil: number };
      };
      const state = async () =>
        (await (await request("/api/state")).json()) as State;
      expect((await state()).settings.autoAnalyze).toBe(false);
      expect(
        (
          await request("/api/settings", {
            autoCollect: true,
            autoAnalyze: true,
          })
        ).status,
      ).toBe(200);
      await worker.scheduled({ cron: "* * * * *" });
      expect((await state()).job).toMatchObject({
        running: false,
        kind: "collect",
      });
      expect(await (await request("/fixture/calls")).json()).toEqual([]);
      await worker.scheduled({ cron: "* * * * *" });
      const failed = await state();
      expect(failed.job).toMatchObject({
        running: false,
        kind: "analyze",
        failed: 1,
      });
      expect(failed.articles).toMatchObject([
        { analysisStatus: "error", reviewStatus: "unread" },
      ]);
      expect(failed.settings.autoAnalyzePausedUntil).toBeGreaterThan(0);
      // Neither the pause nor a later interval retries the failed article.
      await worker.scheduled({ cron: "* * * * *" });
      await request("/fixture/advance");
      await worker.scheduled({ cron: "* * * * *" });
      await worker.scheduled({ cron: "* * * * *" });
      expect(await (await request("/fixture/calls")).json()).toEqual(["jev"]);
      expect((await state()).articles).toMatchObject([
        { analysisStatus: "error" },
      ]);
    } finally {
      await runtime.dispose();
    }
  });

  it("classifies up to ten articles in sequence per scheduled invocation", async () => {
    const { runtime, request } = await fixtureRuntime();
    try {
      const worker = await runtime.getWorker();
      type State = {
        articles: { analysisStatus: string; decision: string | null }[];
        job: {
          running: boolean;
          kind: string;
          progress: number;
          total: number;
          token: string | null;
          error: string | null;
        };
        stats: { total: number; pending: number };
      };
      const state = async () =>
        (await (await request("/api/state")).json()) as State;
      const calls = async () =>
        (await (await request("/fixture/calls")).json()) as string[];
      await request("/fixture/classify");
      expect(
        (
          await request("/api/settings", {
            autoCollect: true,
            autoAnalyze: true,
          })
        ).status,
      ).toBe(200);
      await worker.scheduled({ cron: "* * * * *" });
      expect((await state()).stats).toEqual({
        total: 12,
        pending: 12,
        expired: 0,
        dateReview: 0,
      });
      expect(await calls()).toEqual([]);
      await worker.scheduled({ cron: "* * * * *" });
      const first = await state();
      expect(first.job).toMatchObject({
        running: true,
        kind: "analyze",
        progress: 10,
        total: 12,
        token: null,
        error: null,
      });
      expect(first.stats.pending).toBe(2);
      expect(await calls()).toEqual(Array.from({ length: 10 }, () => "jev"));
      await worker.scheduled({ cron: "* * * * *" });
      const final = await state();
      expect(final.job).toMatchObject({
        running: false,
        kind: "analyze",
        progress: 12,
        error: null,
      });
      expect(final.stats.pending).toBe(0);
      expect(
        final.articles.every((article) => article.decision === "irrelevant"),
      ).toBe(true);
      expect(await calls()).toHaveLength(12);
    } finally {
      await runtime.dispose();
    }
  });

  it("posts a due round of accumulated articles one by one across scheduled invocations", async () => {
    const { runtime, request } = await fixtureRuntime();
    try {
      const worker = await runtime.getWorker();
      type State = {
        articles: { id: string; reviewStatus: string; postDraft: string }[];
        publication: {
          posts: { articleId: string; status: string; text: string }[];
        };
      };
      const state = async () =>
        (await (await request("/api/state")).json()) as State;
      const calls = async () =>
        (await (await request("/fixture/calls")).json()) as string[];
      // Twelve fresh articles, saved for automatic posting.
      await request("/fixture/classify");
      expect((await request("/api/collect", {})).status).toBe(202);
      await worker.scheduled({ cron: "* * * * *" });
      const collected = await state();
      expect(collected.articles).toHaveLength(12);
      for (const article of collected.articles)
        expect(
          (
            await request(`/api/articles/${article.id}/review`, {
              status: "saved",
            })
          ).status,
        ).toBe(200);
      expect((await request("/api/settings", { autoPost: true })).status).toBe(
        200,
      );
      await worker.scheduled({ cron: "* * * * *" });
      expect((await state()).publication.posts).toEqual([]);
      await request("/fixture/advance");
      await worker.scheduled({ cron: "* * * * *" });
      expect((await state()).publication.posts).toHaveLength(10);
      await worker.scheduled({ cron: "* * * * *" });
      const final = await state();
      expect(
        final.articles.every((item) => item.reviewStatus === "posted"),
      ).toBe(true);
      const { posts } = final.publication;
      expect(posts.every((post) => post.status === "posted")).toBe(true);
      // Twelve separate posts, each with its own article's draft.
      expect(new Set(posts.map((post) => post.articleId)).size).toBe(12);
      expect(new Set(posts.map((post) => post.text)).size).toBe(12);
      for (const article of collected.articles)
        expect(posts.find((post) => post.articleId === article.id)?.text).toBe(
          article.postDraft,
        );
      // Each send checks the account and compares with up to three earlier posts.
      expect(await calls()).toEqual([
        "query",
        ...Array.from({ length: 12 }, (_, index) => [
          "query",
          ...Array.from({ length: Math.min(index, 3) }, () => "relation"),
          "mutation",
        ]).flat(),
      ]);
    } finally {
      await runtime.dispose();
    }
  });

  it("screens same-round duplicates through the application and D1 before Buffer receives them", async () => {
    const { runtime, request } = await fixtureRuntime();
    try {
      const worker = await runtime.getWorker();
      type State = {
        articles: {
          id: string;
          reviewStatus: string;
          relation?: string;
          relatedArticleId?: string;
        }[];
        publication: { posts: { articleId: string; status: string }[] };
      };
      const state = async () =>
        (await (await request("/api/state")).json()) as State;
      await request("/fixture/duplicates");
      await request("/api/collect", {});
      await worker.scheduled({ cron: "* * * * *" });
      const collected = await state();
      expect(collected.articles).toHaveLength(12);
      for (const article of collected.articles)
        await request(`/api/articles/${article.id}/review`, {
          status: "saved",
        });
      await request("/api/settings", { autoPost: true });
      await request("/fixture/advance");
      for (let tick = 0; tick < 12; tick += 1)
        await worker.scheduled({ cron: "* * * * *" });
      const final = await state();
      expect(final.publication.posts).toHaveLength(1);
      const posted = final.publication.posts[0]!;
      expect(posted.status).toBe("posted");
      expect(
        final.articles.filter((article) => article.relation === "duplicate"),
      ).toHaveLength(11);
      for (const article of final.articles.filter(
        (article) => article.id !== posted.articleId,
      ))
        expect(article).toMatchObject({
          reviewStatus: "saved",
          relation: "duplicate",
          relatedArticleId: posted.articleId,
        });
      const calls = (await (
        await request("/fixture/calls")
      ).json()) as string[];
      expect(calls.filter((call) => call === "mutation")).toHaveLength(1);
      expect(calls.filter((call) => call === "relation")).toHaveLength(11);
    } finally {
      await runtime.dispose();
    }
  });

  it("upgrades existing D1 settings with automatic classification disabled", async () => {
    const { script } = await bundle("src/local-worker.ts");
    const runtime = runtimeFor(script, { STORAGE_BACKEND: "d1" });
    const statements = (sql: string) =>
      sql
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean);
    try {
      const db = await runtime.getD1Database("DB");
      const [first, ...pending] = migrationFiles;
      await db.batch(statements(first!.sql).map((sql) => db.prepare(sql)));
      await db
        .prepare("INSERT INTO news_state(id,data) VALUES ('settings',?)")
        .bind(
          JSON.stringify({
            rubric: "既存の運用で使っている選定基準です",
            autoCollect: true,
            pollMinutes: 45,
            autoPost: false,
            postSelection: "saved",
          }),
        )
        .run();
      // A collection started by the old Worker is still waiting for its next slice.
      await db
        .prepare("INSERT INTO news_state(id,data) VALUES ('job',?)")
        .bind(
          JSON.stringify({
            id: "old-job",
            running: true,
            kind: "collect",
            articleIds: null,
            phase: "1/23 件完了・次の処理を待機中",
            progress: 1,
            total: 23,
            cursor: 0,
            error: null,
            warning: null,
            lastFinishedAt: null,
            token: null,
            leaseUntil: 0,
            workIds: ["fixture"],
            rubric: "既存の運用で使っている選定基準です",
            failed: 0,
            created: 0,
            limited: 0,
            deferred: 0,
          }),
        )
        .run();
      const base = "http://localhost:4317";
      // A Worker deployed before its migration fails instead of guessing.
      expect((await runtime.dispatchFetch(base + "/api/state")).status).toBe(
        503,
      );
      for (const file of pending)
        await db.batch(statements(file.sql).map((sql) => db.prepare(sql)));
      const state = await runtime.dispatchFetch(base + "/api/state");
      expect(state.status).toBe(200);
      const snapshot = (await state.json()) as {
        settings: { revision: string };
      };
      expect(snapshot).toMatchObject({
        settings: {
          rubric: "既存の運用で使っている選定基準です",
          autoCollect: true,
          pollMinutes: 45,
          autoAnalyze: false,
          autoPost: false,
          postSelection: "saved",
          jevConfigured: false,
        },
        job: {
          id: "old-job",
          running: true,
          automatic: false,
          kind: "collect",
          progress: 1,
          total: 23,
          workIds: ["fixture"],
        },
      });
      const enable = await runtime.dispatchFetch(base + "/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: base },
        body: JSON.stringify({
          revision: snapshot.settings.revision,
          autoAnalyze: true,
        }),
      });
      expect(enable.status).toBe(400);
    } finally {
      await runtime.dispose();
    }
  });

  it("excludes local/test entrypoints and fails closed with missing Access configuration", async () => {
    const { script, inputs } = await bundle("src/worker.ts");
    expect(
      inputs.some((path) =>
        /local-worker|tests\/|\.py$|\.env|\.dev\.vars/.test(path),
      ),
    ).toBe(false);
    const runtime = runtimeFor(script, { STORAGE_BACKEND: "d1" }, false);
    try {
      expect(
        (await runtime.dispatchFetch("http://localhost/api/state")).status,
      ).toBe(503);
      expect((await runtime.dispatchFetch(origin + "/")).status).toBe(503);
      const worker = await runtime.getWorker();
      expect((await worker.scheduled({ cron: "* * * * *" })).outcome).toBe(
        "exception",
      );
    } finally {
      await runtime.dispose();
    }
  });

  it("serves the local application while rejecting foreign hosts and origins", async () => {
    const { script } = await bundle("src/local-worker.ts");
    const runtime = runtimeFor(script, { STORAGE_BACKEND: "d1" });
    try {
      const db = await runtime.getD1Database("DB");
      await db.batch(
        migration
          .split(";")
          .map((sql) => sql.trim())
          .filter(Boolean)
          .map((sql) => db.prepare(sql)),
      );
      const base = "http://localhost:4317";
      expect((await runtime.dispatchFetch(base + "/")).status).toBe(200);
      const state = await runtime.dispatchFetch(base + "/api/state");
      expect(state.status).toBe(200);
      expect(await state.json()).toMatchObject({
        settings: { autoCollect: false, autoPost: false, jevConfigured: false },
      });
      expect(
        (await runtime.dispatchFetch("http://foreign.example.test/api/state"))
          .status,
      ).toBe(403);
      expect(
        (await runtime.dispatchFetch(base + "/__scheduled", { method: "POST" }))
          .status,
      ).toBe(403);
      expect(
        (
          await runtime.dispatchFetch(base + "/__scheduled", {
            method: "POST",
            headers: { Origin: "http://foreign.example.test" },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await runtime.dispatchFetch(base + "/__scheduled", {
            method: "POST",
            headers: { Origin: base },
          })
        ).status,
      ).toBe(204);
    } finally {
      await runtime.dispose();
    }
  });
});
