// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from "vitest";

import { Application } from "../src/application.ts";
import { Jev } from "../src/jev.ts";
import { BufferClient } from "../src/publishing.ts";
import { createHandlers, type Env } from "../src/worker.ts";

import { testRepository } from "./helpers/storage.ts";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});
async function setup(clock = () => 1_800_000_000) {
  const storage = testRepository([], clock);
  cleanup.push(storage.close);
  await storage.repo.initialize();
  const app = new Application(storage.repo, new Jev(), new BufferClient(), {
    clock,
  });
  const handlers = createHandlers(
    () => ({ allowed: async () => true }),
    async () => app,
  );
  const env = {
    ASSETS: { fetch: async () => new Response("Asset") },
  } as unknown as Env;
  const request = (
    path: string,
    body: string,
    contentType = "application/json",
  ) =>
    handlers.fetch(
      new Request("https://news.example.test" + path, {
        method: "POST",
        headers: { "content-type": contentType },
        body,
      }),
      env,
    );
  return { ...storage, app, handlers, env, request };
}

describe("HTTP contract", () => {
  it.each(["", "null", "[]", "true", "{"])(
    "rejects a non-object or malformed JSON body (%j)",
    async (body) => {
      const { request } = await setup();
      expect((await request("/api/settings", body)).status).toBe(400);
    },
  );
  it("rejects the wrong content type and oversized bodies", async () => {
    const { request } = await setup();
    expect((await request("/api/settings", "{}", "text/plain")).status).toBe(
      415,
    );
    expect(
      (
        await request(
          "/api/settings",
          JSON.stringify({ rubric: "x".repeat(65536) }),
        )
      ).status,
    ).toBe(413);
  });
  it("rejects unknown resources and unavailable classification", async () => {
    const { request } = await setup();
    expect((await request("/api/analyze", "{}")).status).toBe(409);
    expect(
      (
        await request(
          `/api/articles/${"a".repeat(24)}/review`,
          '{"status":"saved"}',
        )
      ).status,
    ).toBe(404);
    expect((await request("/api/missing", "{}")).status).toBe(404);
  });
  it("validates automatic classification settings", async () => {
    const { request, repo } = await setup();
    const missingKey = await request("/api/settings", '{"autoAnalyze":true}');
    expect(missingKey.status).toBe(400);
    expect(await missingKey.json()).toEqual({
      error: "自動仕分けには Jev の API キーを設定してください",
    });
    expect(
      (await request("/api/settings", '{"autoAnalyze":"yes"}')).status,
    ).toBe(400);
    expect(
      (await request("/api/settings", '{"autoAnalyze":false}')).status,
    ).toBe(200);
    expect((await repo.settings()).autoAnalyze).toBe(false);
  });
  it("dismisses selected articles through the authenticated JSON API", async () => {
    const { request, repo, env } = await setup();
    await repo.ingest(
      {
        id: "test",
        name: "test",
        url: "https://example.org/feed",
        kind: "rss",
        enabled: true,
        description: "test",
      },
      ["a", "b", "c"].map((id) => ({
        title: id,
        url: `https://example.org/${id}`,
        excerpt: "",
        publishedAt: null,
      })),
    );
    const ids = (await repo.articles()).map((article) => article.id);
    const body = JSON.stringify({ articleIds: ids.slice(0, 2) });
    const app = vi.fn<(env: Env) => Promise<Application>>();
    const denied = createHandlers(() => ({ allowed: async () => false }), app);
    expect(
      (
        await denied.fetch(
          new Request("https://news.example.test/api/articles/dismiss", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          }),
          env,
        )
      ).status,
    ).toBe(403);
    expect(app).not.toHaveBeenCalled();
    expect(
      (await request("/api/articles/dismiss", body, "text/plain")).status,
    ).toBe(415);
    for (const invalid of ["{}", '{"articleIds":[]}', '{"articleIds":[42]}'])
      expect((await request("/api/articles/dismiss", invalid)).status).toBe(
        400,
      );
    const response = await request("/api/articles/dismiss", body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      ids
        .slice(0, 2)
        .map((id) =>
          expect.objectContaining({ id, reviewStatus: "dismissed" }),
        ),
    );
    expect((await repo.article(ids[2]!)).reviewStatus).toBe("unread");
  });
  it.each(["individual", "bulk", "retry"])(
    "recovers a failed Google draft through the %s API",
    async (mode) => {
      let now = 10_000;
      const { request, repo, app } = await setup(() => now);
      await repo.ingest(
        {
          id: "test",
          name: "test",
          url: "https://example.org/feed",
          kind: "rss",
          enabled: true,
          description: "test",
        },
        [
          {
            title: "記事",
            url: "https://news.google.com/rss/articles/old",
            excerpt: "",
            publishedAt: new Date(now * 1000).toISOString(),
          },
        ],
      );
      const id = (await repo.articles())[0]!.id;
      await repo.review(id, "saved");
      await repo.updateSettings({ autoPost: true });
      now += 3600;
      expect(await repo.claimPost(now)).toBeNull();
      expect((await app.state()).publication.posts[0]?.failedBeforeSend).toBe(
        true,
      );
      const response =
        mode === "bulk"
          ? await request(
              "/api/articles/dismiss",
              JSON.stringify({ articleIds: [id] }),
            )
          : mode === "individual"
            ? await request(
                `/api/articles/${id}/review`,
                JSON.stringify({ status: "dismissed" }),
              )
            : await request(
                `/api/articles/${id}/publication`,
                JSON.stringify({ outcome: "retry" }),
              );
      expect(response.status).toBe(200);
      const state = await app.state();
      expect(state.publication.posts).toEqual([]);
      expect(state.publication.error).toBeNull();
      expect(state.settings.autoPost).toBe(false);
      expect((await repo.article(id)).reviewStatus).toBe(
        mode === "retry" ? "saved" : "dismissed",
      );
    },
  );

  it("invalidates the state ETag after a settings change", async () => {
    const { request, handlers, env } = await setup();
    const first = await handlers.fetch(
      new Request("https://news.example.test/api/state"),
      env,
    );
    const tag = first.headers.get("ETag")!;
    const cached = () =>
      handlers.fetch(
        new Request("https://news.example.test/api/state", {
          headers: { "If-None-Match": tag },
        }),
        env,
      );
    expect((await cached()).status).toBe(304);
    expect((await request("/api/settings", '{"pollMinutes":30}')).status).toBe(
      200,
    );
    expect((await cached()).status).toBe(200);
  });
  it("refreshes clock-derived freshness within 30 seconds without database writes", async () => {
    let now = Date.parse("2026-09-28T03:00:00Z") / 1000;
    const { repo, handlers, env } = await setup(() => now);
    await repo.ingest(
      {
        id: "date-test",
        name: "date",
        url: "https://example.org/feed",
        kind: "rss",
        enabled: true,
        description: "date",
      },
      [
        {
          title: "期限境界の記事",
          url: "https://example.org/boundary",
          excerpt: "",
          publishedAt: new Date((now - 86400) * 1000).toISOString(),
        },
      ],
    );
    const version = await repo.stateVersion();
    const first = await handlers.fetch(
      new Request("https://news.example.test/api/state"),
      env,
    );
    expect(await first.json()).toMatchObject({
      articles: [{ freshness: "fresh" }],
      stats: { pending: 1 },
    });
    now += 30;
    const next = await handlers.fetch(
      new Request("https://news.example.test/api/state", {
        headers: { "If-None-Match": first.headers.get("ETag")! },
      }),
      env,
    );
    expect(next.status).toBe(200);
    expect(await next.json()).toMatchObject({
      articles: [{ freshness: "stale" }],
      stats: { pending: 0, expired: 1 },
    });
    expect(await repo.stateVersion()).toBe(version);
  });
  it("hides storage and runtime errors from the response", async () => {
    const { env } = await setup();
    const handlers = createHandlers(
      () => ({ allowed: async () => true }),
      async () => {
        throw new Error("private database credential");
      },
    );
    const response = await handlers.fetch(
      new Request("https://news.example.test/api/state"),
      env,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database credential");
  });
  it("serves the read-only publication preflight for an empty JSON object only", async () => {
    const { request, repo } = await setup();
    const settings = await repo.settings();
    const response = await request("/api/publication/preflight", "{}");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      configured: false,
      connectionVerified: false,
      ready: false,
      blockers: expect.arrayContaining([
        "Buffer の API キーとチャンネル ID を設定してください",
      ]),
    });
    for (const body of ['{"autoPost":true}', "[]", "{"])
      expect((await request("/api/publication/preflight", body)).status).toBe(
        400,
      );
    expect(
      (await request("/api/publication/preflight", "{}", "text/plain")).status,
    ).toBe(415);
    expect(await repo.settings()).toEqual(settings);
  });
  it("protects the preflight like other POST requests and hides runtime errors", async () => {
    const { env } = await setup();
    const post = () =>
      new Request("https://news.example.test/api/publication/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    const app = vi.fn<(env: Env) => Promise<Application>>();
    const denied = createHandlers(() => ({ allowed: async () => false }), app);
    expect((await denied.fetch(post(), env)).status).toBe(403);
    expect(app).not.toHaveBeenCalled();
    const storage = testRepository();
    cleanup.push(storage.close);
    await storage.repo.initialize();
    const failing = createHandlers(
      () => ({ allowed: async () => true }),
      async () =>
        new Application(
          storage.repo,
          new Jev(),
          new BufferClient("key", "channel", async () => {
            throw new Error("private buffer detail");
          }),
        ),
    );
    const response = await failing.fetch(post(), env);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private buffer detail");
  });
  it("does not serve arbitrary files through the assets binding", async () => {
    const { handlers, env } = await setup();
    for (const path of [
      "/.dev.vars",
      "/.env",
      "/sources.json",
      "/src/worker.ts",
    ]) {
      expect(
        (
          await handlers.fetch(
            new Request("https://news.example.test" + path),
            env,
          )
        ).status,
      ).toBe(404);
    }
  });
});
