// SPDX-License-Identifier: MIT
/** Ten eligible news items become ten Buffer share-now requests after an hour. */
import { describe, expect, it } from "vitest";

import type { FetchBytes } from "../src/net/types.ts";
import { BufferClient, Publisher } from "../src/publishing.ts";
import type { SourceConfig } from "../src/sources/types.ts";
import { utf8 } from "../src/text.ts";

import { testRepository } from "./helpers/storage.ts";

const SOURCE: SourceConfig = {
  id: "round-fixture",
  name: "Round fixture",
  description: "個別投稿の検証",
  url: "https://example.org/feed",
  enabled: true,
  kind: "rss",
};

describe("hourly round through the real Buffer client", () => {
  it("sends all ten separately and reserves an arrival during sending for the next hour", async () => {
    let now = Date.parse("2026-09-28T12:00:00+09:00") / 1000;
    const { repo, close } = testRepository([SOURCE], () => now);
    try {
      await repo.initialize();
      async function add(index: number) {
        const url = `https://example.org/round/${index}`;
        await repo.ingest(SOURCE, [
          {
            title: `鳥獣対策ニュース ${index}`,
            url,
            excerpt: "個別の記事",
            publishedAt: new Date(now * 1000).toISOString(),
          },
        ]);
        const article = (await repo.articles()).find(
          (item) => item.url === url,
        );
        if (!article) throw new Error("Fixture article missing");
        await repo.review(article.id, "saved");
      }
      for (let index = 1; index <= 10; index += 1) await add(index);
      await repo.updateSettings({ autoPost: true });
      const texts: string[] = [];
      let verifications = 0;
      const inputs: object[] = [];
      const transport: FetchBytes = async (_url, options) => {
        const request = JSON.parse(new TextDecoder().decode(options?.body)) as {
          query: string;
          variables: {
            input: { channelId?: string; text?: string; mode?: string };
          };
        };
        let data: object;
        if (request.query.startsWith("query(")) {
          verifications += 1;
          data = {
            channel: {
              id: "round-channel",
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
                channelId: "round-channel",
                isAtLimit: false,
                limit: 100,
                scheduled: texts.length,
              },
            ],
          };
        } else {
          if (!request.query.includes("createPost"))
            throw new Error("Unexpected Buffer query");
          inputs.push(request.variables.input);
          const text = request.variables.input.text;
          if (typeof text !== "string") throw new Error("Missing post text");
          texts.push(text);
          // Ingest while the outbound request is in flight, after the round's snapshot.
          if (texts.length === 4) await add(11);
          data = {
            createPost: {
              __typename: "PostActionSuccess",
              post: {
                id: `buffer-${texts.length}`,
                channelId: "round-channel",
                channelService: "twitter",
                text,
                status: "sent",
                externalLink: `https://x.com/NilayNews/status/${texts.length}`,
              },
            },
          };
        }
        return {
          data: utf8(JSON.stringify({ data })),
          url: "https://api.buffer.com",
          contentType: "application/json",
          rateLimit: '"250-in-1day"; r=200; t=3600',
        };
      };
      const publisher = new Publisher(
        repo,
        new BufferClient("fixture-key", "round-channel", transport),
        () => now,
      );
      now += 3599;
      await publisher.tick();
      expect(texts).toHaveLength(0);
      now += 1;
      await publisher.tick();
      expect(texts).toHaveLength(10);
      expect(verifications).toBe(10);
      expect(inputs).toHaveLength(10);
      for (const input of inputs)
        expect(input).toMatchObject({
          channelId: "round-channel",
          mode: "shareNow",
        });
      const urls = texts.map((text) => {
        const links = text.match(/https:\/\/example\.org\/round\/\d+/g) ?? [];
        expect(links).toHaveLength(1);
        return links[0];
      });
      expect(new Set(urls)).toEqual(
        new Set(
          Array.from(
            { length: 10 },
            (_, i) => `https://example.org/round/${i + 1}`,
          ),
        ),
      );
      expect(
        (await repo.publicationState()).posts.every(
          (post) => post.status === "posted",
        ),
      ).toBe(true);
      now += 3599;
      await publisher.tick();
      expect(texts).toHaveLength(10);
      now += 1;
      await publisher.tick();
      expect(texts).toHaveLength(11);
      expect(texts[10]).toContain("https://example.org/round/11");
      expect(verifications).toBe(11);
    } finally {
      close();
    }
  });
});
