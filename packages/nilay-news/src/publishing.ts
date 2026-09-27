// SPDX-License-Identifier: MIT
/** Buffer GraphQL publishing with durable claims and bounded confirmation. */
import type { Clock } from "./domain.ts";
import { clock as systemClock } from "./domain.ts";
import { UserError } from "./errors.ts";
import { FetchError, fetchBytes } from "./net/http.ts";
import type { FetchBytes } from "./net/types.ts";
import { ACCOUNT } from "./posts.ts";
import type { NewsRepository } from "./repository.ts";
import { isRecord, utf8 } from "./text.ts";

const ENDPOINT = "https://api.buffer.com";
const POST_FIELDS = "id channelId channelService text status externalLink";
const POST_STATUSES = new Set([
  "draft",
  "error",
  "needs_approval",
  "scheduled",
  "sending",
  "sent",
]);
const KNOWN_REJECTIONS = new Set([
  "NotFoundError",
  "UnauthorizedError",
  "LimitReachedError",
  "InvalidInputError",
]);
const INCOMPLETE =
  "Buffer の投稿が完了していません。Buffer と X を確認してください";

export class PostError extends UserError {
  constructor(
    message: string,
    /** The post may have reached Buffer; never retry it automatically. */
    readonly uncertain = false,
  ) {
    super(message);
  }
}

export interface BufferPost {
  id: string;
  channelId: string;
  channelService: "twitter";
  text: string;
  status:
    "draft" | "error" | "needs_approval" | "scheduled" | "sending" | "sent";
  externalLink?: unknown;
}

/** Empty arrays and objects count as empty API fields. */
function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return Boolean(value);
}

function validatePost(
  post: unknown,
  text: string,
  channelId: string,
  postId?: string,
): BufferPost {
  if (
    !isRecord(post) ||
    typeof post.id !== "string" ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(post.id) ||
    (postId !== undefined && post.id !== postId) ||
    post.channelId !== channelId ||
    post.channelService !== "twitter" ||
    post.text !== text ||
    typeof post.status !== "string" ||
    !POST_STATUSES.has(post.status)
  ) {
    throw new PostError(
      "Buffer の投稿 ID・投稿先・本文・状態を照合できません。Buffer と X を確認してください",
      true,
    );
  }
  return post as unknown as BufferPost;
}

/** X status id from a known X URL only; untrusted remote links are never shown. */
export function xPostId(post: BufferPost): string | null {
  const link = post.externalLink ?? "";
  if (typeof link !== "string") return null;
  return (
    /^https:\/\/(?:x\.com|twitter\.com)\/(?:NilayNews|i\/web)\/status\/([0-9]{1,30})\/?$/i.exec(
      link,
    )?.[1] ?? null
  );
}

export class BufferClient {
  constructor(
    private readonly key = "",
    readonly channel = "",
    private readonly transport: FetchBytes = fetchBytes,
  ) {}

  get configured(): boolean {
    return Boolean(this.key && this.channel);
  }

  private async request(
    query: string,
    variables: object,
    mutation = false,
  ): Promise<Record<string, unknown>> {
    if (!this.configured)
      throw new PostError(
        "Buffer の API キーとチャンネル ID を設定してください",
      );
    let data: Uint8Array;
    try {
      ({ data } = await this.transport(ENDPOINT, {
        body: utf8(JSON.stringify({ query, variables })),
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json",
        },
        timeout: 25,
        maxBytes: 100_000,
        beforeRedirect: () => {
          throw new FetchError("Buffer API の転送には対応していません");
        },
      }));
    } catch (error) {
      if (!(error instanceof FetchError)) throw error;
      const { status } = error;
      const uncertain =
        mutation && (status === undefined || status >= 500 || status === 408);
      throw new PostError(
        uncertain
          ? "Buffer の登録結果が不明です。Buffer と X を確認してください"
          : `Buffer API に接続できません（HTTP ${status || "通信エラー"}）。認証・接続・利用上限を確認してください`,
        uncertain,
      );
    }
    try {
      const value: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
          data,
        ),
      );
      if (isRecord(value) && !truthy(value.errors) && isRecord(value.data))
        return value.data;
    } catch {
      // Treated as an unverifiable response below.
    }
    throw new PostError(
      "Buffer API の応答を確認できません。Buffer と X を確認してください",
      mutation,
    );
  }

  /** The channel must be X @NilayNews, connected, unlocked, unpaused and without link shortening. */
  async verifyAccount(): Promise<void> {
    const { channel } = await this.request(
      "query($input: ChannelInput!) { channel(input: $input) { id name service isDisconnected isLocked isQueuePaused linkShortening { isEnabled } } }",
      { input: { id: this.channel } },
    );
    if (
      !isRecord(channel) ||
      channel.id !== this.channel ||
      channel.service !== "twitter" ||
      typeof channel.name !== "string" ||
      channel.name.replace(/^@/, "").toLowerCase() !== ACCOUNT.toLowerCase()
    ) {
      throw new PostError("Buffer の投稿先が X の @NilayNews と一致しません");
    }
    if (
      ["isDisconnected", "isLocked", "isQueuePaused"].some(
        (name) => channel[name] !== false,
      )
    ) {
      throw new PostError(
        "Buffer の X 接続・チャンネルロック・キュー停止を確認してください",
      );
    }
    const shortening = channel.linkShortening;
    if (!isRecord(shortening) || shortening.isEnabled !== false) {
      throw new PostError(
        "Buffer の Link Shortening を No Shortening に設定してください",
      );
    }
  }

  async post(text: string): Promise<BufferPost> {
    const { createPost: result } = await this.request(
      `mutation($input: CreatePostInput!) { createPost(input: $input) { __typename ... on PostActionSuccess { post { ${POST_FIELDS} } } } }`,
      {
        input: {
          channelId: this.channel,
          text,
          schedulingType: "automatic",
          mode: "shareNow",
        },
      },
      true,
    );
    if (!isRecord(result) || result.__typename !== "PostActionSuccess") {
      const kind = isRecord(result) ? result.__typename : undefined;
      throw new PostError(
        "Buffer に投稿を登録できません。Buffer の接続・権限・利用上限と投稿結果を確認してください",
        !(typeof kind === "string" && KNOWN_REJECTIONS.has(kind)),
      );
    }
    return validatePost(result.post, text, this.channel);
  }

  /** Fetch a submitted post; it must match the id, text and the channel it was submitted to. */
  async getPost(
    id: string,
    text: string,
    channelId = this.channel,
  ): Promise<BufferPost> {
    const { post } = await this.request(
      `query($input: PostInput!) { post(input: $input) { ${POST_FIELDS} } }`,
      { input: { id } },
    );
    return validatePost(post, text, channelId, id);
  }
}

export type PublishingClient = Pick<
  BufferClient,
  "channel" | "verifyAccount" | "post" | "getPost"
>;

export class Publisher {
  constructor(
    private readonly repository: NewsRepository,
    readonly client: PublishingClient,
    private readonly clock: Clock = systemClock,
  ) {}

  /**
   * Confirm one submitted post, or else claim and send at most one new post.
   * Storage errors, including stale claim tokens, propagate; an uncertain
   * send is recorded as unknown and never retried.
   */
  async tick(timestamp = this.clock()): Promise<void> {
    const pending = await this.repository.claimPostCheck(timestamp);
    if (pending) {
      const finalCheck = pending.check_count >= 1;
      let result: BufferPost;
      try {
        if (!pending.buffer_id || !pending.channel_id)
          throw new PostError(INCOMPLETE, true);
        result = await this.client.getPost(
          pending.buffer_id,
          pending.text,
          pending.channel_id,
        );
      } catch {
        if (finalCheck) {
          await this.repository.finishPost(pending.article_id, "unknown", {
            error:
              "Buffer の投稿結果を取得できません。Buffer と X を確認してください",
            claimToken: pending.claim_token,
          });
        }
        return;
      }
      await this.accept(
        pending.article_id,
        result,
        pending.claim_token,
        finalCheck,
      );
      return;
    }
    const attempt = await this.repository.claimPost(timestamp);
    if (!attempt) return;
    let sending = false;
    let post: BufferPost;
    try {
      await this.client.verifyAccount();
      sending = true;
      post = await this.client.post(attempt.text);
    } catch (error) {
      const known = error instanceof PostError;
      await this.repository.finishPost(
        attempt.articleId,
        (known ? error.uncertain : sending) ? "unknown" : "failed",
        {
          error: known
            ? error.message
            : "Buffer 投稿処理に失敗しました。Buffer と X を確認してください",
          claimToken: attempt.claimToken,
        },
      );
      return;
    }
    await this.repository.submitPost(
      attempt.articleId,
      post.id,
      this.client.channel,
      this.clock(),
      attempt.claimToken,
    );
    await this.accept(attempt.articleId, post, attempt.claimToken, false);
  }

  private async accept(
    articleId: string,
    post: BufferPost,
    claimToken: string,
    finalCheck: boolean,
  ): Promise<void> {
    if (post.status === "sent") {
      await this.repository.finishPost(articleId, "posted", {
        postId: xPostId(post),
        timestamp: this.clock(),
        claimToken,
      });
    } else if (
      ["error", "draft", "needs_approval"].includes(post.status) ||
      finalCheck
    ) {
      // The remote item may still be retried or approved in Buffer; keep the claim.
      await this.repository.finishPost(articleId, "unknown", {
        error: INCOMPLETE,
        claimToken,
      });
    }
  }
}
