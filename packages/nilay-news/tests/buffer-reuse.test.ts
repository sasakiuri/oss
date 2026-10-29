// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";

import type { BufferQuota } from "../src/domain.ts";
import type { FetchBytes } from "../src/net/types.ts";
import { BufferClient } from "../src/publishing/buffer-client.ts";
import { utf8 } from "../src/text.ts";

import { account, limit, remotePost } from "./helpers/buffer.ts";

const verified = (changes: Record<string, unknown> = {}) =>
  account({}, [limit({ scheduled: 0, sent: 0, ...changes })]);
const created = {
  data: { createPost: { __typename: "PostActionSuccess", post: remotePost() } },
};

function response(body: unknown, rateLimit?: string) {
  return {
    data: utf8(JSON.stringify(body)),
    url: "https://api.buffer.com",
    contentType: "application/json",
    rateLimit,
  };
}

describe("short-lived Buffer verification reuse", () => {
  it("reuses only when requested and keeps preflight or enabling checks fresh", async () => {
    const transport = vi
      .fn<FetchBytes>()
      .mockResolvedValue(response(verified()));
    const client = new BufferClient("fixture-key", "channel-123", transport);
    await client.verifyAccount();
    await client.verifyAccount(true);
    expect(transport).toHaveBeenCalledTimes(1);
    await client.verifyAccount();
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each([-1, 45])(
    "refreshes when the clock moves by %i seconds",
    async (elapsed) => {
      let now = 10000;
      const transport = vi
        .fn<FetchBytes>()
        .mockResolvedValue(response(verified()));
      const client = new BufferClient("fixture-key", "channel-123", transport, {
        clock: () => now,
      });
      await client.verifyAccount();
      now += elapsed;
      await client.verifyAccount(true);
      expect(transport).toHaveBeenCalledTimes(2);
    },
  );

  it("expires at an API window reset even before 45 seconds", async () => {
    let now = 10000;
    const transport = vi
      .fn<FetchBytes>()
      .mockResolvedValue(response(verified(), '"short";r=99;t=10'));
    const client = new BufferClient("fixture-key", "channel-123", transport, {
      clock: () => now,
    });
    await client.verifyAccount();
    now += 9;
    await client.verifyAccount(true);
    expect(transport).toHaveBeenCalledTimes(1);
    now += 1;
    await client.verifyAccount(true);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("counts scheduled and sent posts together and refreshes after consuming the last slot", async () => {
    const transport = vi
      .fn<FetchBytes>()
      .mockResolvedValueOnce(
        response(verified({ limit: 10, scheduled: 2, sent: 7 })),
      )
      .mockResolvedValueOnce(response(created))
      .mockResolvedValueOnce(
        response(verified({ limit: 10, scheduled: 2, sent: 8 })),
      );
    const client = new BufferClient("fixture-key", "channel-123", transport);
    await client.verifyAccount();
    await client.post("本文");
    await expect(client.verifyAccount(true)).rejects.toThrow("10/10 件");
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it("refreshes a finite window with an unreported sent count", async () => {
    const transport = vi
      .fn<FetchBytes>()
      .mockResolvedValue(response(account()));
    const client = new BufferClient("fixture-key", "channel-123", transport);
    await client.verifyAccount();
    await client.verifyAccount(true);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("can reuse an unlimited posting window", async () => {
    const transport = vi
      .fn<FetchBytes>()
      .mockResolvedValue(response(verified({ limit: null, sent: undefined })));
    const client = new BufferClient("fixture-key", "channel-123", transport);
    await client.verifyAccount();
    await client.verifyAccount(true);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['"short";r=7;t=900', "残り 7 回"],
    ["malformed", "残り利用回数を確認できません"],
  ])(
    "keeps an accepted post but refuses the next send for %s",
    async (header, message) => {
      const transport = vi
        .fn<FetchBytes>()
        .mockResolvedValueOnce(response(verified(), '"short";r=99;t=900'))
        .mockResolvedValueOnce(response(created, header));
      const client = new BufferClient("fixture-key", "channel-123", transport);
      await client.verifyAccount();
      expect((await client.post("本文")).id).toBe("buffer-123");
      await expect(client.verifyAccount(true)).rejects.toThrow(message);
      await expect(client.post("本文")).rejects.toThrow(message);
      expect(transport).toHaveBeenCalledTimes(2);
    },
  );

  it("checks a newer durable quota before sending and preserves read-only confirmation", async () => {
    const transport = vi
      .fn<FetchBytes>()
      .mockResolvedValueOnce(response(verified()))
      .mockResolvedValueOnce(response({ data: { post: remotePost() } }));
    let quota: BufferQuota | null = null;
    const client = new BufferClient("fixture-key", "channel-123", transport, {
      clock: () => 10000,
      readQuota: async () => quota,
    });
    await client.verifyAccount();
    quota = {
      observedAt: 10000,
      api: {
        state: "known",
        windows: [{ name: "window", remaining: 7, resetAt: 10900 }],
      },
    };
    await expect(client.post("本文")).rejects.toThrow("残り 7 回");
    expect(transport).toHaveBeenCalledTimes(1);
    expect((await client.getPost("buffer-123", "本文")).status).toBe("sent");
  });

  it.each([9999, 10000])(
    "does not reject a send using a low window reset at %i",
    async (resetAt) => {
      const transport = vi
        .fn<FetchBytes>()
        .mockResolvedValue(response(created));
      const client = new BufferClient("fixture-key", "channel-123", transport, {
        clock: () => 10000,
        readQuota: async () => ({
          observedAt: 9000,
          api: {
            state: "known",
            windows: [{ name: "old", remaining: 7, resetAt }],
          },
        }),
      });
      expect((await client.post("本文")).id).toBe("buffer-123");
    },
  );

  it("invalidates verification after an uncertain create failure", async () => {
    const transport = vi
      .fn<FetchBytes>()
      .mockResolvedValueOnce(response(verified()))
      .mockResolvedValueOnce(
        response({ data: { createPost: { __typename: "UnexpectedError" } } }),
      )
      .mockResolvedValueOnce(response(verified()));
    const client = new BufferClient("fixture-key", "channel-123", transport);
    await client.verifyAccount();
    await expect(client.post("本文")).rejects.toMatchObject({
      uncertain: true,
    });
    await client.verifyAccount(true);
    expect(transport).toHaveBeenCalledTimes(3);
  });
});
