// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import { CrawlStopped } from "../src/crawl.ts";
import type { Fetcher } from "../src/net/http.ts";
import {
  FetchError,
  USER_AGENT,
  createFetchBytes,
  readBody,
  retryAfterSeconds,
} from "../src/net/http.ts";

const encoder = new TextEncoder();
const text = (data: Uint8Array) => new TextDecoder().decode(data);

/** A pull-only stream so tests can see exactly which chunks were read. */
function body(chunks: string[], delay = 0) {
  const pending = [...chunks];
  const state = { cancelled: false, pending };
  const stream = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        const next = pending.shift();
        if (next === undefined) controller.close();
        else controller.enqueue(encoder.encode(next));
      },
      cancel() {
        state.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, state };
}

function reply(
  chunks: string[] = [],
  status = 200,
  headers: Record<string, string> = {},
  delay = 0,
) {
  const { stream, state } = body(chunks, delay);
  return { response: new Response(stream, { status, headers }), state };
}

function runtime(responses: (Response | Error)[]) {
  const calls: [string, RequestInit][] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push([url, init]);
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, fetchBytes: createFetchBytes(fetcher) };
}

describe("fetchBytes", () => {
  it("streams bytes with a manual redirect policy and an honest agent", async () => {
    const { response, state } = reply(["abc", "def"], 200, {
      "content-type": "text/plain",
    });
    const { calls, fetchBytes } = runtime([response]);
    const result = await fetchBytes("https://example.org/feed");
    expect([text(result.data), result.url, result.contentType]).toEqual([
      "abcdef",
      "https://example.org/feed",
      "text/plain",
    ]);
    const [, init] = calls[0] ?? [];
    expect(init?.redirect).toBe("manual");
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual({ "User-Agent": USER_AGENT });
    expect(USER_AGENT).toContain("NilayNews");
    expect(init?.signal?.aborted).toBe(true);
    expect(state.cancelled).toBe(false);
  });

  it("rejects an advertised oversize body without reading it", async () => {
    const { response, state } = reply(["secret"], 200, {
      "content-length": "6",
    });
    const { fetchBytes } = runtime([response]);
    await expect(
      fetchBytes("https://example.org", { maxBytes: 5 }),
    ).rejects.toThrow("サイズ");
    expect(state.pending).toEqual(["secret"]);
    expect(state.cancelled).toBe(true);
  });

  it("applies one deadline to the body and cancels the stream", async () => {
    const { response, state } = reply(["slow"], 200, {}, 50);
    const { calls, fetchBytes } = runtime([response]);
    await expect(
      fetchBytes("https://example.org", { timeout: 0.01 }),
    ).rejects.toThrow("タイムアウト");
    expect(calls[0]?.[1].signal?.aborted).toBe(true);
    expect(state.cancelled).toBe(true);
  });

  it("applies the same deadline across a redirect guard that never settles", async () => {
    const { calls, fetchBytes } = runtime([
      reply([], 302, { location: "/next" }).response,
    ]);
    const hang = () => new Promise<void>(() => undefined);
    await expect(
      fetchBytes("https://example.org", {
        timeout: 0.01,
        beforeRedirect: hang,
      }),
    ).rejects.toThrow("タイムアウト");
    expect(calls).toHaveLength(1);
  });

  it("runs the redirect guard before requesting a same-site target", async () => {
    const first = reply([], 302, { location: "https://www.example.org/final" });
    const { calls, fetchBytes } = runtime([
      first.response,
      reply(["ok"]).response,
    ]);
    const seen: string[] = [];
    const result = await fetchBytes("https://example.org/start", {
      beforeRedirect: (url) => {
        seen.push(url);
        expect(calls).toHaveLength(1);
      },
    });
    expect(text(result.data)).toBe("ok");
    expect(seen).toEqual([result.url]);
    expect(result.url).toBe("https://www.example.org/final");
    expect(first.state.cancelled).toBe(true);
  });

  it("allows an HTTPS upgrade but not a downgrade", async () => {
    const { fetchBytes } = runtime([
      reply([], 301, { location: "https://example.org/secure" }).response,
      reply(["ok"]).response,
    ]);
    expect((await fetchBytes("http://example.org/")).url).toBe(
      "https://example.org/secure",
    );
  });

  it("keeps a policy error type from the redirect guard and sends nothing more", async () => {
    const { calls, fetchBytes } = runtime([
      reply([], 302, { location: "/denied" }).response,
    ]);
    const deny = () => {
      throw new CrawlStopped("denied");
    };
    await expect(
      fetchBytes("https://example.org", { beforeRedirect: deny }),
    ).rejects.toBeInstanceOf(CrawlStopped);
    expect(calls).toHaveLength(1);
  });

  it("redacts arbitrary redirect guard failures", async () => {
    const { fetchBytes } = runtime([
      reply([], 302, { location: "/next" }).response,
    ]);
    const deny = () => {
      throw new Error("Authorization: secret");
    };
    const error = await fetchBytes("https://example.org", {
      beforeRedirect: deny,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(FetchError);
    expect(String(error)).not.toContain("secret");
  });

  it.each([
    "https://evil.example/path",
    "http://example.org/path",
    "/a/%2e%2e/denied",
    "https://user:password@example.org/",
    "https://127.0.0.1/",
  ])("refuses the unsafe redirect target %s", async (target) => {
    const { calls, fetchBytes } = runtime([
      reply([], 302, { location: target }).response,
    ]);
    await expect(fetchBytes("https://example.org")).rejects.toThrow(
      "許可していない転送先",
    );
    expect(calls).toHaveLength(1);
  });

  it.each([
    { headers: { Authorization: "Bearer secret" } },
    { body: encoder.encode("secret") },
  ])("never redirects a credentialed request", async (options) => {
    const { calls, fetchBytes } = runtime([
      reply([], 307, { location: "/same-host" }).response,
    ]);
    const error = await fetchBytes("https://example.org", options).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(FetchError);
    expect((error as FetchError).status).toBe(307);
    expect(calls).toHaveLength(1);
  });

  it("sends a POST body with caller headers", async () => {
    const { calls, fetchBytes } = runtime([reply(["ok"]).response]);
    await fetchBytes("https://example.org/api", {
      body: encoder.encode("payload"),
      headers: { "Content-Type": "application/json" },
    });
    const [, init] = calls[0] ?? [];
    expect(init?.method).toBe("POST");
    expect(text(init?.body as Uint8Array)).toBe("payload");
    expect(init?.headers).toEqual({
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
    });
  });

  it("rejects a redirect without a location", async () => {
    const { fetchBytes } = runtime([reply([], 302).response]);
    await expect(fetchBytes("https://example.org")).rejects.toThrow(
      "HTTP 転送には対応していません",
    );
  });

  it("keeps status and Retry-After but never remote text", async () => {
    let { fetchBytes } = runtime([
      reply(["secret"], 429, { "retry-after": "7200" }).response,
    ]);
    const error = await fetchBytes("https://example.org").catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(FetchError);
    expect([
      (error as FetchError).status,
      (error as FetchError).retryAfter,
    ]).toEqual([429, 7200]);
    expect(String(error)).not.toContain("secret");
    ({ fetchBytes } = runtime([new Error("Authorization: secret")]));
    const failure = await fetchBytes("https://example.org").catch(
      (caught: unknown) => caught,
    );
    expect(failure).toBeInstanceOf(FetchError);
    expect(String(failure)).not.toContain("secret");
  });

  it.each([
    "http://127.0.0.1/",
    "https://example.org/a/../private",
    "https://example.org\\evil",
    "file:///etc/passwd",
    "https://localhost/",
    "not a url",
  ])("never sends to the invalid URL %s", async (url) => {
    const { calls, fetchBytes } = runtime([]);
    await expect(fetchBytes(url)).rejects.toBeInstanceOf(FetchError);
    expect(calls).toEqual([]);
  });

  it.each([
    { headers: { Authorization: "secret\r\nBad: yes" } },
    { timeout: 0 },
    { timeout: Number.NaN },
    { maxBytes: -1 },
    { maxBytes: 1.5 },
  ])("rejects invalid options before sending", async (options) => {
    const { calls, fetchBytes } = runtime([]);
    await expect(
      fetchBytes("https://example.org", options),
    ).rejects.toBeInstanceOf(FetchError);
    expect(calls).toEqual([]);
  });

  it("bounds the redirect chain", async () => {
    const responses = Array.from(
      { length: 5 },
      () => reply([], 302, { location: "/again" }).response,
    );
    const { calls, fetchBytes } = runtime(responses);
    await expect(fetchBytes("https://example.org")).rejects.toThrow("転送回数");
    expect(calls).toHaveLength(4);
  });

  it("surfaces a caller abort as the caller reason, not a remote failure", async () => {
    const { response } = reply(["slow"], 200, {}, 50);
    const { calls, fetchBytes } = runtime([response]);
    const controller = new AbortController();
    const reason = new Error("job deadline");
    const pending = fetchBytes("https://example.org", {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(reason), 5);
    await expect(pending).rejects.toBe(reason);
    expect(calls[0]?.[1].signal?.aborted).toBe(true);
    const idle = runtime([]);
    await expect(
      idle.fetchBytes("https://example.org", { signal: controller.signal }),
    ).rejects.toBe(reason);
    expect(idle.calls).toEqual([]);
  });
});

describe("readBody", () => {
  it("bounds a stream without Content-Length and cancels the rest", async () => {
    const { response, state } = reply(["abc", "def", "ignored"]);
    await expect(readBody(response, 5)).rejects.toThrow("サイズ");
    expect(state.pending).toEqual(["ignored"]);
    expect(state.cancelled).toBe(true);
    expect(response.body?.locked).toBe(false);
  });

  it("reads an incoming request body under the same limit", async () => {
    const request = () =>
      new Request("https://example.org", { method: "POST", body: "abcdef" });
    expect(text(await readBody(request(), 6))).toBe("abcdef");
    await expect(readBody(request(), 3)).rejects.toThrow("サイズ");
    expect(
      (await readBody(new Request("https://example.org"), 0)).byteLength,
    ).toBe(0);
  });

  it("cancels on abort", async () => {
    const { response, state } = reply(["slow"], 200, {}, 50);
    const controller = new AbortController();
    const pending = readBody(response, 100, controller.signal);
    controller.abort(new Error("stop"));
    await expect(pending).rejects.toThrow("stop");
    expect(state.cancelled).toBe(true);
  });
});

describe("retryAfterSeconds", () => {
  it("accepts delta seconds and HTTP dates only", () => {
    expect(retryAfterSeconds(" 120 ")).toBe(120);
    expect(
      retryAfterSeconds(
        "Wed, 21 Oct 2015 07:28:00 GMT",
        Date.UTC(2015, 9, 21, 7, 0, 0) / 1000,
      ),
    ).toBe(1680);
    expect(
      retryAfterSeconds(
        "Wed, 21 Oct 2015 07:28:00 GMT",
        Date.UTC(2016, 0, 1) / 1000,
      ),
    ).toBe(0);
    for (const value of [
      "",
      "-1",
      "1.5",
      "123456789012",
      "2015-10-21T07:28:00Z",
      "soon",
    ])
      expect(retryAfterSeconds(value)).toBeUndefined();
  });
});
