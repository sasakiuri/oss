// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it } from "vitest";

import { Application } from "../src/application.ts";
import { Jev } from "../src/jev.ts";
import { BufferClient } from "../src/publishing.ts";
import { createHandlers, type Env } from "../src/worker.ts";

import { testRepository } from "./helpers/storage.ts";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});
async function setup() {
  const storage = testRepository();
  cleanup.push(storage.close);
  await storage.repo.initialize();
  const app = new Application(storage.repo, new Jev(), new BufferClient());
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
