// SPDX-License-Identifier: MIT
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UserError } from "../src/errors.ts";
import { FetchError } from "../src/net/http.ts";
import type { FetchBytes, FetchOptions } from "../src/net/types.ts";
import type { BufferPost, PublishingClient } from "../src/publishing.ts";
import {
  BufferClient,
  PostError,
  Publisher,
  xPostId,
} from "../src/publishing.ts";
import type { CollectedItem, SourceConfig } from "../src/sources/types.ts";
import type { SQLRepository } from "../src/storage/repository.ts";
import { utf8 } from "../src/text.ts";

import { testRepository } from "./helpers/storage.ts";

const SOURCE: SourceConfig = {
  id: "test",
  name: "テスト新聞",
  url: "https://example.org/rss",
  kind: "rss",
  enabled: true,
  description: "テスト",
};
const ITEM: CollectedItem = {
  title: "北海道でクマを捕獲",
  url: "https://example.org/article/1",
  excerpt: "北海道の町でクマを捕獲した。",
  publishedAt: "2026-09-27T00:00:00+00:00",
};
const CHANNEL = {
  id: "channel-123",
  name: "@NilayNews",
  service: "twitter",
  isDisconnected: false,
  isLocked: false,
  isQueuePaused: false,
  linkShortening: { isEnabled: false },
};

function remotePost(
  text = "本文",
  status: BufferPost["status"] = "sent",
  changes: Record<string, unknown> = {},
): BufferPost {
  return {
    id: "buffer-123",
    channelId: "channel-123",
    channelService: "twitter",
    text,
    status,
    externalLink: "https://x.com/NilayNews/status/123",
    ...changes,
  } as BufferPost;
}

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
    const transport = replying(
      { data: { channel: CHANNEL } },
      {
        data: {
          createPost: { __typename: "PostActionSuccess", post: remotePost() },
        },
      },
    );
    const client = new BufferClient("secret-key", "channel-123", transport);
    expect(client.configured).toBe(true);
    expect(client.channel).toBe("channel-123");
    await client.verifyAccount();
    expect(sent(transport).request.variables).toEqual({
      input: { id: "channel-123" },
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
      replying({ data: { channel: { ...CHANNEL, ...change } } }),
    );
    const error = await failure(client.verifyAccount());
    expect(error.uncertain).toBe(false);
  });

  it("accepts the account name case-insensitively without the @ prefix", async () => {
    await new BufferClient(
      "key",
      "channel-123",
      replying({ data: { channel: { ...CHANNEL, name: "nilaynews" } } }),
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
      replying({ data: { channel: CHANNEL }, errors: [] }),
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

describe("Publisher", () => {
  let now: number;
  let repo: SQLRepository;
  let close: () => void;
  let articleId: string;
  const clock = () => now;

  interface FakeClient extends PublishingClient {
    channel: string;
    verifyAccount: Mock<PublishingClient["verifyAccount"]>;
    post: Mock<PublishingClient["post"]>;
    getPost: Mock<PublishingClient["getPost"]>;
  }

  function fakeClient(): FakeClient {
    return {
      channel: "channel-123",
      verifyAccount: vi.fn<PublishingClient["verifyAccount"]>(
        async () => undefined,
      ),
      post: vi.fn<PublishingClient["post"]>(async (text) => remotePost(text)),
      getPost: vi.fn<PublishingClient["getPost"]>(async (_id, text) =>
        remotePost(text),
      ),
    };
  }

  async function add(index: number): Promise<string> {
    await repo.ingest(SOURCE, [
      {
        ...ITEM,
        url: `https://example.org/article/${index}`,
        publishedAt: `2026-09-${String(index).padStart(2, "0")}T00:00:00+00:00`,
      },
    ]);
    const article = (await repo.articles()).find((item) =>
      item.url.endsWith(`/${index}`),
    );
    await repo.review(article?.id ?? "", "saved");
    return article?.id ?? "";
  }

  async function state() {
    return repo.publicationState();
  }

  beforeEach(async () => {
    now = 10000;
    ({ repo, close } = testRepository([SOURCE], clock));
    await repo.initialize();
    articleId = await add(1);
    await repo.updateSettings({ autoPost: true });
    now += 3601;
  });

  afterEach(() => {
    close();
    vi.restoreAllMocks();
  });

  function bufferTransport(calls: string[]): FetchBytes {
    return async (url, options) => {
      const request = JSON.parse(new TextDecoder().decode(options?.body)) as {
        query: string;
        variables: { input: { text?: string } };
      };
      calls.push(request.query);
      const data = request.query.includes("createPost")
        ? {
            createPost: {
              __typename: "PostActionSuccess",
              post: remotePost(request.variables.input.text, "sent"),
            },
          }
        : { channel: { ...CHANNEL, name: "NilayNews" } };
      return {
        data: utf8(JSON.stringify({ data })),
        url,
        contentType: "application/json",
      };
    };
  }

  it("publishes an article once across concurrent invocations", async () => {
    const calls: string[] = [];
    const publisher = new Publisher(
      repo,
      new BufferClient("fixture-key", "channel-123", bufferTransport(calls)),
      clock,
    );
    await Promise.all([publisher.tick(), publisher.tick()]);
    await publisher.tick();
    expect(calls).toHaveLength(2);
    const publication = await state();
    expect([
      publication.posts[0]?.status,
      publication.posts[0]?.postId,
    ]).toEqual(["posted", "123"]);
    expect((await repo.article(articleId)).reviewStatus).toBe("posted");
    expect(publication.nextAt).toBeGreaterThanOrEqual(now + 3600);
  });

  it.each(["riflesports-news", "clay-shooting-news", "gibier-news"])(
    "posts a %s article once without Jev and only when enabled",
    async (sourceId) => {
      const calls: string[] = [];
      const publisher = new Publisher(
        repo,
        new BufferClient("fixture-key", "channel-123", bufferTransport(calls)),
        clock,
      );
      await repo.updateSettings({
        postSelection: "candidates",
        autoPost: false,
      });
      await repo.ingest({ ...SOURCE, id: sourceId }, [
        { ...ITEM, url: "https://example.org/rifle" },
      ]);
      const rifle = (await repo.articles()).find((item) =>
        item.url.endsWith("/rifle"),
      );
      expect(rifle?.analysisStatus).toBe("pending");
      await publisher.tick();
      expect(calls).toEqual([]);
      await repo.updateSettings({ autoPost: true });
      await publisher.tick();
      now += 7200;
      await publisher.tick();
      expect(calls).toHaveLength(2);
      const { posts } = await state();
      expect(posts.map((post) => [post.articleId, post.status])).toEqual([
        [rifle?.id, "posted"],
      ]);
      expect(await repo.postCandidates()).toEqual([]);
    },
  );

  it("never retries an uncertain mutation automatically", async () => {
    const calls: string[] = [];
    const ok = bufferTransport(calls);
    const transport: FetchBytes = async (url, options) => {
      const result = await ok(url, options);
      if (calls.at(-1)?.includes("createPost"))
        throw new FetchError("timeout after sending");
      return result;
    };
    const publisher = new Publisher(
      repo,
      new BufferClient("fixture-key", "channel-123", transport),
      clock,
    );
    await publisher.tick();
    now += 7200;
    await publisher.tick();
    expect((await state()).posts[0]?.status).toBe("unknown");
    expect((await repo.settings()).autoPost).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("records a wrong account as failed without sending the mutation", async () => {
    const calls: string[] = [];
    const ok = bufferTransport(calls);
    const transport: FetchBytes = async (url, options) => {
      const result = await ok(url, options);
      const value = JSON.parse(new TextDecoder().decode(result.data)) as {
        data: { channel: Record<string, unknown> };
      };
      value.data.channel.name = "another-account";
      return { ...result, data: utf8(JSON.stringify(value)) };
    };
    await new Publisher(
      repo,
      new BufferClient("fixture-key", "channel-123", transport),
      clock,
    ).tick();
    expect(calls).toHaveLength(1);
    const post = (await state()).posts[0];
    expect([post?.status, post?.error]).toEqual([
      "failed",
      "Buffer の投稿先が X の @NilayNews と一致しません",
    ]);
  });

  it("does nothing when publishing is disabled or nothing is due", async () => {
    const client = fakeClient();
    await repo.updateSettings({ autoPost: false });
    await new Publisher(repo, client, clock).tick();
    expect(client.verifyAccount).not.toHaveBeenCalled();
    expect(client.post).not.toHaveBeenCalled();
  });

  it("waits a full hour after network latency before the next post", async () => {
    await add(2);
    const client = fakeClient();
    client.verifyAccount.mockImplementation(async () => {
      now += 20;
    });
    client.post.mockImplementation(async (text) => {
      now += 20;
      return remotePost(text);
    });
    const publisher = new Publisher(repo, client, clock);
    const started = now;
    await publisher.tick();
    expect((await state()).nextAt).toBe(started + 40 + 3600);
    now = started + 40 + 3599;
    await publisher.tick(now);
    expect(client.post).toHaveBeenCalledTimes(1);
    now += 1;
    await publisher.tick(now);
    expect(client.post).toHaveBeenCalledTimes(2);
  });

  it("confirms a submitted post later against its stored channel, then completes it", async () => {
    const client = fakeClient();
    client.post.mockImplementation(async (text) => remotePost(text, "sending"));
    const publisher = new Publisher(repo, client, clock);
    const started = now;
    await publisher.tick();
    expect((await state()).posts[0]?.status).toBe("submitted");
    expect((await repo.article(articleId)).reviewStatus).toBe("saved");
    client.channel = "changed-channel";
    await repo.updateSettings({ autoPost: false });
    now = started + 119;
    await publisher.tick();
    expect(client.getPost).not.toHaveBeenCalled();
    now = started + 120;
    client.getPost.mockImplementation(async () => {
      now += 25;
      return remotePost(client.post.mock.calls[0]?.[0]);
    });
    await publisher.tick();
    expect(client.getPost).toHaveBeenCalledWith(
      "buffer-123",
      client.post.mock.calls[0]?.[0],
      "channel-123",
    );
    expect((await repo.article(articleId)).reviewStatus).toBe("posted");
    expect((await state()).nextAt).toBe(started + 145 + 3600);
  });

  it("confirms a stored post with its original text after the tag rules change", async () => {
    const client = fakeClient();
    client.post.mockImplementation(async (text) => remotePost(text, "sending"));
    const publisher = new Publisher(repo, client, clock);
    const started = now;
    await publisher.tick();
    expect(client.post.mock.calls[0]?.[0]).toBe(
      "北海道でクマを捕獲\nhttps://example.org/article/1\n#テスト新聞 #北海道 #クマ #鳥獣被害対策",
    );
    const legacy =
      "北海道でクマを捕獲\nhttps://example.org/article/1\n#NilayNews #クマ";
    await repo.driver.batch([
      [
        "UPDATE news_posts SET data=json_set(data,'$.text',?) WHERE id=?",
        [legacy, articleId],
      ],
    ]);
    now = started + 120;
    await publisher.tick();
    expect(client.getPost).toHaveBeenCalledWith(
      "buffer-123",
      legacy,
      "channel-123",
    );
    expect(client.post).toHaveBeenCalledTimes(1);
    const [post] = (await state()).posts;
    expect([post?.status, post?.text]).toEqual(["posted", legacy]);
    now += 7200;
    await publisher.tick();
    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it("allows at most two confirmation requests and never resends", async () => {
    await add(2);
    const client = fakeClient();
    client.post.mockImplementation(async (text) =>
      remotePost(text, "scheduled"),
    );
    client.getPost.mockImplementation(async (_id, text) =>
      remotePost(text, "sending"),
    );
    const publisher = new Publisher(repo, client, clock);
    const started = now;
    for (const offset of [0, 120, 3600, 3720, 4400, 5400, 999999]) {
      now = started + offset;
      await publisher.tick();
    }
    expect(client.getPost).toHaveBeenCalledTimes(2);
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(
      (await state()).posts.find((post) => post.articleId === articleId)
        ?.status,
    ).toBe("unknown");
    expect((await repo.settings()).autoPost).toBe(false);
  });

  it.each(["error", "draft", "needs_approval"] as const)(
    "treats a %s result as incomplete at once",
    async (status) => {
      const client = fakeClient();
      client.post.mockImplementation(async (text) => remotePost(text, status));
      await new Publisher(repo, client, clock).tick();
      const post = (await state()).posts[0];
      expect([post?.status, post?.error]).toEqual([
        "unknown",
        "Buffer の投稿が完了していません。Buffer と X を確認してください",
      ]);
    },
  );

  it("pauses after two failed confirmation requests without storing remote text", async () => {
    const client = fakeClient();
    client.post.mockImplementation(async (text) => remotePost(text, "sending"));
    client.getPost.mockRejectedValue(new PostError("private response"));
    const publisher = new Publisher(repo, client, clock);
    const started = now;
    for (const offset of [0, 120, 3720]) {
      now = started + offset;
      await publisher.tick();
    }
    expect(client.getPost).toHaveBeenCalledTimes(2);
    expect((await repo.settings()).autoPost).toBe(false);
    expect(JSON.stringify(await state())).not.toContain("private");
  });

  it.each([
    [
      "a known rejection",
      () => new PostError("拒否されました"),
      false,
      "failed",
      "拒否されました",
    ],
    [
      "an uncertain PostError",
      () => new PostError("結果不明", true),
      false,
      "unknown",
      "結果不明",
    ],
    [
      "an unexpected verify failure",
      () => new Error("secret"),
      true,
      "failed",
      "Buffer 投稿処理に失敗しました。Buffer と X を確認してください",
    ],
  ])("records %s durably", async (_, error, duringVerify, status, message) => {
    const client = fakeClient();
    if (duringVerify) client.verifyAccount.mockRejectedValue(error());
    else client.post.mockRejectedValue(error());
    await new Publisher(repo, client, clock).tick();
    const post = (await state()).posts[0];
    expect([post?.status, post?.error]).toEqual([status, message]);
    expect((await repo.settings()).autoPost).toBe(false);
  });

  it("records an unexpected failure after sending began as unknown", async () => {
    const client = fakeClient();
    client.post.mockRejectedValue(new TypeError("secret"));
    await new Publisher(repo, client, clock).tick();
    expect((await state()).posts[0]?.status).toBe("unknown");
    expect(JSON.stringify(await state())).not.toContain("secret");
  });

  it("does not resend when recording the completion fails", async () => {
    const client = fakeClient();
    vi.spyOn(repo, "finishPost").mockRejectedValueOnce(new Error("disk full"));
    await expect(new Publisher(repo, client, clock).tick()).rejects.toThrow(
      "disk full",
    );
    now += 999999;
    await new Publisher(repo, client, clock).tick();
    // The submission was stored first, so it is confirmed rather than recreated.
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.getPost).toHaveBeenCalledTimes(1);
    expect((await state()).posts[0]?.status).toBe("posted");
  });

  it("does not resend when the process stops before the submission is stored", async () => {
    const client = fakeClient();
    vi.spyOn(repo, "submitPost").mockRejectedValueOnce(new Error("disk full"));
    await expect(new Publisher(repo, client, clock).tick()).rejects.toThrow(
      "disk full",
    );
    now += 999999;
    await new Publisher(repo, client, clock).tick();
    expect(client.post).toHaveBeenCalledTimes(1);
    expect((await state()).posts[0]?.status).toBe("unknown");
  });

  it("propagates claim fencing when another invocation took over an expired claim", async () => {
    const client = fakeClient();
    client.post.mockImplementation(async (text) => {
      now += 601;
      await repo.recoverPosts(now);
      return remotePost(text);
    });
    const error = await new Publisher(repo, client, clock)
      .tick()
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UserError);
    expect(String(error)).toContain("投稿処理の状態が変わりました");
    const post = (await state()).posts[0];
    expect(post?.status).toBe("unknown");
    expect((await repo.article(articleId)).reviewStatus).toBe("saved");
  });
});
