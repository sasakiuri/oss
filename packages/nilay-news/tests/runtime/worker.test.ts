// SPDX-License-Identifier: MIT
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";

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
const migration = readFileSync(
  new URL("../../migrations/0001_news.sql", import.meta.url),
  "utf8",
);
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

describe("real Worker, D1 and WebCrypto", () => {
  it("authenticates, collects durably, reviews and posts once through mocked APIs", async () => {
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
    const { script } = await bundle("tests/runtime/fixture.ts");
    const runtime = runtimeFor(script, {
      ...config,
      TEST_JWKS: JSON.stringify({ keys: [jwk] }),
    });
    try {
      const db = await runtime.getD1Database("DB");
      await db.batch(
        migration
          .split(";")
          .map((sql) => sql.trim())
          .filter(Boolean)
          .map((sql) => db.prepare(sql)),
      );
      const request = (
        path: string,
        body?: object,
        headers: Record<string, string> = {},
      ) =>
        runtime.dispatchFetch(origin + path, {
          method: body ? "POST" : "GET",
          headers: {
            "cf-access-jwt-assertion": token,
            ...(body
              ? { "Content-Type": "application/json", Origin: origin }
              : {}),
            ...headers,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
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
        publication: { posts: { postId: string }[] };
      };
      expect(state.articles).toHaveLength(1);
      expect(state.job.running).toBe(false);
      const article = state.articles[0]!;
      expect(article.postDraft).toContain("#NilayNews");
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
      await request("/fixture/advance");
      await worker.scheduled({ cron: "* * * * *" });
      await worker.scheduled({ cron: "* * * * *" });
      const final = (await (
        await request("/api/state")
      ).json()) as typeof state;
      expect(final.articles[0]?.reviewStatus).toBe("posted");
      expect(final.publication.posts[0]?.postId).toBe("123");
      expect(await (await request("/fixture/calls")).json()).toEqual([
        "query",
        "mutation",
      ]);
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
