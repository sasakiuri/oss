// SPDX-License-Identifier: MIT
import type { Mock } from "vitest";
import { describe, expect, it, vi } from "vitest";

import { FetchError } from "../src/net/http.ts";
import type { FetchBytes, FetchOptions } from "../src/net/types.ts";
import { BufferClient } from "../src/publishing/buffer-client.ts";
import { xPostId } from "../src/publishing/buffer-post.ts";
import { PostError } from "../src/publishing/errors.ts";
import { utf8 } from "../src/text.ts";

import { channel, limit, account, remotePost } from "./helpers/buffer.ts";

const CHANNEL = channel();
const LIMIT = limit();
const BUFFER_RATE =
  '"100-in-15min"; r=99; t=900, "250-in-1day"; r=244; t=70610, "3000-in-30days"; r=2994; t=2576210';

function replying(...bodies: unknown[]): Mock<FetchBytes> {
  const transport = vi.fn<FetchBytes>();
  for (const body of bodies)
    transport.mockResolvedValueOnce({
      data: utf8(typeof body === "string" ? body : JSON.stringify(body)),
      url: "",
      contentType: "",
    });
  return transport;
}

function sent(
  transport: Mock<FetchBytes>,
  index = 0,
): {
  url: string;
  options: FetchOptions;
  request: { query: string; variables: unknown };
} {
  const [url = "", options = {}] = transport.mock.calls[index] ?? [];
  return {
    url,
    options,
    request: JSON.parse(new TextDecoder().decode(options.body)) as {
      query: string;
      variables: unknown;
    },
  };
}

async function failure(promise: Promise<unknown>): Promise<PostError> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(PostError);
  return error as PostError;
}

describe("BufferClient", () => {
  it("verifies the channel and sends a share-now payload with the key only in the header", async () => {
    const transport = replying(account(), {
      data: {
        createPost: { __typename: "PostActionSuccess", post: remotePost() },
      },
    });
    const client = new BufferClient("secret-key", "channel-123", transport);
    expect(client.configured).toBe(true);
    expect(client.channel).toBe("channel-123");
    await client.verifyAccount();
    expect(sent(transport).request.query).toContain("allowedActions");
    // The daily posting limit is read in the same single request.
    expect(sent(transport).request.query).toContain(
      "dailyPostingLimits(input: $limits) { channelId isAtLimit limit scheduled sent }",
    );
    expect(sent(transport).request.variables).toEqual({
      input: { id: "channel-123" },
      limits: { channelIds: ["channel-123"] },
    });
    expect((await client.post("本文")).id).toBe("buffer-123");
    const { url, options, request } = sent(transport, 1);
    expect(url).toBe("https://api.buffer.com");
    expect(request.variables).toEqual({
      input: {
        channelId: "channel-123",
        text: "本文",
        schedulingType: "automatic",
        mode: "shareNow",
      },
    });
    expect(options.headers).toEqual({
      Authorization: "Bearer secret-key",
      "Content-Type": "application/json",
    });
    expect([options.timeout, options.maxBytes]).toEqual([25, 100_000]);
    expect(new TextDecoder().decode(options.body)).not.toContain("secret-key");
    expect(() =>
      options.beforeRedirect?.("https://www.api.buffer.com"),
    ).toThrow(FetchError);
  });

  it.each([
    { id: "other" },
    { name: "Other" },
    { name: null },
    { service: "facebook" },
    { allowedActions: [] },
    { allowedActions: ["readUpdates"] },
    { allowedActions: ["scheduleUpdates"] },
    { allowedActions: "scheduleUpdates readUpdates" },
    { allowedActions: null },
    { allowedActions: undefined },
    { isDisconnected: true },
    { isLocked: true },
    { isQueuePaused: true },
    { isLocked: null },
    { isQueuePaused: undefined },
    { linkShortening: { isEnabled: true } },
    { linkShortening: {} },
    { linkShortening: null },
  ])("rejects the channel change %j", async (change) => {
    const client = new BufferClient(
      "key",
      "channel-123",
      replying(account(change)),
    );
    const error = await failure(client.verifyAccount());
    expect(error.uncertain).toBe(false);
  });

  it("accepts the account name case-insensitively without the @ prefix", async () => {
    await new BufferClient(
      "key",
      "channel-123",
      replying(account({ name: "nilaynews" })),
    ).verifyAccount();
  });

  it.each([
    [401, false],
    [403, false],
    [429, false],
    [408, true],
    [500, true],
    [undefined, true],
  ])(
    "classifies HTTP %s on a mutation without retrying or leaking text",
    async (status, uncertain) => {
      const transport = vi
        .fn<FetchBytes>()
        .mockRejectedValue(new FetchError("secret remote body", status));
      const error = await failure(
        new BufferClient("key", "channel-123", transport).post("hello"),
      );
      expect(error.uncertain).toBe(uncertain);
      expect(error.message).not.toContain("secret");
      expect(error.message).toContain(
        uncertain ? "登録結果が不明" : `HTTP ${status}`,
      );
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it("never marks a failed query as uncertain", async () => {
    const transport = vi
      .fn<FetchBytes>()
      .mockRejectedValue(new FetchError("secret", undefined));
    const error = await failure(
      new BufferClient("key", "channel-123", transport).verifyAccount(),
    );
    expect([error.uncertain, error.message.includes("通信エラー")]).toEqual([
      false,
      true,
    ]);
  });

  it("lets a non-transport failure propagate unchanged", async () => {
    const abort = new Error("deadline");
    const transport = vi.fn<FetchBytes>().mockRejectedValue(abort);
    await expect(
      new BufferClient("key", "channel-123", transport).post("hello"),
    ).rejects.toBe(abort);
  });

  it.each([
    "bad json",
    "[]",
    '{"data":[]}',
    '{"data":{}}',
    '{"data":{"createPost":{}},"errors":[{"message":"secret"}]}',
    new Uint8Array([0xff]),
  ])("treats an unverifiable mutation response as uncertain", async (raw) => {
    const transport = vi.fn<FetchBytes>().mockResolvedValue({
      data: typeof raw === "string" ? utf8(raw) : raw,
      url: "",
      contentType: "",
    });
    const error = await failure(
      new BufferClient("key", "channel-123", transport).post("hello"),
    );
    expect(error.uncertain).toBe(true);
    expect(error.message).not.toContain("secret");
  });

  it("ignores an empty GraphQL error list", async () => {
    const client = new BufferClient(
      "key",
      "channel-123",
      replying({ ...account(), errors: [] }),
    );
    await client.verifyAccount();
  });

  it.each([
    ["InvalidInputError", false],
    ["LimitReachedError", false],
    ["NotFoundError", false],
    ["UnauthorizedError", false],
    ["UnexpectedError", true],
    ["RestProxyError", true],
    [undefined, true],
  ])("distinguishes the typed result %s", async (kind, uncertain) => {
    const client = new BufferClient(
      "key",
      "channel-123",
      replying({
        data: { createPost: { __typename: kind, message: "secret" } },
      }),
    );
    const error = await failure(client.post("本文"));
    expect(error.uncertain).toBe(uncertain);
    expect(error.message).not.toContain("secret");
  });

  it("rejects a created post that does not match the request", async () => {
    const client = new BufferClient(
      "key",
      "channel-123",
      replying({
        data: {
          createPost: {
            __typename: "PostActionSuccess",
            post: remotePost("changed"),
          },
        },
      }),
    );
    expect((await failure(client.post("本文"))).uncertain).toBe(true);
  });

  it.each([
    { id: "other" },
    { id: "bad id" },
    { channelId: "other" },
    { channelService: "facebook" },
    { text: "changed" },
    { status: "unknown" },
    { status: null },
  ])(
    "requires the fetched post identity, channel, text and status to match %j",
    async (change) => {
      const client = new BufferClient(
        "key",
        "channel-123",
        replying({ data: { post: remotePost("本文", "sent", change) } }),
      );
      expect(
        (await failure(client.getPost("buffer-123", "本文"))).uncertain,
      ).toBe(true);
    },
  );

  it("fetches a submitted post by id against the channel it was submitted to", async () => {
    const transport = replying(
      { data: { post: remotePost("本文", "sending") } },
      {
        data: {
          post: remotePost("本文", "sending", { channelId: "old-channel" }),
        },
      },
    );
    const client = new BufferClient("key", "channel-123", transport);
    expect((await client.getPost("buffer-123", "本文")).status).toBe("sending");
    expect(sent(transport).request.variables).toEqual({
      input: { id: "buffer-123" },
    });
    expect(
      (await client.getPost("buffer-123", "本文", "old-channel")).channelId,
    ).toBe("old-channel");
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["empty", []],
    ["not a list", LIMIT],
    ["two results", [LIMIT, LIMIT]],
    ["another channel", [{ ...LIMIT, channelId: "other" }]],
    ["at the limit", [{ ...LIMIT, isAtLimit: true }]],
    ["full", [{ ...LIMIT, scheduled: 100 }]],
    ["over", [{ ...LIMIT, scheduled: 101 }]],
    ["zero limit", [{ ...LIMIT, limit: 0, scheduled: 0 }]],
    ["no flag", [{ ...LIMIT, isAtLimit: null }]],
    ["fractional", [{ ...LIMIT, scheduled: 1.5 }]],
    ["negative", [{ ...LIMIT, scheduled: -1 }]],
    ["text count", [{ ...LIMIT, limit: "100" }]],
    ["null sent count", [{ ...LIMIT, sent: null }]],
    ["negative limit", [{ ...LIMIT, limit: -1 }]],
  ])("refuses a daily posting limit that is %s", async (_, limits) => {
    const transport = replying(
      limits === undefined
        ? { data: { channel: CHANNEL } }
        : account({}, limits),
    );
    const error = await failure(
      new BufferClient("key", "channel-123", transport).verifyAccount(),
    );
    expect(error.uncertain).toBe(false);
    expect(error.message).toContain("1日の投稿上限");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("reports the daily count when the channel is full", async () => {
    const error = await failure(
      new BufferClient(
        "key",
        "channel-123",
        replying(account({}, [{ ...LIMIT, scheduled: 100 }])),
      ).verifyAccount(),
    );
    expect(error.message).toContain("100/100 件");
  });

  function rated(
    rateLimit: string | undefined,
    ...bodies: unknown[]
  ): Mock<FetchBytes> {
    const transport = vi.fn<FetchBytes>();
    for (const body of bodies)
      transport.mockResolvedValueOnce({
        data: utf8(JSON.stringify(body)),
        url: "",
        contentType: "",
        ...(rateLimit === undefined ? {} : { rateLimit }),
      });
    return transport;
  }

  it.each([
    BUFFER_RATE,
    '"100-in-15min";r=8;t=900',
    '  "a" ;  r=8 ; t=1 ,"b";r=250;t=2;pk=:c2VjcmV0:  ',
    'window; r=10; t=5, "day"; r=8; t=0',
  ])("accepts the rate budget %s", async (header) => {
    await new BufferClient(
      "key",
      "channel-123",
      rated(header, account()),
    ).verifyAccount();
  });

  it("accepts a response without a RateLimit header", async () => {
    await new BufferClient(
      "key",
      "channel-123",
      rated(undefined, account()),
    ).verifyAccount();
  });

  it.each([
    ['"100-in-15min"; r=3; t=900', "残り 3 回", "約15分"],
    [
      '"100-in-15min"; r=99; t=900, "250-in-1day"; r=3; t=70610',
      "残り 3 回",
      "約20時間",
    ],
    [
      '"100-in-15min"; r=0; t=60, "3000-in-30days"; r=2; t=2576210',
      "残り 0 回",
      "約30日",
    ],
  ])(
    "refuses a low rate budget %s before any post",
    async (header, remaining, wait) => {
      const transport = rated(header, account());
      const error = await failure(
        new BufferClient(
          "secret-key",
          "channel-123",
          transport,
        ).verifyAccount(),
      );
      expect(error.uncertain).toBe(false);
      expect(error.message).toContain(remaining);
      expect(error.message).toContain(wait);
      expect(error.message).not.toContain("secret");
      expect(error.message).not.toContain("100-in-15min");
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    "",
    " ",
    "garbage",
    '"a"; r=5',
    '"a"; t=5',
    '"a"; r=-1; t=5',
    '"a"; r=1.5; t=5',
    '"a"; r=x; t=5',
    '"a"; r=5; r=6; t=5',
    '"a"; r=5; t=5,',
    '"a"; r=5; t=5, garbage',
    '"a; r=5; t=5',
    '"a" r=5 t=5',
  ])("fails closed on the malformed RateLimit header %j", async (header) => {
    const error = await failure(
      new BufferClient(
        "key",
        "channel-123",
        rated(header, account()),
      ).verifyAccount(),
    );
    expect(error.uncertain).toBe(false);
    expect(error.message).toContain("残り利用回数を確認できません");
  });

  it("never discards a created or fetched post because of a low budget", async () => {
    const low = '"100-in-15min"; r=0; t=900';
    const transport = rated(
      low,
      {
        data: {
          createPost: { __typename: "PostActionSuccess", post: remotePost() },
        },
      },
      { data: { post: remotePost() } },
    );
    let at = 10000;
    const client = new BufferClient("key", "channel-123", transport, {
      clock: () => at,
    });
    expect((await client.post("本文")).id).toBe("buffer-123");
    await expect(client.getPost("buffer-123", "本文")).rejects.toThrow(
      "残り利用回数の観測",
    );
    expect(transport).toHaveBeenCalledTimes(1);
    at += 900;
    expect((await client.getPost("buffer-123", "本文")).status).toBe("sent");
  });

  it.each([
    [900, "約15分"],
    [0, "約1分"],
    [7200, "約2時間"],
  ])(
    "reports Retry-After %s on HTTP 429 without retrying",
    async (retryAfter, wait) => {
      for (const call of ["verifyAccount", "post"] as const) {
        const transport = vi
          .fn<FetchBytes>()
          .mockRejectedValue(new FetchError("secret", 429, retryAfter));
        const client = new BufferClient("key", "channel-123", transport);
        const error = await failure(
          call === "post" ? client.post("本文") : client.verifyAccount(),
        );
        expect(error.uncertain).toBe(false);
        expect(error.message).toContain("HTTP 429");
        expect(error.message).toContain(wait);
        expect(transport).toHaveBeenCalledTimes(1);
      }
    },
  );

  it("reports HTTP 429 without a usable Retry-After", async () => {
    const error = await failure(
      new BufferClient(
        "key",
        "channel-123",
        vi.fn<FetchBytes>().mockRejectedValue(new FetchError("secret", 429)),
      ).verifyAccount(),
    );
    expect(error.message).toContain("HTTP 429");
    expect(error.message).toContain("しばらく待って");
  });

  it("never calls the transport without credentials", async () => {
    const transport = vi.fn<FetchBytes>();
    for (const client of [
      new BufferClient("", "channel", transport),
      new BufferClient("key", "", transport),
    ]) {
      expect(client.configured).toBe(false);
      await expect(client.verifyAccount()).rejects.toThrow("API キー");
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it("builds a post id only from a known X URL", () => {
    const cases: [unknown, string | null][] = [
      ["https://x.com/NilayNews/status/123", "123"],
      ["https://twitter.com/i/web/status/456/", "456"],
      ["HTTPS://X.COM/nilaynews/status/789", "789"],
      ["https://x.com/Other/status/1", null],
      ["https://evil.test/NilayNews/status/1", null],
      ["https://x.com/NilayNews/status/1?x=1", null],
      [null, null],
      [7, null],
    ];
    for (const [externalLink, expected] of cases)
      expect(xPostId(remotePost("本文", "sent", { externalLink }))).toBe(
        expected,
      );
  });
});
