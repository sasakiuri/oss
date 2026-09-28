// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import sources from "../sources.json" with { type: "json" };
import { createFeedHandler } from "../src/feed-worker.ts";
import { createFeedTransport } from "../src/net/feed-transport.ts";
import { USER_AGENT } from "../src/net/http.ts";

const url = sources.find((source) => source.id === "google-1")!.url;

describe("private regional feed transport", () => {
  beforeEach(() =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Unexpected direct request")),
    ),
  );
  afterEach(() => vi.unstubAllGlobals());
  it("uses the binding, strips inbound credentials and sends one truthful GET", async () => {
    const upstream = vi.fn(
      async () =>
        new Response("<rss/>", {
          headers: {
            "Content-Type": "application/xml",
            "Set-Cookie": "private=value",
          },
        }),
    );
    const relay = createFeedHandler(upstream);
    const response = await relay(
      new Request(url, {
        headers: {
          Authorization: "private",
          Cookie: "session",
          "X-Probe-Key": "private",
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(upstream).toHaveBeenCalledExactlyOnceWith(
      url,
      expect.objectContaining({
        method: "GET",
        headers: { "User-Agent": USER_AGENT },
        redirect: "manual",
        signal: expect.any(AbortSignal),
      }),
    );
    const service = { fetch: vi.fn(relay) };
    expect(
      new TextDecoder().decode((await createFeedTransport(service)(url)).data),
    ).toBe("<rss/>");
    expect(service.fetch).toHaveBeenCalledTimes(1);
  });
  it("preserves upstream refusal status and Retry-After without another route", async () => {
    const upstream = vi.fn(
      async () =>
        new Response("unavailable", {
          status: 503,
          headers: { "Retry-After": "7200" },
        }),
    );
    const service = { fetch: createFeedHandler(upstream) };
    await expect(createFeedTransport(service)(url)).rejects.toMatchObject({
      status: 503,
      retryAfter: 7200,
    });
    expect(upstream).toHaveBeenCalledTimes(1);
    await expect(createFeedTransport()(url)).rejects.toThrow(/接続設定/);
  });
  it("returns redirects to the parent and refuses unlisted paths before any extra fetch", async () => {
    const upstream = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://news.google.com/unlisted" },
        }),
    );
    const relay = createFeedHandler(upstream);
    expect((await relay(new Request(url))).status).toBe(302);
    upstream.mockClear();
    await expect(createFeedTransport({ fetch: relay })(url)).rejects.toThrow(
      /許可していないURL/,
    );
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["POST", url],
    ["GET", "https://news.google.com/rss/search?q=unlisted"],
    ["GET", "https://example.org/"],
    ["GET", "https://news.yahoo.co.jp/private"],
    ["GET", "http://news.yahoo.co.jp/rss/topics/domestic.xml"],
  ])("refuses %s %s without network access", async (method, target) => {
    const upstream = vi.fn();
    expect(
      (await createFeedHandler(upstream)(new Request(target, { method })))
        .status,
    ).toBe(method === "GET" ? 403 : 405);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([403, 429, 503])(
    "keeps %i and Retry-After even with an oversized error body",
    async (status) => {
      const relay = createFeedHandler(
        async () =>
          new Response("error", {
            status,
            headers: { "Content-Length": "5000000", "Retry-After": "90000" },
          }),
      );
      await expect(
        createFeedTransport({ fetch: relay })(url),
      ).rejects.toMatchObject({ status, retryAfter: 90000 });
    },
  );
  it("refuses a www alias redirect instead of falling back to direct fetch", async () => {
    const upstream = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: {
            Location: "https://www.news.google.com/rss/search?q=unlisted",
          },
        }),
    );
    await expect(
      createFeedTransport({ fetch: createFeedHandler(upstream) })(url),
    ).rejects.toThrow(/許可していないURL/);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("bounds relay bodies and passes only response metadata needed by policy", async () => {
    const relay = createFeedHandler(
      async () =>
        new Response("x", { headers: { "Content-Length": "4000001" } }),
    );
    expect((await relay(new Request(url))).status).toBe(502);
    const robots = createFeedHandler(
      async () => new Response("User-agent: *\nAllow: /"),
    );
    expect(
      (await robots(new Request("https://news.yahoo.co.jp/robots.txt"))).status,
    ).toBe(200);
  });
});
