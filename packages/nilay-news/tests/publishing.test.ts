// SPDX-License-Identifier: MIT
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UserError } from "../src/errors.ts";
import { Jev } from "../src/jev.ts";
import { FetchError } from "../src/net/http.ts";
import type { FetchBytes, FetchOptions } from "../src/net/types.ts";
import { POST_INTERVAL_SECONDS } from "../src/publication-policy.ts";
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
/** The Publisher tests start at `now = 10000` (epoch seconds). */
const START = 10000;
/** A zoned publication time `seconds` after the start clock. */
function published(seconds: number): string {
  return new Date((START + seconds) * 1000).toISOString();
}
const ITEM: CollectedItem = {
  title: "北海道でクマを捕獲",
  url: "https://example.org/article/1",
  excerpt: "北海道の町でクマを捕獲した。",
  publishedAt: published(-3600),
};
const CHANNEL = {
  id: "channel-123",
  name: "@NilayNews",
  service: "twitter",
  allowedActions: ["scheduleUpdates", "readUpdates"],
  isDisconnected: false,
  isLocked: false,
  isQueuePaused: false,
  linkShortening: { isEnabled: false },
};
const LIMIT = {
  channelId: "channel-123",
  isAtLimit: false,
  limit: 100,
  scheduled: 99,
};
/** A verified account with room for one more post today. */
function account(
  channel: Record<string, unknown> = {},
  limits: unknown = [LIMIT],
): { data: Record<string, unknown> } {
  return {
    data: { channel: { ...CHANNEL, ...channel }, dailyPostingLimits: limits },
  };
}
const BUFFER_RATE =
  '"100-in-15min"; r=99; t=900, "250-in-1day"; r=244; t=70610, "3000-in-30days"; r=2994; t=2576210';

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

  /** A saved article; a later index is published earlier. */
  async function add(index: number): Promise<string> {
    await repo.ingest(SOURCE, [
      {
        ...ITEM,
        url: `https://example.org/article/${index}`,
        publishedAt: published(-3600 - index * 60),
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
    now = START;
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

  describe("duplicate screening immediately before posting", () => {
    function reviewer(relation = "duplicate") {
      const transport = vi.fn<FetchBytes>(async () => ({
        data: utf8(
          JSON.stringify({
            answers: {
              relation: {
                type: "choice",
                choice: relation,
                probabilities: Object.fromEntries(
                  ["duplicate", "followup", "different", "uncertain"].map(
                    (name) => [name, name === relation ? 1 : 0],
                  ),
                ),
              },
            },
          }),
        ),
        url: "",
        contentType: "application/json",
      }));
      return {
        jev: new Jev("fixture-key", "jev-latest", transport),
        transport,
      };
    }

    it.each(["duplicate", "uncertain"])(
      "publishes an explicitly approved %s without another Jev decision",
      async (relation) => {
        const previous = await add(2);
        await repo.review(previous, "posted");
        const article = await repo.article(articleId);
        await repo.analyzeResult(
          articleId,
          await repo.evidenceHash(article),
          (await repo.settings()).rubric,
          {
            analysisStatus: "done",
            decision: "review",
            relation,
            relatedArticleId: previous,
          },
        );
        await repo.reviewMany([articleId], "approved");
        const client = fakeClient();
        const { jev, transport } = reviewer(relation);
        await new Publisher(repo, client, clock, jev).tick();
        expect(transport).not.toHaveBeenCalled();
        expect(client.post).toHaveBeenCalledTimes(1);
        expect((await repo.article(articleId)).reviewStatus).toBe("posted");
      },
    );

    it("withdraws a manually approved claim if its approval changes before authorization", async () => {
      await repo.review(articleId, "approved");
      const client = fakeClient();
      const { jev, transport } = reviewer();
      const authorize = repo.authorizePostSend.bind(repo);
      vi.spyOn(repo, "authorizePostSend").mockImplementation(
        async (...args) => {
          await repo.driver.batch([
            [
              "UPDATE news_articles SET data=json_set(data,'$.reviewStatus','saved') WHERE id=?",
              [articleId],
            ],
          ]);
          return authorize(...args);
        },
      );
      await new Publisher(repo, client, clock, jev).tick();
      expect(transport).not.toHaveBeenCalled();
      expect(client.post).not.toHaveBeenCalled();
      expect((await state()).posts).toEqual([]);
    });

    it("sends one of ten previously classified copies and compares the rest with the just-sent article", async () => {
      const ids = [articleId];
      for (let index = 2; index <= 10; index += 1) ids.push(await add(index));
      for (const id of ids) {
        await repo.review(id, "unread");
        const article = await repo.article(id);
        await repo.analyzeResult(
          id,
          await repo.evidenceHash(article),
          (await repo.settings()).rubric,
          { analysisStatus: "done", decision: "candidate", relation: null },
        );
      }
      await repo.updateSettings({ postSelection: "candidates" });
      const client = fakeClient();
      const { jev, transport } = reviewer();
      const publisher = new Publisher(repo, client, clock, jev);
      for (let tick = 0; tick < 10; tick += 1) await publisher.tick();
      expect(client.post).toHaveBeenCalledTimes(1);
      expect((await state()).posts).toHaveLength(1);
      expect((await repo.article(articleId)).reviewStatus).toBe("posted");
      for (const id of ids.slice(1))
        expect(await repo.article(id)).toMatchObject({
          reviewStatus: "unread",
          decision: "candidate",
          relation: "duplicate",
          relatedArticleId: articleId,
        });
      expect(await repo.postCandidates()).toEqual([]);
      expect((await repo.settings()).autoPost).toBe(true);
      expect(transport).toHaveBeenCalledTimes(9);
      for (const [, options] of transport.mock.calls) {
        const request = JSON.parse(new TextDecoder().decode(options?.body)) as {
          questions: object;
        };
        expect(Object.keys(request.questions)).toEqual(["relation"]);
      }
    });

    it("also checks confirmed post history after an article was returned to unread", async () => {
      const client = fakeClient();
      const { jev, transport } = reviewer();
      const publisher = new Publisher(repo, client, clock, jev);
      await publisher.tick();
      await repo.review(articleId, "unread");
      const next = await add(2);
      now += POST_INTERVAL_SECONDS;
      await publisher.tick();
      expect(transport).toHaveBeenCalledTimes(1);
      expect(client.post).toHaveBeenCalledTimes(1);
      expect(await repo.article(next)).toMatchObject({
        relation: "duplicate",
        relatedArticleId: articleId,
      });
    });

    it.each(["different", "followup"])(
      "allows a confidently %s article after checking",
      async (relation) => {
        const previous = await add(2);
        await repo.review(previous, "posted");
        const client = fakeClient();
        const { jev, transport } = reviewer(relation);
        await new Publisher(repo, client, clock, jev).tick();
        expect(transport).toHaveBeenCalledTimes(1);
        expect(client.post).toHaveBeenCalledTimes(1);
        expect((await repo.article(articleId)).reviewStatus).toBe("posted");
      },
    );

    it("holds an uncertain match without sending or marking it as posted", async () => {
      const previous = await add(2);
      await repo.review(previous, "posted");
      const client = fakeClient();
      const { jev } = reviewer("uncertain");
      await new Publisher(repo, client, clock, jev).tick();
      expect(client.post).not.toHaveBeenCalled();
      expect((await state()).posts).toEqual([]);
      expect(await repo.article(articleId)).toMatchObject({
        reviewStatus: "saved",
        relation: "uncertain",
        relatedArticleId: previous,
      });
      expect((await repo.settings()).autoPost).toBe(true);
    });

    it("stops posting if the duplicate check fails", async () => {
      await repo.review(await add(2), "posted");
      const client = fakeClient();
      const { jev, transport } = reviewer();
      transport.mockRejectedValue(new UserError("Jev の利用上限です"));
      await new Publisher(repo, client, clock, jev).tick();
      expect(client.post).not.toHaveBeenCalled();
      expect((await repo.settings()).autoPost).toBe(false);
      expect((await state()).posts[0]).toMatchObject({
        status: "failed",
        error: expect.stringContaining("投稿前の重複確認に失敗"),
      });
    });

    it("withdraws a claim if its body changes during a successful duplicate check", async () => {
      await repo.review(await add(2), "posted");
      const client = fakeClient();
      const { jev } = reviewer("different");
      const relate = jev.relate.bind(jev);
      vi.spyOn(jev, "relate").mockImplementation(async (...args) => {
        const result = await relate(...args);
        await repo.driver.batch([
          [
            "UPDATE news_articles SET data=json_set(data,'$.body',?) WHERE id=?",
            ["別の出来事についての本文に変更", articleId],
          ],
        ]);
        return result;
      });
      await new Publisher(repo, client, clock, jev).tick();
      expect(client.post).not.toHaveBeenCalled();
      expect((await state()).posts).toEqual([]);
      expect((await repo.settings()).autoPost).toBe(true);
    });

    it("does not send a rejected screening even if concurrent classification clears the annotation", async () => {
      await repo.review(await add(2), "posted");
      const client = fakeClient();
      const { jev } = reviewer();
      const authorize = repo.authorizePostSend.bind(repo);
      vi.spyOn(repo, "authorizePostSend").mockImplementation(
        async (...args) => {
          const article = await repo.article(articleId);
          await repo.analyzeResult(
            articleId,
            await repo.evidenceHash(article),
            (await repo.settings()).rubric,
            {
              analysisStatus: "done",
              decision: "candidate",
              relation: null,
              relatedArticleId: null,
            },
          );
          return authorize(...args);
        },
      );
      await new Publisher(repo, client, clock, jev).tick();
      expect(client.post).not.toHaveBeenCalled();
      expect((await state()).posts).toEqual([]);
      expect((await repo.settings()).autoPost).toBe(true);
    });

    it("preserves source-designated posting without requiring a Jev decision", async () => {
      await repo.ingest({ ...SOURCE, id: "riflesports-news" }, [
        {
          ...ITEM,
          url: "https://example.org/article/1",
          publishedAt: published(-3660),
        },
      ]);
      await repo.review(await add(2), "posted");
      const client = fakeClient();
      const { jev, transport } = reviewer();
      await new Publisher(repo, client, clock, jev).tick();
      expect(client.post).toHaveBeenCalledTimes(1);
      expect(transport).not.toHaveBeenCalled();
    });
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
        : account({ name: "NilayNews" }).data;
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
    expect(publication.nextAt).toBeGreaterThanOrEqual(
      now + POST_INTERVAL_SECONDS,
    );
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

  it("spaces rounds an hour from their opening, despite network latency", async () => {
    expect(POST_INTERVAL_SECONDS).toBe(3600);
    const secondId = await add(2);
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
    // Both articles of the round are posted, one after the other.
    expect(client.post).toHaveBeenCalledTimes(2);
    expect((await repo.article(secondId)).reviewStatus).toBe("posted");
    expect((await state()).nextAt).toBe(started + 3600);
    await add(3);
    now = started + 3599;
    await publisher.tick(now);
    expect(client.post).toHaveBeenCalledTimes(2);
    now += 1;
    await publisher.tick(now);
    expect(client.post).toHaveBeenCalledTimes(3);
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
    // Confirmation does not move the next round, due an hour after this one opened.
    expect((await state()).nextAt).toBe(started + POST_INTERVAL_SECONDS);
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

  it("allows at most six confirmation requests within one hour and never resends", async () => {
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
    for (const offset of [0, 120, 360, 840, 1740, 2640, 3540, 3600, 999999]) {
      now = started + offset;
      await publisher.tick();
    }
    expect(client.getPost).toHaveBeenCalledTimes(6);
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

  it("pauses at the confirmation deadline without storing remote text", async () => {
    const client = fakeClient();
    client.post.mockImplementation(async (text) => remotePost(text, "sending"));
    client.getPost.mockRejectedValue(new PostError("private response"));
    const publisher = new Publisher(repo, client, clock);
    const started = now;
    for (const offset of [0, 120, 3720]) {
      now = started + offset;
      await publisher.tick();
    }
    expect(client.getPost).toHaveBeenCalledTimes(1);
    expect((await repo.settings()).autoPost).toBe(false);
    expect(JSON.stringify(await state())).not.toContain("private");
  });

  it("preserves the sanitized Retry-After on final confirmation rate limits", async () => {
    const client = fakeClient();
    client.post.mockImplementation(async (text) => remotePost(text, "sending"));
    const limited = new BufferClient("fixture-key", "channel-123", async () => {
      throw new FetchError("private remote body", 429, 7200);
    });
    client.getPost.mockImplementation((...args) => limited.getPost(...args));
    const publisher = new Publisher(repo, client, clock);
    const started = now;
    for (const offset of [0, 120, 3720]) {
      now = started + offset;
      await publisher.tick();
    }
    const recorded = (await state()).posts[0];
    expect(recorded?.status).toBe("unknown");
    expect(recorded?.error).toContain("HTTP 429");
    expect(recorded?.error).toContain("約2時間");
    expect(recorded?.error).not.toContain("private");
    expect((await repo.settings()).autoPost).toBe(false);
    expect(client.post).toHaveBeenCalledTimes(1);
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
    now += 120;
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

  it("posts the newest fresh article first", async () => {
    await add(2);
    await repo.ingest(SOURCE, [
      {
        ...ITEM,
        url: "https://example.org/article/latest",
        publishedAt: published(60),
      },
    ]);
    const latest = (await repo.articles()).find((item) =>
      item.url.endsWith("/latest"),
    );
    await repo.review(latest?.id ?? "", "saved");
    const client = fakeClient();
    await new Publisher(repo, client, clock).tick();
    expect(client.post.mock.calls[0]?.[0]).toContain("/article/latest");
    expect((await repo.article(latest?.id ?? "")).reviewStatus).toBe("posted");
  });

  it("never sends an article that aged out during the account check", async () => {
    const client = fakeClient();
    // One second before the article leaves the 24 hour window.
    now = START - 3660 + 86400 - 1;
    client.verifyAccount.mockImplementation(async () => {
      now += 2;
    });
    await new Publisher(repo, client, clock).tick();
    expect(client.verifyAccount).toHaveBeenCalledTimes(1);
    expect(client.post).not.toHaveBeenCalled();
    // The unsent claim is withdrawn: neither a failure nor an unknown result.
    expect((await state()).posts).toEqual([]);
    expect((await repo.article(articleId)).reviewStatus).toBe("saved");
    expect((await repo.settings()).autoPost).toBe(true);
    await new Publisher(repo, client, clock).tick();
    expect(client.post).not.toHaveBeenCalled();
  });

  it("never sends after posting is switched off during the account check", async () => {
    const client = fakeClient();
    client.verifyAccount.mockImplementation(async () => {
      await repo.updateSettings({ autoPost: false });
    });
    await new Publisher(repo, client, clock).tick();
    expect(client.post).not.toHaveBeenCalled();
    expect((await state()).posts).toEqual([]);
    expect((await repo.article(articleId)).reviewStatus).toBe("saved");
  });

  it("never sends with a claim that expired during the account check", async () => {
    const client = fakeClient();
    client.verifyAccount.mockImplementation(async () => {
      now += 601;
      await repo.recoverPosts(now);
    });
    await new Publisher(repo, client, clock).tick();
    expect(client.post).not.toHaveBeenCalled();
    // Recovery's unknown result stays for manual confirmation.
    expect((await state()).posts[0]?.status).toBe("unknown");
    expect((await repo.settings()).autoPost).toBe(false);
  });

  it("never sends with a claim whose lease ran out, even before recovery", async () => {
    const client = fakeClient();
    client.verifyAccount.mockImplementation(async () => {
      now += 600;
    });
    await new Publisher(repo, client, clock).tick();
    expect(client.post).not.toHaveBeenCalled();
    expect((await state()).posts[0]?.status).toBe("publishing");
  });

  describe("never sends a claim that stopped being a candidate during the account check", () => {
    function edit(field: string, value: string): Promise<unknown> {
      return repo.driver.batch([
        [
          "UPDATE news_articles SET data=json_set(data,?,?) WHERE id=?",
          [`$.${field}`, value, articleId],
        ],
      ]);
    }

    it.each([
      ["a dismissal", () => edit("reviewStatus", "dismissed")],
      [
        "a saved article returning to unread in saved mode",
        async () => {
          await repo.updateSettings({ postSelection: "saved" });
          await edit("reviewStatus", "unread");
        },
      ],
      [
        "a switch to Jev candidates only",
        () => repo.updateSettings({ postSelection: "candidates" }),
      ],
      ["a changed draft", () => edit("title", "シカを捕獲")],
    ])("after %s", async (_, change) => {
      const client = fakeClient();
      client.verifyAccount.mockImplementation(async () => {
        await change();
      });
      await new Publisher(repo, client, clock).tick();
      expect(client.verifyAccount).toHaveBeenCalledTimes(1);
      expect(client.post).not.toHaveBeenCalled();
      // Only the own unsent claim is withdrawn; nothing is failed or unknown.
      expect((await state()).posts).toEqual([]);
      expect((await repo.settings()).autoPost).toBe(true);
    });

    it("after a rubric change invalidates the Jev decision", async () => {
      await repo.review(articleId, "unread");
      await repo.updateSettings({ postSelection: "candidates" });
      const article = await repo.article(articleId);
      await repo.analyzeResult(
        articleId,
        await repo.evidenceHash(article),
        (await repo.settings()).rubric,
        { analysisStatus: "done", decision: "candidate" },
      );
      const client = fakeClient();
      client.verifyAccount.mockImplementation(async () => {
        await repo.updateSettings({
          rubric: "変更された具体的なニュースの選定基準です",
        });
      });
      await new Publisher(repo, client, clock).tick();
      expect(client.verifyAccount).toHaveBeenCalledTimes(1);
      expect(client.post).not.toHaveBeenCalled();
      expect((await state()).posts).toEqual([]);
    });

    it("and sends the current draft on the next due tick, never the stale one", async () => {
      const client = fakeClient();
      client.verifyAccount.mockImplementationOnce(async () => {
        await edit("title", "シカを捕獲");
      });
      const publisher = new Publisher(repo, client, clock);
      await publisher.tick();
      expect(client.post).not.toHaveBeenCalled();
      await publisher.tick();
      expect(client.post).toHaveBeenCalledTimes(1);
      expect(client.post.mock.calls[0]?.[0]).toContain("シカを捕獲");
      expect(client.post.mock.calls[0]?.[0]).not.toContain("クマ");
    });
  });

  it("stops before sending when the API budget is low, with posting turned off", async () => {
    const calls: string[] = [];
    const ok = bufferTransport(calls);
    const transport: FetchBytes = async (url, options) => ({
      ...(await ok(url, options)),
      rateLimit: '"100-in-15min"; r=3; t=900, "250-in-1day"; r=200; t=7000',
    });
    const publisher = new Publisher(
      repo,
      new BufferClient("fixture-key", "channel-123", transport),
      clock,
    );
    await publisher.tick();
    now += 7200;
    await publisher.tick();
    // One account check and no mutation or further request.
    expect(calls).toHaveLength(1);
    const post = (await state()).posts[0];
    expect(post?.status).toBe("failed");
    expect(post?.error).toContain("残り 3 回");
    expect(post?.error).toContain("約15分");
    expect((await repo.settings()).autoPost).toBe(false);
  });

  it("keeps a sent post when the reply reports a low budget", async () => {
    const calls: string[] = [];
    const ok = bufferTransport(calls);
    const transport: FetchBytes = async (url, options) => {
      const result = await ok(url, options);
      return calls.at(-1)?.includes("createPost")
        ? { ...result, rateLimit: '"100-in-15min"; r=0; t=900' }
        : result;
    };
    await new Publisher(
      repo,
      new BufferClient("fixture-key", "channel-123", transport),
      clock,
    ).tick();
    expect(calls).toHaveLength(2);
    expect((await state()).posts[0]).toMatchObject({
      status: "posted",
      bufferId: "buffer-123",
      postId: "123",
    });
    expect((await repo.article(articleId)).reviewStatus).toBe("posted");
  });

  it("records a failure when the send authorization cannot be stored", async () => {
    const client = fakeClient();
    vi.spyOn(repo, "authorizePostSend").mockRejectedValueOnce(
      new Error("disk full"),
    );
    await new Publisher(repo, client, clock).tick();
    expect(client.post).not.toHaveBeenCalled();
    expect((await state()).posts[0]?.status).toBe("failed");
    expect((await repo.settings()).autoPost).toBe(false);
  });

  describe("hourly rounds", () => {
    /** The article numbers of the URLs a post text links to. */
    function linked(text: string | undefined): string[] {
      return [
        ...(text ?? "").matchAll(/https:\/\/example\.org\/article\/(\w+)/g),
      ].map(([, number]) => number ?? "");
    }

    /** Articles 2..count besides article 1; a higher number is older. */
    async function accumulate(count: number): Promise<string[]> {
      const ids = [articleId];
      for (let index = 2; index <= count; index += 1)
        ids.push(await add(index));
      return ids;
    }

    function numbered(client: FakeClient): void {
      client.post.mockImplementation(async (text) =>
        remotePost(text, "sent", {
          id: `buffer-${client.post.mock.calls.length}`,
        }),
      );
    }

    it("posts every accumulated article on its own, over consecutive ticks", async () => {
      const ids = await accumulate(12);
      const client = fakeClient();
      numbered(client);
      const authorize = vi.spyOn(repo, "authorizePostSend");
      const publisher = new Publisher(repo, client, clock);
      const opened = now;
      await publisher.tick();
      // One bounded burst: ten operations, each verified and authorized.
      expect(client.post).toHaveBeenCalledTimes(10);
      expect(client.verifyAccount).toHaveBeenCalledTimes(10);
      expect(authorize).toHaveBeenCalledTimes(10);
      // The rest of the round is due at once, not an hour later.
      expect((await state()).nextAt).toBe(now);
      // News arriving during the round waits for the next one.
      const late = await add(0);
      now += 60;
      await publisher.tick();
      expect(client.post).toHaveBeenCalledTimes(12);
      expect(client.verifyAccount).toHaveBeenCalledTimes(12);
      const texts = client.post.mock.calls.map(([text]) => text);
      // One article per post, newest first; never one combined post.
      expect(texts.map(linked)).toEqual(
        ids.map((_, index) => [String(index + 1)]),
      );
      const { posts } = await state();
      expect(posts).toHaveLength(12);
      for (const post of posts) {
        expect(post.status).toBe("posted");
        expect(texts).toContain(post.text);
      }
      for (const id of ids)
        expect((await repo.article(id)).reviewStatus).toBe("posted");
      expect((await repo.article(late)).reviewStatus).toBe("saved");
      expect((await state()).nextAt).toBe(opened + POST_INTERVAL_SECONDS);
      now = opened + POST_INTERVAL_SECONDS - 1;
      await publisher.tick();
      expect(client.post).toHaveBeenCalledTimes(12);
      now += 1;
      await publisher.tick();
      expect(client.post).toHaveBeenCalledTimes(13);
      expect(linked(client.post.mock.calls[12]?.[0])).toEqual(["0"]);
    });

    it("starts no operation 45 seconds into a tick", async () => {
      await accumulate(6);
      const client = fakeClient();
      client.verifyAccount.mockImplementation(async () => {
        now += 10;
      });
      const publisher = new Publisher(repo, client, clock);
      await publisher.tick();
      // Operations start 0, 10, 20, 30 and 40 seconds in.
      expect(client.post).toHaveBeenCalledTimes(5);
      now += 60;
      await publisher.tick();
      expect(client.post).toHaveBeenCalledTimes(6);
    });

    it("waits for each confirmation, and continues the round once confirmed", async () => {
      await accumulate(4);
      const client = fakeClient();
      client.post.mockImplementation(async (text) =>
        remotePost(
          text,
          client.post.mock.calls.length === 2 ? "sending" : "sent",
        ),
      );
      const publisher = new Publisher(repo, client, clock);
      const submitted = now;
      await publisher.tick();
      expect(client.post).toHaveBeenCalledTimes(2);
      expect((await state()).posts.map((post) => post.status).sort()).toEqual([
        "posted",
        "submitted",
      ]);
      now = submitted + 119;
      await publisher.tick();
      expect(client.getPost).not.toHaveBeenCalled();
      expect(client.post).toHaveBeenCalledTimes(2);
      now = submitted + 120;
      await publisher.tick();
      expect(client.getPost).toHaveBeenCalledTimes(1);
      expect(client.post).toHaveBeenCalledTimes(4);
      expect(
        (await state()).posts.every((post) => post.status === "posted"),
      ).toBe(true);
    });

    it("stops the round at an uncertain send and never resumes it", async () => {
      const ids = await accumulate(5);
      const client = fakeClient();
      client.post.mockImplementation(async (text) => {
        if (client.post.mock.calls.length === 3)
          throw new PostError("Buffer の登録結果が不明です", true);
        return remotePost(text);
      });
      const publisher = new Publisher(repo, client, clock);
      await publisher.tick();
      expect(client.post).toHaveBeenCalledTimes(3);
      expect((await repo.settings()).autoPost).toBe(false);
      const unknown = ids[2] ?? "";
      expect(
        (await state()).posts.find((post) => post.articleId === unknown)
          ?.status,
      ).toBe("unknown");
      now += 7200;
      await publisher.tick();
      expect(client.post).toHaveBeenCalledTimes(3);
      // After reconciliation, re-enabling waits a full hour for a new round.
      await repo.resolvePost(unknown, "not_posted");
      await repo.updateSettings({ autoPost: true });
      expect((await state()).nextAt).toBe(now + POST_INTERVAL_SECONDS);
      await publisher.tick();
      now += POST_INTERVAL_SECONDS - 1;
      await publisher.tick();
      expect(client.post).toHaveBeenCalledTimes(3);
      now += 1;
      await publisher.tick();
      expect(client.post).toHaveBeenCalledTimes(6);
      expect(
        client.post.mock.calls.slice(3).map(([text]) => linked(text)),
      ).toEqual([["3"], ["4"], ["5"]]);
    });

    it("stops the round at a failed account check", async () => {
      await accumulate(4);
      const client = fakeClient();
      client.verifyAccount.mockImplementation(async () => {
        if (client.verifyAccount.mock.calls.length === 2)
          throw new PostError(
            "Buffer のチャンネルが1日の投稿上限に達しています",
          );
      });
      await new Publisher(repo, client, clock).tick();
      expect(client.post).toHaveBeenCalledTimes(1);
      expect((await state()).posts.map((post) => post.status).sort()).toEqual([
        "failed",
        "posted",
      ]);
      expect((await repo.settings()).autoPost).toBe(false);
    });

    it("discards the open round when posting is switched off and on", async () => {
      await accumulate(12);
      const client = fakeClient();
      const publisher = new Publisher(repo, client, clock);
      await publisher.tick();
      expect(client.post).toHaveBeenCalledTimes(10);
      await repo.updateSettings({ autoPost: false });
      await repo.updateSettings({ autoPost: true });
      const enabled = now;
      expect((await state()).nextAt).toBe(enabled + POST_INTERVAL_SECONDS);
      for (const minutes of [1, 30, 59]) {
        now = enabled + minutes * 60;
        await publisher.tick();
      }
      expect(client.post).toHaveBeenCalledTimes(10);
      now = enabled + POST_INTERVAL_SECONDS;
      await publisher.tick();
      expect(client.post).toHaveBeenCalledTimes(12);
    });

    it("leaves articles that stop being candidates out of the round", async () => {
      const ids = await accumulate(3);
      const dismissed = ids[1] ?? "";
      await repo.ingest({ ...SOURCE, id: "riflesports-news" }, [
        {
          ...ITEM,
          url: "https://example.org/article/rifle",
          publishedAt: published(-3690),
        },
      ]);
      const rifle =
        (await repo.articles()).find((item) => item.url.endsWith("/rifle"))
          ?.id ?? "";
      // Neither saved nor a Jev candidate: never part of any round.
      await repo.ingest(SOURCE, [
        {
          ...ITEM,
          url: "https://example.org/article/unread",
          publishedAt: published(0),
        },
      ]);
      const client = fakeClient();
      client.verifyAccount.mockImplementationOnce(async () => {
        await repo.review(dismissed, "dismissed");
      });
      await new Publisher(repo, client, clock).tick();
      expect(client.post.mock.calls.map(([text]) => linked(text))).toEqual([
        ["1"],
        ["rifle"],
        ["3"],
      ]);
      expect((await repo.article(rifle)).reviewStatus).toBe("posted");
      expect((await repo.article(dismissed)).reviewStatus).toBe("dismissed");
      expect(
        (await state()).posts.some((post) => post.articleId === dismissed),
      ).toBe(false);
    });

    it("sends each article once across concurrent publishers", async () => {
      const ids = await accumulate(5);
      const client = fakeClient();
      let active = 0;
      let overlap = 0;
      const pause = () => new Promise((resolve) => setImmediate(resolve));
      client.verifyAccount.mockImplementation(async () => {
        active += 1;
        overlap = Math.max(overlap, active);
        await pause();
      });
      client.post.mockImplementation(async (text) => {
        await pause();
        active -= 1;
        return remotePost(text);
      });
      const other = fakeClient();
      other.verifyAccount.mockImplementation(client.verifyAccount);
      other.post.mockImplementation(client.post);
      await Promise.all([
        new Publisher(repo, client, clock).tick(),
        new Publisher(repo, other, clock).tick(),
        new Publisher(repo, client, clock).tick(),
      ]);
      // One claim at a time: the account check and send never overlap.
      expect(overlap).toBe(1);
      const texts = [...client.post.mock.calls, ...other.post.mock.calls].map(
        ([text]) => text,
      );
      expect(texts).toHaveLength(5);
      expect(new Set(texts).size).toBe(5);
      for (const id of ids)
        expect((await repo.article(id)).reviewStatus).toBe("posted");
    });
  });

  describe("posting window", () => {
    /** Epoch seconds at a JST wall-clock time on the day of `START` (1970-01-01, 11:46:40 JST). */
    function jst(hours: number, minutes = 0, seconds = 0, day = 0): number {
      return day * 86400 - 9 * 3600 + hours * 3600 + minutes * 60 + seconds;
    }

    it("never sends when account verification ends after 23:00", async () => {
      const client = fakeClient();
      client.verifyAccount.mockImplementation(async () => {
        now = jst(23, 0);
      });
      now = jst(22, 59, 30);
      await new Publisher(repo, client, clock).tick();
      expect(client.verifyAccount).toHaveBeenCalledTimes(1);
      expect(client.post).not.toHaveBeenCalled();
      const publication = await state();
      // Its own claim is withdrawn, neither failed nor unknown.
      expect(publication.posts).toEqual([]);
      expect(publication.nextAt).toBe(jst(6, 0, 0, 1));
      expect((await repo.settings()).autoPost).toBe(true);
      expect((await repo.article(articleId)).reviewStatus).toBe("saved");
      client.verifyAccount.mockImplementation(async () => undefined);
      now = jst(23, 30);
      await new Publisher(repo, client, clock).tick();
      expect(client.verifyAccount).toHaveBeenCalledTimes(1);
      now = jst(6, 0, 0, 1);
      await new Publisher(repo, client, clock).tick();
      expect(client.post).toHaveBeenCalledTimes(1);
      expect((await repo.article(articleId)).reviewStatus).toBe("posted");
    });

    it("never starts a send from a tick timestamp taken before 23:00", async () => {
      const client = fakeClient();
      now = jst(23, 0, 1);
      await new Publisher(repo, client, clock).tick(jst(22, 59, 59));
      expect(client.verifyAccount).not.toHaveBeenCalled();
      expect(client.post).not.toHaveBeenCalled();
      expect((await state()).posts).toEqual([]);
    });

    it("rechecks the clock after the authorization snapshot is read", async () => {
      const client = fakeClient();
      client.verifyAccount.mockImplementation(async () => {
        const original = repo.driver.batch.bind(repo.driver);
        vi.spyOn(repo.driver, "batch").mockImplementation(
          async (statements) => {
            const result = await original(statements);
            if (
              statements.some(([sql]) =>
                sql.includes("SELECT id,data FROM news_articles WHERE id IN"),
              )
            )
              now = jst(23);
            return result;
          },
        );
      });
      now = jst(22, 59, 59);
      await new Publisher(repo, client, clock).tick();
      expect(client.post).not.toHaveBeenCalled();
      expect((await state()).posts).toEqual([]);
      expect((await state()).nextAt).toBe(jst(6, 0, 0, 1));
      expect((await repo.settings()).autoPost).toBe(true);
    });

    it("rechecks the clock when authorization returns to the sender", async () => {
      const client = fakeClient();
      const original = repo.authorizePostSend.bind(repo);
      vi.spyOn(repo, "authorizePostSend").mockImplementationOnce(
        async (...args) => {
          const authorized = await original(...args);
          expect(authorized).toBe(true);
          now = jst(23);
          return authorized;
        },
      );
      now = jst(22, 59, 59);
      await new Publisher(repo, client, clock).tick();
      expect(client.post).not.toHaveBeenCalled();
      expect((await state()).posts).toEqual([]);
      expect((await state()).nextAt).toBe(jst(6, 0, 0, 1));
      expect((await repo.settings()).autoPost).toBe(true);
    });

    it("still confirms a submitted post outside the window", async () => {
      const client = fakeClient();
      client.post.mockImplementation(async (text) =>
        remotePost(text, "sending"),
      );
      now = jst(22, 58);
      await new Publisher(repo, client, clock).tick();
      expect((await state()).posts[0]?.status).toBe("submitted");
      now = jst(23, 30);
      await new Publisher(repo, client, clock).tick();
      expect(client.getPost).toHaveBeenCalledTimes(1);
      expect((await state()).posts[0]?.status).toBe("posted");
      expect((await repo.article(articleId)).reviewStatus).toBe("posted");
      expect((await state()).nextAt).toBe(jst(6, 0, 0, 1));
      expect(client.post).toHaveBeenCalledTimes(1);
    });

    it("pauses an open round at 23:00 and rechecks its freshness at 06:00", async () => {
      now = jst(22, 50);
      async function saved(name: string, at: number): Promise<string> {
        await repo.ingest(SOURCE, [
          {
            ...ITEM,
            url: `https://example.org/article/${name}`,
            publishedAt: new Date(at * 1000).toISOString(),
          },
        ]);
        const id =
          (await repo.articles()).find((item) => item.url.endsWith(`/${name}`))
            ?.id ?? "";
        await repo.review(id, "saved");
        return id;
      }
      const evening = await saved("evening", jst(20));
      // Fresh tonight, but more than 24 hours old at 06:00 tomorrow.
      const early = await saved("early", jst(5, 30));
      const client = fakeClient();
      client.post.mockImplementationOnce(async (text) =>
        remotePost(text, "sending"),
      );
      const publisher = new Publisher(repo, client, clock);
      now = jst(22, 58);
      await publisher.tick();
      expect(client.post).toHaveBeenCalledTimes(1);
      // Confirmation goes on after 23:00; the rest of the round does not.
      now = jst(23, 0, 30);
      await publisher.tick();
      expect(client.getPost).toHaveBeenCalledTimes(1);
      expect((await repo.article(evening)).reviewStatus).toBe("posted");
      expect(client.post).toHaveBeenCalledTimes(1);
      expect((await state()).nextAt).toBe(jst(6, 0, 0, 1));
      now = jst(23, 30);
      const night = await saved("night", jst(23, 30));
      now = jst(5, 59, 59, 1);
      await publisher.tick();
      expect(client.post).toHaveBeenCalledTimes(1);
      now = jst(6, 0, 0, 1);
      await publisher.tick();
      // The round resumes with its still fresh article; the next round,
      // due since 06:00, then takes the news that arrived overnight.
      expect(client.post.mock.calls.map(([text]) => text)).toEqual([
        expect.stringContaining("/article/evening"),
        expect.stringContaining("/article/1"),
        expect.stringContaining("/article/night"),
      ]);
      expect((await repo.article(articleId)).reviewStatus).toBe("posted");
      expect((await repo.article(night)).reviewStatus).toBe("posted");
      expect((await repo.article(early)).reviewStatus).toBe("saved");
      expect(
        (await state()).posts.some((post) => post.articleId === early),
      ).toBe(false);
    });
  });
});
