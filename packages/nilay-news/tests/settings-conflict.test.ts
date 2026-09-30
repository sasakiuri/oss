// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from "vitest";

import { Application } from "../src/application.ts";
import { SettingsConflictError } from "../src/errors.ts";
import { Jev } from "../src/jev.ts";
import { BufferClient } from "../src/publishing.ts";
import type { SourceConfig } from "../src/sources/types.ts";
import { SQLRepository } from "../src/storage/repository.ts";
import { createHandlers, type Env } from "../src/worker.ts";

import { testRepository } from "./helpers/storage.ts";

const source: SourceConfig = {
  id: "fixture",
  name: "Fixture",
  description: "Test",
  kind: "rss",
  enabled: true,
  url: "https://example.org/feed",
};
const cleanup: (() => void)[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0)) close();
});
async function setup() {
  let now = Date.parse("2026-09-28T03:00:00Z") / 1000;
  const storage = testRepository([source], () => now);
  cleanup.push(storage.close);
  const { repo, driver } = storage;
  await repo.initialize();
  const other = new SQLRepository(driver, [source], () => now);
  const buffer = new BufferClient(
    "fixture-key",
    "fixture-channel",
    async () => {
      throw new Error("Unexpected external request");
    },
  );
  const app = new Application(repo, new Jev(), buffer, { clock: () => now });
  const handlers = createHandlers(
    () => ({ allowed: async () => true }),
    async () => app,
  );
  const env = {} as Env;
  const request = (body: object) =>
    handlers.fetch(
      new Request("https://news.example.test/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
  const ingest = async (suffix = "a") => {
    await repo.ingest(source, [
      {
        title: `クマの出没と対策 ${suffix}`,
        url: `https://example.org/${suffix}`,
        excerpt: "市が対策を発表",
        publishedAt: new Date(now * 1000).toISOString(),
      },
    ]);
    return (await repo.articles()).find((article) =>
      article.url.endsWith(`/${suffix}`),
    )!;
  };
  return {
    ...storage,
    other,
    buffer,
    app,
    handlers,
    env,
    request,
    ingest,
    advance: (seconds: number) => {
      now += seconds;
    },
    clock: () => now,
  };
}

describe("settings-specific mutation fencing", () => {
  it("reads settings and the edit token atomically without changing the portable snapshot", async () => {
    const { repo, driver } = await setup();
    const batch = vi.spyOn(driver, "batch");
    const snapshot = await repo.settingsSnapshot();
    expect(snapshot).toMatchObject(await repo.settings());
    expect(snapshot.revision).toMatch(/^[a-f0-9]{32}$/);
    expect(batch.mock.calls[0]![0]).toEqual([
      ["SELECT revision FROM news_meta WHERE id=1", []],
      ["SELECT id,data FROM news_state", []],
    ]);
    expect(await repo.exportSnapshot()).toMatchObject({
      settings: await repo.settings(),
    });
    expect(await repo.settings()).not.toHaveProperty("revision");
    const portable = (await repo.exportSnapshot()) as { settings: object };
    expect(portable.settings).not.toHaveProperty("revision");
  });

  it("keeps an edit valid through ingestion, source/job writes and a repository restart", async () => {
    const { repo, other, ingest } = await setup();
    const original = await repo.settingsSnapshot();
    await ingest();
    await repo.updateSource(source.id, { enabled: false });
    await repo.queueJob("collect");
    await other.initialize();
    expect((await other.settingsSnapshot()).revision).toBe(original.revision);
    await repo.updateSettings({ pollMinutes: 30 }, original.revision);
    expect((await repo.settings()).pollMinutes).toBe(30);
    expect((await repo.settingsSnapshot()).revision).not.toBe(
      original.revision,
    );
  });

  it("rejects a stale full form without undoing a manual posting stop", async () => {
    const { repo, other } = await setup();
    await repo.updateSettings({ autoPost: true });
    const { revision, ...old } = await repo.settingsSnapshot();
    await other.updateSettings({ autoPost: false });
    await expect(
      repo.updateSettings({ ...old, postSelection: "saved" }, revision),
    ).rejects.toBeInstanceOf(SettingsConflictError);
    expect(await repo.settings()).toMatchObject({
      autoPost: false,
      postSelection: "both",
    });
  });

  it("invalidates stale tabs after an automatic expired-claim safety stop", async () => {
    const { repo, ingest, advance, clock } = await setup();
    const article = await ingest();
    await repo.review(article.id, "saved");
    await repo.updateSettings({ autoPost: true });
    const old = await repo.settingsSnapshot();
    advance(3601);
    expect(await repo.claimPost(clock())).not.toBeNull();
    expect((await repo.settingsSnapshot()).revision).toBe(old.revision);
    advance(601);
    expect(await repo.recoverPosts(clock())).toBe(1);
    await expect(
      repo.updateSettings(
        { autoPost: true, postSelection: "saved" },
        old.revision,
      ),
    ).rejects.toBeInstanceOf(SettingsConflictError);
    expect((await repo.settings()).autoPost).toBe(false);
    expect((await repo.publicationState()).posts[0]?.status).toBe("unknown");
  });

  it("does not overwrite a newer rubric or invalidate its analysis results", async () => {
    const { repo, other, ingest } = await setup();
    const article = await ingest();
    const old = await repo.settingsSnapshot();
    const rubric = "A newer carefully reviewed selection rubric";
    await other.updateSettings({ rubric });
    await repo.analyzeResult(
      article.id,
      await repo.evidenceHash(article),
      rubric,
      { analysisStatus: "done", decision: "candidate" },
    );
    await expect(
      repo.updateSettings(
        { rubric: old.rubric, pollMinutes: 30 },
        old.revision,
      ),
    ).rejects.toBeInstanceOf(SettingsConflictError);
    expect(await repo.settings()).toMatchObject({ rubric, pollMinutes: 60 });
    expect((await repo.article(article.id)).analysisStatus).toBe("done");
  });

  it("detects an intervening settings change even when values return to the original state", async () => {
    const { repo } = await setup();
    const old = await repo.settingsSnapshot();
    await repo.updateSettings({ autoPost: true });
    await repo.updateSettings({ autoPost: false });
    expect((await repo.settings()).autoPost).toBe(old.autoPost);
    await expect(
      repo.updateSettings({ pollMinutes: 30 }, old.revision),
    ).rejects.toBeInstanceOf(SettingsConflictError);
  });

  it.each([false, true])(
    "rechecks the edit token after a lost repository-wide compare (no-op=%s)",
    async (noOp) => {
      const { repo, other, driver, ingest } = await setup();
      const article = await ingest();
      const old = await repo.settingsSnapshot();
      await repo.analyzeResult(
        article.id,
        await repo.evidenceHash(article),
        old.rubric,
        { analysisStatus: "done", decision: "candidate" },
      );
      const batch = driver.batch.bind(driver);
      let raced = false;
      vi.spyOn(driver, "batch").mockImplementation(async (statements) => {
        if (!raced && statements[0]?.[0].startsWith("UPDATE news_meta SET")) {
          raced = true;
          await other.updateSettings({ pollMinutes: 45 });
        }
        return batch(statements);
      });
      await expect(
        repo.updateSettings(
          noOp
            ? {}
            : { rubric: "A proposed rubric that must not be committed" },
          old.revision,
        ),
      ).rejects.toBeInstanceOf(SettingsConflictError);
      expect(raced).toBe(true);
      expect(await repo.settings()).toMatchObject({
        rubric: old.rubric,
        pollMinutes: 45,
      });
      expect((await repo.article(article.id)).analysisStatus).toBe("done");
    },
  );

  it("retries an unrelated article race without manufacturing a settings conflict", async () => {
    const { repo, driver, ingest } = await setup();
    const old = await repo.settingsSnapshot();
    const batch = driver.batch.bind(driver);
    let raced = false;
    vi.spyOn(driver, "batch").mockImplementation(async (statements) => {
      if (!raced && statements[0]?.[0].startsWith("UPDATE news_meta SET")) {
        raced = true;
        await ingest("concurrent");
      }
      return batch(statements);
    });
    await expect(
      repo.updateSettings({ pollMinutes: 30 }, old.revision),
    ).resolves.toMatchObject({ pollMinutes: 30 });
    expect((await repo.articles()).length).toBe(1);
  });

  it("initializes a legacy token once and changes it on a portable import", async () => {
    const { repo, driver } = await setup();
    const portable = await repo.exportSnapshot();
    driver.db.exec("DELETE FROM news_state WHERE id='settings_revision'");
    await repo.initialize();
    const initialized = await repo.settingsSnapshot();
    await repo.initialize();
    expect((await repo.settingsSnapshot()).revision).toBe(initialized.revision);
    await repo.importSnapshot(portable);
    expect((await repo.settingsSnapshot()).revision).not.toBe(
      initialized.revision,
    );
  });
});

describe("public settings contract", () => {
  it.each([{}, { revision: "" }, { revision: 42 }, { revision: "unknown" }])(
    "returns a distinct conflict for missing or stale tokens: %j",
    async (body) => {
      const { request, repo } = await setup();
      const original = await repo.settingsSnapshot();
      const response = await request({ ...body, pollMinutes: 30 });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: "settings_conflict",
      });
      expect(await repo.settingsSnapshot()).toEqual(original);
    },
  );

  it("accepts changed fields with a current token, then rejects its reuse", async () => {
    const { repo, request, app } = await setup();
    const initial = await app.state();
    const body = { revision: initial.settings.revision, pollMinutes: 30 };
    expect((await request(body)).status).toBe(200);
    const stale = await request({ ...body, pollMinutes: 45 });
    expect(stale.status).toBe(409);
    expect((await repo.settings()).pollMinutes).toBe(30);
  });

  it("performs the final atomic comparison after asynchronous Buffer verification", async () => {
    const { repo, other, buffer, request } = await setup();
    await repo.updateSettings({ autoPost: true });
    const old = await repo.settingsSnapshot();
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const verifying = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.spyOn(buffer, "verifyAccount").mockImplementation(async () => {
      started();
      await gate;
    });
    const pending = request({
      revision: old.revision,
      autoPost: true,
      postSelection: "saved",
    });
    await verifying;
    await other.updateSettings({ autoPost: false });
    release();
    const response = await pending;
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "settings_conflict" });
    expect(await repo.settings()).toMatchObject({
      autoPost: false,
      postSelection: "both",
    });
  });
});
