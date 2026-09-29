// SPDX-License-Identifier: MIT
/** Buffer GraphQL publishing with durable claims and bounded confirmation. */
import { isSourceCandidate } from "./candidates.ts";
import type { Clock } from "./domain.ts";
import { clock as systemClock } from "./domain.ts";
import { UserError } from "./errors.ts";
import type { Jev } from "./jev.ts";
import { FetchError, fetchBytes } from "./net/http.ts";
import type { FetchBytes } from "./net/types.ts";
import { ACCOUNT } from "./posts.ts";
import { isPostingTime } from "./publication-policy.ts";
import type { NewsRepository, PostScreening } from "./repository.ts";
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
/**
 * API requests every rate window must still allow before a post is sent: the
 * post itself, up to two confirmations, and one spare.
 */
export const REQUEST_RESERVE = 4;
/** Operations, each a confirmation or a claimed send, one tick may perform. */
export const TICK_OPERATIONS = 10;
/** A tick starts no further operation this many seconds after it started. */
export const TICK_SECONDS = 45;
const RATE_ITEM =
  /^(?:"[^"\\]*"|[A-Za-z*][\w\-.:%*/]*)((?:\s*;\s*[a-z*][a-z0-9_\-.*]*(?:\s*=\s*(?:"[^"\\]*"|[^\s;,"]+))?)*)$/;
const RATE_PARAM =
  /;\s*([a-z*][a-z0-9_\-.*]*)(?:\s*=\s*("[^"\\]*"|[^\s;,"]+))?/g;

export interface RateWindow {
  /** Requests left in the window. */
  remaining: number;
  /** Seconds until the window resets. */
  reset: number;
}

/**
 * Every quota window of a `RateLimit` header (`"name"; r=99; t=900, ...`),
 * or null when the header is malformed or a window lacks `r` or `t`.
 */
export function rateWindows(header: string): RateWindow[] | null {
  const items: string[] = [];
  let quoted = false;
  let start = 0;
  for (let index = 0; index < header.length; index += 1) {
    if (header[index] === '"') quoted = !quoted;
    else if (header[index] === "," && !quoted) {
      items.push(header.slice(start, index));
      start = index + 1;
    }
  }
  if (quoted) return null;
  items.push(header.slice(start));
  const windows: RateWindow[] = [];
  for (const item of items) {
    const match = RATE_ITEM.exec(item.trim());
    if (!match) return null;
    const params = new Map<string, string>();
    for (const [, name = "", value = ""] of (match[1] ?? "").matchAll(
      RATE_PARAM,
    )) {
      if (params.has(name)) return null;
      params.set(name, value);
    }
    const remaining = params.get("r") ?? "";
    const reset = params.get("t") ?? "";
    if (!/^[0-9]{1,15}$/.test(remaining) || !/^[0-9]{1,15}$/.test(reset))
      return null;
    windows.push({ remaining: Number(remaining), reset: Number(reset) });
  }
  return windows;
}

/** An approximate Japanese wait such as `約15分`, `約3時間` or `約2日`. */
function approximately(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 120) return `約${minutes}分`;
  const hours = Math.ceil(minutes / 60);
  return hours < 48 ? `約${hours}時間` : `約${Math.ceil(hours / 24)}日`;
}

export class PostError extends UserError {
  constructor(
    message: string,
    /** The post may have reached Buffer; never retry it automatically. */
    readonly uncertain = false,
  ) {
    super(message);
  }
}

/** A local, sanitized message; never contains the remote response body. */
class PostRateLimitError extends PostError {
  constructor(retryAfter?: number) {
    super(
      retryAfter !== undefined && Number.isFinite(retryAfter) && retryAfter >= 0
        ? `Buffer API の利用上限に達しました（HTTP 429）。${approximately(retryAfter)}後に Buffer と X を確認してから再度有効にしてください`
        : "Buffer API の利用上限に達しました（HTTP 429）。しばらく待ってから Buffer と X を確認し、再度有効にしてください",
    );
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
  /** The `RateLimit` header of the latest successful HTTP response, if any. */
  private rateLimit: string | undefined;

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
      ({ data, rateLimit: this.rateLimit } = await this.transport(ENDPOINT, {
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
      const { status, retryAfter } = error;
      const uncertain =
        mutation && (status === undefined || status >= 500 || status === 408);
      if (uncertain)
        throw new PostError(
          "Buffer の登録結果が不明です。Buffer と X を確認してください",
          true,
        );
      if (status === 429) throw new PostRateLimitError(retryAfter);
      throw new PostError(
        `Buffer API に接続できません（HTTP ${status || "通信エラー"}）。認証・接続・利用上限を確認してください`,
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

  /**
   * Verify the account, its connection, the member's posting/read
   * permissions, the channel's daily posting limit and, when Buffer reports
   * it, the remaining API request budget; all in one request.
   */
  async verifyAccount(): Promise<void> {
    const { channel, dailyPostingLimits } = await this.request(
      "query($input: ChannelInput!, $limits: DailyPostingLimitsInput!) { channel(input: $input) { id name service allowedActions isDisconnected isLocked isQueuePaused linkShortening { isEnabled } } dailyPostingLimits(input: $limits) { channelId isAtLimit limit scheduled } }",
      { input: { id: this.channel }, limits: { channelIds: [this.channel] } },
    );
    const rateLimit = this.rateLimit;
    if (
      !isRecord(channel) ||
      channel.id !== this.channel ||
      channel.service !== "twitter" ||
      typeof channel.name !== "string" ||
      channel.name.replace(/^@/, "").toLowerCase() !== ACCOUNT.toLowerCase()
    ) {
      throw new PostError("Buffer の投稿先が X の @NilayNews と一致しません");
    }
    const actions = channel.allowedActions;
    if (
      !Array.isArray(actions) ||
      !["scheduleUpdates", "readUpdates"].every((action) =>
        actions.includes(action),
      )
    ) {
      throw new PostError(
        "Buffer のチャンネルで投稿と投稿結果の読み取り権限を確認してください",
      );
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
    this.checkDailyLimit(dailyPostingLimits);
    if (rateLimit !== undefined) BufferClient.checkBudget(rateLimit);
  }

  /** Buffer's current-day count for this channel must leave room for one post. */
  private checkDailyLimit(limits: unknown): void {
    const count = (value: unknown): value is number =>
      Number.isSafeInteger(value) && (value as number) >= 0;
    const [limit] = Array.isArray(limits) ? limits : [];
    if (
      !Array.isArray(limits) ||
      limits.length !== 1 ||
      !isRecord(limit) ||
      limit.channelId !== this.channel ||
      typeof limit.isAtLimit !== "boolean" ||
      !count(limit.limit) ||
      !count(limit.scheduled)
    ) {
      throw new PostError(
        "Buffer のチャンネルの1日の投稿上限を確認できません。Buffer を確認してください",
      );
    }
    if (limit.isAtLimit || limit.scheduled >= limit.limit) {
      throw new PostError(
        `Buffer のチャンネルが1日の投稿上限に達しています（${limit.scheduled}/${limit.limit} 件）。Buffer の上限がリセットされてから再度有効にしてください`,
      );
    }
  }

  /**
   * Every reported rate window must still allow the post, its confirmations
   * and a spare request; a malformed header is refused.
   */
  private static checkBudget(header: string): void {
    const windows = rateWindows(header);
    if (!windows) {
      throw new PostError(
        "Buffer API の残り利用回数を確認できません。Buffer を確認してください",
      );
    }
    const low = windows.filter(({ remaining }) => remaining < REQUEST_RESERVE);
    if (low.length) {
      const remaining = Math.min(...low.map((window) => window.remaining));
      const wait = Math.max(...low.map((window) => window.reset));
      throw new PostError(
        `Buffer API の残り利用回数が不足しています（残り ${remaining} 回）。${approximately(wait)}後に再度有効にしてください`,
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
    private readonly jev?: Jev,
  ) {}

  /** Recheck against confirmed posts while this claim excludes other automatic sends. */
  private async checkDuplicates(
    articleId: string,
  ): Promise<PostScreening | undefined> {
    if (!this.jev?.key) return undefined;
    const article = await this.repository.article(articleId);
    if (isSourceCandidate(article)) return undefined;
    const evidenceHash = await this.repository.evidenceHash(article);
    const postedIds = new Set(
      (await this.repository.publicationState()).posts
        .filter((post) => post.status === "posted")
        .map((post) => post.articleId),
    );
    const posted = (await this.repository.articles()).filter(
      (other) =>
        other.id !== articleId &&
        (other.reviewStatus === "posted" || postedIds.has(other.id)),
    );
    if (!posted.length) return { evidenceHash, permitted: true };
    const settings = await this.repository.settings();
    try {
      const result = await this.jev.relate(article, settings.rubric, posted);
      if (["duplicate", "uncertain"].includes(result.relation ?? "")) {
        const related = posted.find(
          (other) => other.id === result.relatedArticleId,
        );
        if (
          !related ||
          !(await this.repository.analyzeResult(
            articleId,
            evidenceHash,
            settings.rubric,
            { ...result, analysisStatus: article.analysisStatus },
            await this.repository.evidenceHash(related),
          ))
        )
          throw new UserError(
            "重複確認中に記事または選定基準が変更されました。再確認してください",
          );
        return { evidenceHash, permitted: false };
      }
    } catch (error) {
      throw new PostError(
        `投稿前の重複確認に失敗しました。${error instanceof UserError ? error.message : "Jev の応答を確認してください"}`,
      );
    }
    return { evidenceHash, permitted: true };
  }

  /**
   * Work through the open round one post at a time, within a bounded burst:
   * at most `TICK_OPERATIONS` operations started within `TICK_SECONDS`. The
   * burst goes on only after a post is confirmed as sent; a post awaiting
   * its remote outcome, a claim withdrawn before sending, an unknown or
   * failed post, nothing due, and every error stop it. The rest of the round
   * follows on later ticks.
   */
  async tick(timestamp = this.clock()): Promise<void> {
    const started = this.clock();
    let at = Math.max(timestamp, started);
    for (let operation = 0; operation < TICK_OPERATIONS; operation += 1) {
      if (operation > 0) {
        const now = this.clock();
        if (now - started >= TICK_SECONDS) return;
        at = Math.max(at, now);
      }
      if (!(await this.step(at))) return;
    }
  }

  /**
   * Confirm one submitted post, or else claim and send at most one new post;
   * whether the tick may go on at once. Storage errors, including stale claim
   * tokens, propagate; an uncertain send is recorded as unknown and never
   * retried. A claim that is withdrawn or no longer owned right before
   * sending is never sent.
   */
  private async step(timestamp: number): Promise<boolean> {
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
      } catch (error) {
        if (finalCheck || error instanceof PostRateLimitError) {
          await this.repository.finishPost(pending.article_id, "unknown", {
            error:
              error instanceof PostRateLimitError
                ? error.message
                : "Buffer の投稿結果を取得できません。Buffer と X を確認してください",
            claimToken: pending.claim_token,
          });
        }
        return false;
      }
      return this.accept(
        pending.article_id,
        result,
        pending.claim_token,
        finalCheck,
      );
    }
    const attempt = await this.repository.claimPost(timestamp);
    if (!attempt) return false;
    let sending = false;
    let post: BufferPost;
    try {
      await this.client.verifyAccount();
      const screening = await this.checkDuplicates(attempt.articleId);
      // Remote checks may be slow: recheck the claim, settings, article evidence,
      // eligibility and draft text right before sending.
      if (
        !(await this.repository.authorizePostSend(
          attempt.articleId,
          attempt.claimToken,
          this.clock(),
          screening,
        ))
      )
        return false;
      // The authorization's database round trip may finish after 23:00.
      // Revoke only our own unsent claim before returning for the night.
      const sendAt = Math.max(timestamp, this.clock());
      if (!isPostingTime(sendAt)) {
        await this.repository.authorizePostSend(
          attempt.articleId,
          attempt.claimToken,
          sendAt,
        );
        return false;
      }
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
      return false;
    }
    await this.repository.submitPost(
      attempt.articleId,
      post.id,
      this.client.channel,
      this.clock(),
      attempt.claimToken,
    );
    return this.accept(attempt.articleId, post, attempt.claimToken, false);
  }

  /** Records the remote outcome; whether the post was confirmed as sent. */
  private async accept(
    articleId: string,
    post: BufferPost,
    claimToken: string,
    finalCheck: boolean,
  ): Promise<boolean> {
    if (post.status === "sent") {
      await this.repository.finishPost(articleId, "posted", {
        postId: xPostId(post),
        timestamp: this.clock(),
        claimToken,
      });
      return true;
    }
    if (
      ["error", "draft", "needs_approval"].includes(post.status) ||
      finalCheck
    ) {
      // The remote item may still be retried or approved in Buffer; keep the claim.
      await this.repository.finishPost(articleId, "unknown", {
        error: INCOMPLETE,
        claimToken,
      });
    }
    return false;
  }
}
