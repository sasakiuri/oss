// SPDX-License-Identifier: MIT
/** Confirmation deadlines must not turn one hourly round into hours of per-item waits. */
import { describe, expect, it } from "vitest";

import { FetchError } from "../src/net/http.ts";
import type { FetchBytes } from "../src/net/types.ts";
import { BufferClient, Publisher } from "../src/publishing.ts";
import type { SourceConfig } from "../src/sources/types.ts";
import { utf8 } from "../src/text.ts";

import { testRepository } from "./helpers/storage.ts";

const source: SourceConfig = {
  id: "confirmation-fixture",
  name: "Fixture",
  description: "確認期限",
  url: "https://example.org/feed",
  enabled: true,
  kind: "rss",
};

describe("bounded confirmation within an hourly round", () => {
  it.each([
    {
      mode: "pending-then-sent",
      checks: 2,
      sent: 2,
      autoPost: true,
      status: "posted",
      error: null,
    },
    {
      mode: "rate-limit",
      checks: 4,
      sent: 1,
      autoPost: false,
      status: "unknown",
      error: expect.stringContaining("HTTP 429"),
    },
    {
      mode: "transient-then-pending",
      checks: 6,
      sent: 1,
      autoPost: false,
      status: "unknown",
      error: expect.stringContaining("完了していません"),
    },
  ] as const)(
    "handles $mode without another hourly item delay or blind retry",
    async (expected) => {
      const { mode } = expected;
      let now = Date.parse("2026-09-28T12:00:00+09:00") / 1000;
      const { repo, close } = testRepository([source], () => now);
      try {
        await repo.initialize();
        await repo.ingest(
          source,
          [1, 2].map((index) => ({
            title: `鳥獣被害への対策 ${index}`,
            url: `https://example.org/${index}`,
            excerpt: "市の発表",
            publishedAt: new Date((now - index) * 1000).toISOString(),
          })),
        );
        for (const article of await repo.articles())
          await repo.review(article.id, "saved");
        await repo.updateSettings({ autoPost: true });
        const sent: string[] = [];
        let checks = 0;
        const result = (text: string, id: string, status: string) => ({
          id,
          channelId: "channel",
          channelService: "twitter",
          text,
          status,
          externalLink: "https://x.com/NilayNews/status/123",
        });
        const transport: FetchBytes = async (_url, options) => {
          const request = JSON.parse(
            new TextDecoder().decode(options?.body),
          ) as { query: string; variables: { input: { text?: string } } };
          let data: object;
          if (request.query.includes("createPost")) {
            const text = request.variables.input.text;
            if (!text) throw new Error("Missing text");
            sent.push(text);
            data = {
              createPost: {
                __typename: "PostActionSuccess",
                post: result(
                  text,
                  `buffer-${sent.length}`,
                  sent.length === 1 ? "sending" : "sent",
                ),
              },
            };
          } else if (request.query.includes("post(input:")) {
            checks += 1;
            if (mode === "rate-limit")
              throw new FetchError("private response", 429, 900);
            if (mode === "transient-then-pending" && checks === 1)
              throw new FetchError("private response", 500);
            data = {
              post: result(
                sent[0]!,
                "buffer-1",
                mode === "pending-then-sent" && checks === 2
                  ? "sent"
                  : "sending",
              ),
            };
          } else {
            data = {
              channel: {
                id: "channel",
                name: "NilayNews",
                service: "twitter",
                allowedActions: ["scheduleUpdates", "readUpdates"],
                isDisconnected: false,
                isLocked: false,
                isQueuePaused: false,
                linkShortening: { isEnabled: false },
              },
              dailyPostingLimits: [
                {
                  channelId: "channel",
                  isAtLimit: false,
                  limit: 100,
                  scheduled: sent.length,
                },
              ],
            };
          }
          return {
            data: utf8(JSON.stringify({ data })),
            url: "https://api.buffer.com",
            contentType: "application/json",
          };
        };
        const publisher = new Publisher(
          repo,
          new BufferClient("fixture-key", "channel", transport, {
            clock: () => now,
            observeQuota: (quota) => repo.recordBufferQuota(quota),
            readQuota: () => repo.getRecord("buffer", "quota"),
            nextRequestOrder: () => repo.reserveBufferRequest(),
          }),
          () => now,
        );
        now += 3600;
        const opened = now;
        await publisher.tick();
        expect(sent).toHaveLength(1);
        now += 119;
        await publisher.tick();
        expect(checks).toBe(0);
        now += 1;
        await publisher.tick();
        expect(checks).toBe(1);
        expect((await repo.settings()).autoPost).toBe(true);
        expect((await repo.publicationState()).posts[0]).toMatchObject({
          status: "submitted",
          nextCheckAt: opened + (mode === "rate-limit" ? 1020 : 360),
        });
        now += 119;
        await publisher.tick();
        expect(checks).toBe(1);
        for (const offset of [
          360, 840, 1020, 1740, 1920, 2640, 2820, 3540, 3600,
        ]) {
          now = opened + offset;
          await publisher.tick();
        }
        expect(checks).toBe(expected.checks);
        expect(sent).toHaveLength(expected.sent);
        const publication = await repo.publicationState();
        expect(
          publication.posts.find((post) => post.bufferId === "buffer-1"),
        ).toMatchObject({
          status: expected.status,
          bufferId: "buffer-1",
          error: expected.error,
        });
        expect(JSON.stringify(publication)).not.toContain("private response");
        expect(publication.nextAt).toBe(opened + 3600);
        expect((await repo.settings()).autoPost).toBe(expected.autoPost);
        now += 10000;
        await publisher.tick();
        expect(checks).toBe(expected.checks);
        expect(sent).toHaveLength(expected.sent);
      } finally {
        close();
      }
    },
  );
});
