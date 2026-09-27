// SPDX-License-Identifier: MIT
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FetchBytes, FetchOptions } from "../src/net/types.ts";
import {
  Notifier,
  noticePayload,
  orphanClaims,
  resetNoticeState,
} from "../src/notifications.ts";
import type { SQLRepository } from "../src/storage/repository.ts";
import { sha256, utf8 } from "../src/text.ts";

import { testRepository } from "./helpers/storage.ts";

// Deliberately synthetic format-only fixture, never a configured endpoint.
const WEBHOOK = "https://hooks.slack.com/services/TESTONLY/NOTREAL/PLACEHOLDER";
const SECRET = "database credential must not leak";

let now: number;
let repo: SQLRepository;
let close: () => void;
let transport: Mock<FetchBytes>;
let notifier: Notifier;
let log: Mock<(...data: unknown[]) => void>;
const clock = () => now;

function logged(): string {
  return JSON.stringify(log.mock.calls);
}

function request(index = 0): [string, FetchOptions] {
  const [url, options] = transport.mock.calls[index] ?? [];
  return [url ?? "", options ?? {}];
}

async function noticeRecord(
  key: string,
): Promise<Record<string, unknown> | null> {
  return repo.getRecord("notifications", await sha256(key));
}

beforeEach(async () => {
  resetNoticeState();
  now = 10000;
  ({ repo, close } = testRepository([], clock));
  await repo.initialize();
  transport = vi.fn<FetchBytes>(async () => ({
    data: utf8("ok"),
    url: WEBHOOK,
    contentType: "text/plain",
  }));
  notifier = new Notifier(repo, WEBHOOK, transport, clock);
  log = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  close();
  resetNoticeState();
  vi.restoreAllMocks();
});

describe("Notifier", () => {
  it("is a no-op without configuration", async () => {
    const quiet = new Notifier(repo, "", transport);
    expect(quiet.configured).toBe(false);
    expect(await quiet.report("crawl:one", "取得失敗")).toBe(false);
    expect(await quiet.recover("crawl:one", "復旧")).toBe(false);
    expect(transport).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it.each([
    "http://hooks.slack.com/services/A/B/C",
    "https://hooks.slack.com.evil.test/services/A/B/C",
    "https://hooks.slack.com@evil.test/services/A/B/C",
    `${WEBHOOK}?secret=private`,
    `${WEBHOOK}#fragment`,
    "https://hooks.slack.com:443/services/A/B/C",
    "https://HOOKS.slack.com/services/A/B/C",
    "https://hooks.slack.com/services/A/%2e%2e/C",
    `${WEBHOOK}/`,
    `https://hooks.slack.com/services/A/B/${"C".repeat(600)}`,
  ])("fails closed for %s without echoing it", async (url) => {
    const invalid = new Notifier(repo, url, transport);
    expect(invalid.configured).toBe(false);
    expect(await invalid.report("one", "通知")).toBe(false);
    expect(logged()).not.toContain(url);
    expect(logged()).toContain("configuration is invalid");
    expect(transport).not.toHaveBeenCalled();
  });

  it("sends a bounded plain-text payload with sensitive patterns redacted", async () => {
    const detail = `Bearer do-not-leak TYPESAFE_API_KEY=also-private authorization: basic-private eyJhbGciOi.eyJzdWIi.c2lnbmF0dXJl ${WEBHOOK}\n${"情報".repeat(2000)}`;
    expect(
      await notifier.report(
        "crawl:one",
        "<!channel> @everyone 取得失敗",
        detail,
      ),
    ).toBe(true);
    const [url, options] = request();
    expect(url).toBe(WEBHOOK);
    expect([options.timeout, options.maxBytes, options.headers]).toEqual([
      5,
      1024,
      { "Content-Type": "application/json" },
    ]);
    const body = options.body ?? new Uint8Array();
    expect(body.byteLength).toBeLessThanOrEqual(1024);
    const text = new TextDecoder().decode(body);
    const payload = JSON.parse(text) as {
      text: string;
      mrkdwn: boolean;
      unfurl_links: boolean;
      unfurl_media: boolean;
      blocks: { text: { type: string; text: string } }[];
    };
    expect([
      payload.mrkdwn,
      payload.unfurl_links,
      payload.unfurl_media,
    ]).toEqual([false, false, false]);
    expect(payload.blocks[0]?.text.type).toBe("plain_text");
    expect(payload.text).toBe(
      "NilayNews｜エラー｜＜!channel＞ ＠everyone 取得失敗",
    );
    for (const forbidden of [
      "<!channel>",
      "@everyone",
      "do-not-leak",
      "also-private",
      "basic-private",
      "eyJhbGciOi",
      WEBHOOK,
    ])
      expect(text).not.toContain(forbidden);
    expect(() => options.beforeRedirect?.("https://evil.test")).toThrow();
  });

  it("labels levels and falls back to a generic title", () => {
    const parse = (data: Uint8Array) =>
      (JSON.parse(new TextDecoder().decode(data)) as { text: string }).text;
    expect(parse(noticePayload("", "", "recovery"))).toBe(
      "NilayNews｜復旧｜処理状況を確認してください",
    );
    expect(parse(noticePayload("題", "", "warning"))).toBe(
      "NilayNews｜注意｜題",
    );
    expect(parse(noticePayload("題", "", "info"))).toBe(
      "NilayNews｜お知らせ｜題",
    );
    const control = parse(noticePayload("a\u0000b\u007fc\td", "", "error"));
    expect(control).toBe("NilayNews｜エラー｜a b c\td");
  });

  it("never splits a multi-byte character when truncating", () => {
    const payload = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        noticePayload("題".repeat(100), "🦌".repeat(300), "error"),
      ),
    ) as { text: string };
    expect(payload.text).toBe(`NilayNews｜エラー｜${"題".repeat(60)}`);
    // JSON escaping doubles quotes; the detail shrinks until the body fits.
    const escaped = noticePayload('"'.repeat(180), "\\".repeat(450), "error");
    expect(escaped.byteLength).toBeLessThanOrEqual(1024);
    const parsed = JSON.parse(new TextDecoder().decode(escaped)) as {
      text: string;
      blocks: { text: { text: string } }[];
    };
    expect(parsed.text).toBe(`NilayNews｜エラー｜${'"'.repeat(180)}`);
    expect(parsed.blocks[0]?.text.text.length).toBeLessThan(
      parsed.text.length + 1 + 450,
    );
  });

  it("claims one hourly notice across concurrent instances", async () => {
    const other = new Notifier(repo, WEBHOOK, transport, clock);
    const results = await Promise.all([
      notifier.report("crawl:one", "取得失敗"),
      other.report("crawl:one", "取得失敗"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(transport).toHaveBeenCalledTimes(1);
    // A fresh isolate still observes the durable claim, even with a changed detail.
    resetNoticeState();
    expect(await other.report("crawl:one", "取得失敗", "別の詳細")).toBe(false);
    now += 3600;
    expect(await other.report("crawl:one", "取得失敗")).toBe(true);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("does not report while another operation holds the notice lock", async () => {
    const digest = await sha256("crawl:one");
    const token = await repo.acquireHost(`notice-op:${digest}`, now, 30);
    expect(await notifier.report("crawl:one", "取得失敗")).toBe(false);
    expect(await notifier.recover("crawl:one", "復旧")).toBe(false);
    expect(transport).not.toHaveBeenCalled();
    expect(await repo.releaseHost(`notice-op:${digest}`, token ?? "")).toBe(
      true,
    );
  });

  it("swallows a delivery failure without retrying it immediately", async () => {
    transport.mockRejectedValue(new Error(`private body ${WEBHOOK}`));
    expect(await notifier.report("one", "処理失敗")).toBe(false);
    resetNoticeState();
    expect(await notifier.report("one", "処理失敗")).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(logged()).not.toContain("private body");
    expect(logged()).not.toContain(WEBHOOK);
    expect(await noticeRecord("one")).toMatchObject({
      active: true,
      delivered: false,
    });
  });

  it("bounds a transport that never settles", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      transport.mockImplementation(() => new Promise(() => undefined));
      const pending = notifier.report("slow", "処理失敗");
      await vi.waitFor(() => expect(transport).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(5000);
      expect(await pending).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("notifies recovery once and allows a new incident", async () => {
    expect(await notifier.recover("crawl:one", "収集復旧")).toBe(false);
    expect(await notifier.report("crawl:one", "取得失敗")).toBe(true);
    const results = await Promise.all([
      notifier.recover("crawl:one", "収集復旧"),
      notifier.recover("crawl:one", "収集復旧"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    resetNoticeState();
    expect(await notifier.recover("crawl:one", "収集復旧")).toBe(false);
    expect(await notifier.report("crawl:one", "再度失敗")).toBe(true);
    expect(transport).toHaveBeenCalledTimes(3);
    const payload = JSON.parse(
      new TextDecoder().decode(request(1)[1].body),
    ) as { text: string };
    expect(payload.text).toBe("NilayNews｜復旧｜収集復旧");
  });

  it("uses a bounded isolate fallback while the database is unavailable", async () => {
    const acquire = vi
      .spyOn(repo, "acquireHost")
      .mockRejectedValue(new Error(SECRET));
    const unavailable = new Notifier(repo, WEBHOOK, transport, clock);
    expect(await unavailable.report("scheduled", "定期実行失敗")).toBe(true);
    expect(await unavailable.report("scheduled", "定期実行失敗")).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(logged()).not.toContain(SECRET);
    acquire.mockRestore();
    // Recovery after the database returns uses the locally recorded incident.
    expect(await notifier.recover("scheduled", "定期実行復旧")).toBe(true);
    expect(await notifier.recover("scheduled", "定期実行復旧")).toBe(false);
  });

  it("releases an unpersisted claim so recovery allows a new incident", async () => {
    vi.spyOn(repo, "putRecord").mockRejectedValueOnce(new Error(SECRET));
    expect(await notifier.report("crawl:one", "取得失敗")).toBe(true);
    expect(logged()).not.toContain(SECRET);
    expect(await noticeRecord("crawl:one")).toBeNull();
    // Ordinary repeats remain suppressed within this isolate.
    expect(await notifier.report("crawl:one", "取得失敗")).toBe(false);
    expect(await notifier.recover("crawl:one", "収集復旧")).toBe(true);
    expect(await notifier.report("crawl:one", "再度失敗")).toBe(true);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it("retries an orphaned claim release when storage returns", async () => {
    const release = repo.releaseHost.bind(repo);
    vi.spyOn(repo, "putRecord").mockRejectedValueOnce(new Error(SECRET));
    const releases = vi
      .spyOn(repo, "releaseHost")
      .mockImplementation(async (host, token) => {
        if (host.startsWith("notice:")) throw new Error(SECRET);
        return release(host, token);
      });
    expect(await notifier.report("crawl:one", "取得失敗")).toBe(true);
    expect(orphanClaims()).toBe(1);
    releases.mockRestore();
    expect(await notifier.recover("crawl:one", "収集復旧")).toBe(true);
    expect(orphanClaims()).toBe(0);
    expect(await notifier.report("crawl:one", "再度失敗")).toBe(true);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(logged()).not.toContain(SECRET);
  });

  it("retries a failed recovery claim release on the next report", async () => {
    expect(await notifier.report("crawl:one", "取得失敗")).toBe(true);
    vi.spyOn(repo, "releaseHost").mockRejectedValueOnce(new Error(SECRET));
    expect(await notifier.recover("crawl:one", "収集復旧")).toBe(true);
    expect(await notifier.recover("crawl:one", "収集復旧")).toBe(false);
    resetNoticeState();
    expect(await notifier.report("crawl:one", "再度失敗")).toBe(true);
    expect(await notifier.report("crawl:one", "再度失敗")).toBe(false);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it("suppresses a report whose throttle claim is held elsewhere", async () => {
    const digest = await sha256("crawl:one");
    await repo.acquireHost(`notice:${digest}`, now, 3600);
    expect(await notifier.report("crawl:one", "取得失敗")).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });

  it("keeps a standalone fallback across notifiers in the same isolate", async () => {
    const first = new Notifier(null, WEBHOOK, transport, clock);
    const second = new Notifier(null, WEBHOOK, transport, clock);
    expect(await first.report("scheduled", "定期実行失敗")).toBe(true);
    expect(await second.report("scheduled", "定期実行失敗")).toBe(false);
    now += 3600;
    expect(await second.report("scheduled", "定期実行失敗")).toBe(true);
    expect(await first.recover("scheduled", "定期実行復旧")).toBe(true);
    expect(await second.recover("scheduled", "定期実行復旧")).toBe(false);
  });

  it("bounds isolate-local state", async () => {
    const standalone = new Notifier(null, WEBHOOK, transport, clock);
    for (let index = 0; index < 257; index += 1) {
      now += 1;
      await standalone.report(`key-${index}`, "失敗");
    }
    // The oldest entry was evicted, so its incident is no longer suppressed.
    expect(await standalone.report("key-0", "失敗")).toBe(true);
    expect(await standalone.report("key-256", "失敗")).toBe(false);
  });

  it.each(["", "k".repeat(513), "\ud800"])(
    "ignores an invalid key",
    async (key) => {
      expect(await notifier.report(key, "失敗")).toBe(false);
      expect(await notifier.recover(key, "復旧")).toBe(false);
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["private_error", WEBHOOK],
    ["ok", "https://evil.test"],
  ])("does not treat %s from %s as success", async (reply, url) => {
    transport.mockResolvedValue({
      data: utf8(reply),
      url,
      contentType: "text/plain",
    });
    expect(await notifier.report("one", "取得失敗")).toBe(false);
    expect(logged()).not.toContain("private_error");
    expect(logged()).not.toContain("evil.test");
  });

  it("accepts an acknowledgement with surrounding whitespace", async () => {
    transport.mockResolvedValue({
      data: utf8(" ok\n"),
      url: WEBHOOK,
      contentType: "text/plain",
    });
    expect(await notifier.report("one", "取得失敗")).toBe(true);
  });
});
