// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BufferQuota } from "../src/domain.ts";
import { UserError } from "../src/errors.ts";
import { FetchError } from "../src/net/http.ts";
import type { FetchBytes } from "../src/net/types.ts";
import { BufferClient, PostError, Publisher } from "../src/publishing.ts";
import type { BufferPost, PublishingClient } from "../src/publishing.ts";
import type { SourceConfig } from "../src/sources/types.ts";
import { SQLRepository } from "../src/storage/repository.ts";
import { utf8 } from "../src/text.ts";

import { testRepository } from "./helpers/storage.ts";

const SOURCE: SourceConfig = {
  id: "test",
  name: "テスト",
  url: "https://example.org/rss",
  kind: "rss",
  enabled: true,
  description: "",
};
function post(
  text: string,
  status: BufferPost["status"] = "sending",
): BufferPost {
  return {
    id: "buffer-id",
    channelId: "channel",
    channelService: "twitter",
    text,
    status,
  };
}
const CHANNEL = {
  id: "channel",
  name: "@NilayNews",
  service: "twitter",
  allowedActions: ["scheduleUpdates", "readUpdates"],
  isDisconnected: false,
  isLocked: false,
  isQueuePaused: false,
  linkShortening: { isEnabled: false },
};
const LIMIT = {
  channelId: "channel",
  limit: 100,
  scheduled: 10,
  sent: 3,
  isAtLimit: false,
};
const ACCOUNT = { data: { channel: CHANNEL, dailyPostingLimits: [LIMIT] } };
const RATE = '"plan-window"; r=25; t=900';
const POLICY = '"plan-window"; q=100; w=900; pk=:c2VjcmV0:';

describe("durable accepted-post confirmation", () => {
  let repo: SQLRepository;
  let close: () => void;
  let now: number;
  let id: string;
  const clock = () => now;
  function client() {
    return {
      channel: "channel",
      verifyAccount: vi.fn(async () => undefined),
      post: vi.fn(async (text: string) => post(text)),
      getPost: vi.fn(async (_id: string, text: string) => post(text)),
    } satisfies PublishingClient;
  }
  beforeEach(async () => {
    now = 10_000;
    ({ repo, close } = testRepository([SOURCE], clock));
    await repo.initialize();
    await repo.ingest(SOURCE, [
      {
        title: "クマの対策",
        url: "https://example.org/article",
        excerpt: "クマの対策です",
        publishedAt: new Date(now * 1000).toISOString(),
      },
    ]);
    id = (await repo.articles())[0]?.id ?? "";
    await repo.review(id, "saved");
    await repo.updateSettings({ autoPost: true });
    now += 3601;
  });
  afterEach(() => close());

  it("finishes a delayed known identity after three checks across new application instances", async () => {
    const remote = client();
    remote.getPost.mockImplementationOnce(async (_id, text) =>
      post(text, "scheduled"),
    );
    remote.getPost.mockImplementationOnce(async (_id, text) =>
      post(text, "sending"),
    );
    remote.getPost.mockImplementationOnce(async (_id, text) =>
      post(text, "sent"),
    );
    const started = now;
    await new Publisher(repo, remote, clock).tick();
    await repo.updateSettings({ autoPost: false });
    for (const offset of [120, 360, 840]) {
      now = started + offset;
      const restarted = new SQLRepository(repo.driver, [SOURCE], clock);
      await new Publisher(restarted, remote, clock).tick();
    }
    expect(remote.post).toHaveBeenCalledTimes(1);
    expect(remote.verifyAccount).toHaveBeenCalledTimes(1);
    expect(remote.getPost).toHaveBeenCalledTimes(3);
    expect((await repo.publicationState()).posts[0]).toMatchObject({
      status: "posted",
      remoteStatus: "sent",
      lastObservedAt: now,
    });
    expect((await repo.settings()).autoPost).toBe(false);
  });

  it("serializes concurrent checks and fences a slow older response", async () => {
    const remote = client();
    const started = now;
    await new Publisher(repo, remote, clock).tick();
    let finish: (value: BufferPost) => void = () => undefined;
    const slow = new Promise<BufferPost>((resolve) => {
      finish = resolve;
    });
    remote.getPost.mockImplementationOnce(() => slow);
    now = started + 120;
    const older = new Publisher(repo, remote, clock).tick();
    await vi.waitFor(() => expect(remote.getPost).toHaveBeenCalledTimes(1));
    await new Publisher(repo, remote, clock).tick();
    expect(remote.getPost).toHaveBeenCalledTimes(1);
    now = started + 360;
    remote.getPost.mockImplementationOnce(async (_id, text) =>
      post(text, "sent"),
    );
    await new Publisher(repo, remote, clock).tick();
    const rejection = older.catch((error: unknown) => error);
    finish(post(remote.post.mock.calls[0]?.[0] ?? "", "sending"));
    expect(await rejection).toBeInstanceOf(UserError);
    expect((await repo.publicationState()).posts[0]?.status).toBe("posted");
    expect(remote.post).toHaveBeenCalledTimes(1);
  });

  it("does not retry an ambiguous create without a trusted identity", async () => {
    const remote = client();
    remote.post.mockRejectedValue(new PostError("確認してください", true));
    await new Publisher(repo, remote, clock).tick();
    now += 100_000;
    await new Publisher(repo, remote, clock).tick();
    expect(remote.post).toHaveBeenCalledTimes(1);
    expect(remote.getPost).not.toHaveBeenCalled();
    expect((await repo.publicationState()).posts[0]?.status).toBe("unknown");
  });

  it("keeps a successful remote create blocked when its quota observation cannot be saved", async () => {
    let creates = 0;
    const transport = vi.fn<FetchBytes>(async (_url, options) => {
      const request = JSON.parse(new TextDecoder().decode(options?.body)) as {
        query: string;
        variables: { input?: { text: string } };
      };
      const body = request.query.startsWith("mutation")
        ? {
            data: {
              createPost: {
                __typename: "PostActionSuccess",
                post: post(request.variables.input?.text ?? ""),
              },
            },
          }
        : ACCOUNT;
      if (request.query.startsWith("mutation")) creates += 1;
      return {
        data: utf8(JSON.stringify(body)),
        url: "",
        contentType: "",
        rateLimit: RATE,
      };
    });
    let observations = 0;
    const buffer = new BufferClient("private-key", "channel", transport, {
      clock,
      nextRequestOrder: () => repo.reserveBufferRequest(),
      observeQuota: async (quota) => {
        observations += 1;
        if (observations === 3) throw new Error("private database detail");
        await repo.recordBufferQuota(quota);
      },
    });
    await new Publisher(repo, buffer, clock).tick();
    expect(creates).toBe(1);
    expect((await repo.publicationState()).posts[0]?.status).toBe("unknown");
    expect((await repo.settings()).autoPost).toBe(false);
    expect(JSON.stringify(await repo.publicationState())).not.toContain(
      "private",
    );
    now += 100_000;
    const restarted = new SQLRepository(repo.driver, [SOURCE], clock);
    await new Publisher(restarted, buffer, clock).tick();
    expect(creates).toBe(1);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("honors persisted quota exhaustion without remote polling and ends at the deadline", async () => {
    const remote = client();
    const started = now;
    await new Publisher(repo, remote, clock).tick();
    await repo.recordBufferQuota({
      observedAt: now,
      api: {
        state: "known",
        windows: [{ name: "window-1", remaining: 0, resetAt: now + 86400 }],
      },
    });
    now = started + 120;
    await new Publisher(repo, remote, clock).tick();
    expect((await repo.publicationState()).posts[0]).toMatchObject({
      status: "submitted",
      nextCheckAt: started + 3600,
    });
    now = started + 3599;
    await new Publisher(repo, remote, clock).tick();
    expect(remote.getPost).not.toHaveBeenCalled();
    now += 1;
    await new Publisher(repo, remote, clock).tick();
    expect((await repo.publicationState()).posts[0]?.status).toBe("unknown");
    expect((await repo.settings()).autoPost).toBe(false);
    expect(remote.post).toHaveBeenCalledTimes(1);
  });

  it("backs off a read-only HTTP 429 and later confirms without another create", async () => {
    const remote = client();
    const started = now;
    await new Publisher(repo, remote, clock).tick();
    const transport = vi.fn<FetchBytes>();
    transport.mockRejectedValueOnce(
      new FetchError("private remote response", 429, 600, '"quota";r=0;t=600'),
    );
    transport.mockImplementationOnce(async () => ({
      data: utf8(
        JSON.stringify({
          data: { post: post(remote.post.mock.calls[0]?.[0] ?? "", "sent") },
        }),
      ),
      url: "",
      contentType: "",
    }));
    const buffer = new BufferClient("secret", "channel", transport, {
      clock,
      observeQuota: (quota) => repo.recordBufferQuota(quota),
      readQuota: () => repo.getRecord("buffer", "quota"),
    });
    now = started + 120;
    await new Publisher(repo, buffer, clock).tick();
    expect((await repo.publicationState()).posts[0]).toMatchObject({
      status: "submitted",
      nextCheckAt: started + 720,
    });
    now = started + 719;
    await new Publisher(repo, buffer, clock).tick();
    expect(transport).toHaveBeenCalledTimes(1);
    now += 1;
    await new Publisher(repo, buffer, clock).tick();
    expect((await repo.publicationState()).posts[0]?.status).toBe("posted");
    expect(transport).toHaveBeenCalledTimes(2);
    expect(remote.post).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await repo.publicationState())).not.toContain(
      "private",
    );
  });
});

describe("quota observations", () => {
  let repo: SQLRepository;
  let close: () => void;
  beforeEach(async () => {
    ({ repo, close } = testRepository([]));
    await repo.initialize();
  });
  afterEach(() => close());
  function buffer(body: unknown, rateLimit?: string, rateLimitPolicy?: string) {
    const transport = vi.fn<FetchBytes>(async () => ({
      data: utf8(JSON.stringify(body)),
      url: "",
      contentType: "",
      rateLimit,
      rateLimitPolicy,
    }));
    return new BufferClient("secret-key", "channel", transport, {
      clock: () => 10_000,
      observeQuota: (quota) => repo.recordBufferQuota(quota),
      nextRequestOrder: () => repo.reserveBufferRequest(),
    });
  }

  it("stores sanitized per-window observations and channel limits without changing the settings token", async () => {
    const before = await repo.settingsSnapshot();
    const revision = await repo.stateVersion();
    await buffer(ACCOUNT, RATE, POLICY).verifyAccount();
    const quota = await repo.getRecord<BufferQuota>("buffer", "quota");
    expect(quota?.api.windows).toEqual([
      {
        name: "window-1",
        remaining: 25,
        resetAt: 10900,
        seconds: 900,
        limit: 100,
      },
    ]);
    expect(quota?.channel).toMatchObject({
      channelId: "channel",
      scheduled: 10,
      sent: 3,
      limit: 100,
      atLimit: false,
    });
    expect(JSON.stringify(quota)).not.toContain("secret");
    expect(JSON.stringify(quota)).not.toContain("c2VjcmV0");
    expect(await repo.settingsSnapshot()).toEqual(before);
    expect(await repo.stateVersion()).toBe(revision);
  });

  it.each([undefined, "malformed"])(
    "records unknown or malformed quota information (%s)",
    async (header) => {
      const client = buffer(ACCOUNT, header);
      const outcome = await client
        .verifyAccount()
        .catch((error: unknown) => error);
      expect(outcome instanceof PostError).toBe(header !== undefined);
      expect(outcome === undefined).toBe(header === undefined);
      const quota = await repo.getRecord<BufferQuota>("buffer", "quota");
      expect(quota?.api.state).toBe(header ? "malformed" : "missing");
      expect(quota?.api.windows).toEqual([]);
    },
  );

  it("supports an explicitly unlimited channel and does not confuse it with API request limits", async () => {
    await buffer(
      {
        data: {
          channel: CHANNEL,
          dailyPostingLimits: [{ ...LIMIT, limit: null }],
        },
      },
      RATE,
      POLICY,
    ).verifyAccount();
    expect(
      (await repo.getRecord<BufferQuota>("buffer", "quota"))?.channel?.limit,
    ).toBeNull();
  });

  it("keeps newer quota and channel observations when an older request finishes later", async () => {
    await buffer(ACCOUNT, RATE, POLICY).verifyAccount();
    await repo.recordBufferQuota({
      observedAt: 10001,
      requestOrder: 2,
      api: { state: "missing", windows: [] },
    });
    await repo.recordBufferQuota({
      observedAt: 9999,
      requestOrder: 1,
      api: {
        state: "known",
        windows: [{ name: "old", remaining: 500, resetAt: 20000 }],
      },
    });
    const quota = await repo.getRecord<BufferQuota>("buffer", "quota");
    expect(quota?.observedAt).toBe(10001);
    expect(quota?.api.state).toBe("missing");
    expect(quota?.channel?.scheduled).toBe(10);
  });

  it("keeps API and channel observations independent during same-clock out-of-order responses", async () => {
    let resolve: (value: Awaited<ReturnType<FetchBytes>>) => void = () =>
      undefined;
    const older = new Promise<Awaited<ReturnType<FetchBytes>>>((done) => {
      resolve = done;
    });
    const transport = vi
      .fn<FetchBytes>()
      .mockReturnValueOnce(older)
      .mockResolvedValueOnce({
        data: utf8(JSON.stringify({ data: { post: post("text", "sent") } })),
        url: "",
        contentType: "",
        rateLimit: '"window";r=0;t=900',
      });
    const client = new BufferClient("secret-key", "channel", transport, {
      clock: () => 10_000,
      observeQuota: (quota) => repo.recordBufferQuota(quota),
      nextRequestOrder: () => repo.reserveBufferRequest(),
    });
    const verification = client.verifyAccount();
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    await client.getPost("buffer-id", "text");
    resolve({
      data: utf8(JSON.stringify(ACCOUNT)),
      url: "",
      contentType: "",
      rateLimit: RATE,
    });
    await verification;
    const quota = await repo.getRecord<BufferQuota>("buffer", "quota");
    expect(quota?.requestOrder).toBe(2);
    expect(quota?.api.windows[0]?.remaining).toBe(0);
    expect(quota?.channel).toMatchObject({ requestOrder: 1, scheduled: 10 });
    const channel = quota?.channel;
    if (!channel) throw new Error("Channel observation missing");
    await repo.recordBufferQuota({
      observedAt: 10000,
      requestOrder: 3,
      api: { state: "known", windows: [] },
      channel: { ...channel, requestOrder: 2, scheduled: 20 },
    });
    await repo.recordBufferQuota({
      observedAt: 10000,
      requestOrder: 4,
      api: { state: "missing", windows: [] },
      channel,
    });
    expect(
      (await repo.getRecord<BufferQuota>("buffer", "quota"))?.channel
        ?.scheduled,
    ).toBe(20);
  });

  it("starts Retry-After at the response time even when the request took 25 seconds", async () => {
    let now = 10000;
    const transport = vi.fn<FetchBytes>(async () => {
      now += 25;
      throw new FetchError("private", 429, 600, '"window";r=0;t=600');
    });
    const client = new BufferClient("secret", "channel", transport, {
      clock: () => now,
      observeQuota: (quota) => repo.recordBufferQuota(quota),
      nextRequestOrder: () => repo.reserveBufferRequest(),
    });
    await expect(client.verifyAccount()).rejects.toThrow("HTTP 429");
    const quota = await repo.getRecord<BufferQuota>("buffer", "quota");
    expect(quota?.observedAt).toBe(10025);
    expect(quota?.api.retryAt).toBe(10625);
    expect(quota?.api.windows[0]?.resetAt).toBe(10625);
    now = 10624;
    await expect(client.verifyAccount()).rejects.toThrow("利用上限");
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
