// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";

import { createFeedHandler } from "../src/feed-worker.ts";
import { resolveGoogleNewsItems } from "../src/google-news.ts";
import { GOOGLE_NEWS_LOCALE } from "../src/net/google-news.ts";
import type { Fetcher } from "../src/net/http.ts";
import type { FetchBytes } from "../src/net/types.ts";
import { collection } from "../src/sources/types.ts";

import { testRepository } from "./helpers/storage.ts";

const url = `https://news.google.com/rss/articles/opaque${GOOGLE_NEWS_LOCALE}`;

describe("Google News cancellation", () => {
  it("does not start an upstream request after the caller has aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const upstream = vi.fn<Fetcher>(async () => new Response("unused"));
    const response = await createFeedHandler(upstream)(
      new Request(url, { signal: controller.signal }),
    );
    expect(response.status).toBe(502);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("forwards a caller abort to the upstream request", async () => {
    const controller = new AbortController();
    const reason = new Error("caller stopped");
    let upstreamSignal: AbortSignal | null | undefined;
    const upstream = vi.fn<Fetcher>(async (_url, init) => {
      upstreamSignal = init.signal;
      controller.abort(reason);
      init.signal?.throwIfAborted();
      return new Response("must not succeed");
    });
    const response = await createFeedHandler(upstream)(
      new Request(url, { signal: controller.signal }),
    );
    expect(response.status).toBe(502);
    expect(upstreamSignal?.aborted).toBe(true);
    expect(upstreamSignal?.reason).toBe(reason);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("does not send the RPC or cache failure after cancellation and releases the lease", async () => {
    const storage = testRepository([], () => 10_000);
    try {
      await storage.repo.initialize();
      const controller = new AbortController();
      const reason = new Error("collection stopped");
      const transport = vi.fn<FetchBytes>(async (target) => {
        controller.abort(reason);
        return {
          url: target,
          data: new TextEncoder().encode(
            '<div data-n-a-ts="1700000000" data-n-a-sg="test"></div>',
          ),
          contentType: "text/html",
        };
      });
      const result = collection([
        { title: "News", url, excerpt: "", publishedAt: null },
      ]);
      await expect(resolveGoogleNewsItems(result, storage.repo, {
        transport,
        clock: () => 10_000,
        signal: controller.signal,
      })).rejects.toBe(reason);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(await storage.repo.getRecord("google_news_url", "opaque")).toBeNull();
      expect(await storage.repo.acquireHost(
        "google-news-url:news.google.com", 10_000, 120,
      )).not.toBeNull();
      expect(result.warnings).toEqual([]);
    } finally {
      storage.close();
    }
  });
});
