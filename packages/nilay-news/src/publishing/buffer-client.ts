// SPDX-License-Identifier: MIT
/** Buffer account verification and validated publication operations. */
import type { BufferQuota } from "../domain.ts";
import { fetchBytes } from "../net/http.ts";
import type { FetchBytes } from "../net/types.ts";
import { isRecord } from "../text.ts";

import { validatePost } from "./buffer-post.ts";
import { formatQuotaWait, postingQuotaShortfall } from "./buffer-quota.ts";
import { BufferGraphQL, type BufferClientOptions } from "./buffer-transport.ts";
import { ACCOUNT } from "./draft.ts";
import { PostError } from "./errors.ts";
import type { BufferPost, PublishingClient } from "./types.ts";

const POST_FIELDS = "id channelId channelService text status externalLink";
const KNOWN_REJECTIONS = new Set([
  "NotFoundError",
  "UnauthorizedError",
  "LimitReachedError",
  "InvalidInputError",
]);

export class BufferClient implements PublishingClient {
  readonly channel: string;
  private readonly api: BufferGraphQL;
  readonly configured: boolean;

  constructor(
    key = "",
    channel = "",
    transport: FetchBytes = fetchBytes,
    options: BufferClientOptions = {},
  ) {
    this.channel = channel;
    this.configured = Boolean(key && channel);
    this.api = new BufferGraphQL(key, transport, options);
  }

  private request(query: string, variables: object, mutation = false) {
    if (!this.configured)
      throw new PostError(
        "Buffer の API キーとチャンネル ID を設定してください",
      );
    return this.api.request(query, variables, mutation);
  }

  /**
   * Verify the account, its connection, the member's posting/read
   * permissions, the channel's daily posting limit and, when Buffer reports
   * it, the remaining API request budget; all in one request.
   */
  async verifyAccount(): Promise<void> {
    const {
      data: { channel, dailyPostingLimits },
      quota,
    } = await this.request(
      "query($input: ChannelInput!, $limits: DailyPostingLimitsInput!) { channel(input: $input) { id name service allowedActions isDisconnected isLocked isQueuePaused linkShortening { isEnabled } } dailyPostingLimits(input: $limits) { channelId isAtLimit limit scheduled sent } }",
      { input: { id: this.channel }, limits: { channelIds: [this.channel] } },
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
    await this.checkDailyLimit(dailyPostingLimits, quota);
    if (quota.api.state === "malformed")
      throw new PostError(
        "Buffer API の残り利用回数を確認できません。Buffer を確認してください",
      );
    const shortfall = postingQuotaShortfall(quota);
    if (shortfall) {
      throw new PostError(
        `Buffer API の残り利用回数が不足しています（残り ${shortfall.remaining} 回）。${formatQuotaWait(shortfall.wait)}後に再度有効にしてください`,
      );
    }
  }

  /** Buffer's current-day count for this channel must leave room for one post. */
  private async checkDailyLimit(
    limits: unknown,
    quota: BufferQuota,
  ): Promise<void> {
    const count = (value: unknown): value is number =>
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    const limit: unknown =
      Array.isArray(limits) && limits.length === 1 ? limits[0] : undefined;
    if (
      !isRecord(limit) ||
      limit.channelId !== this.channel ||
      typeof limit.isAtLimit !== "boolean" ||
      (limit.limit !== null && !count(limit.limit)) ||
      !count(limit.scheduled) ||
      (limit.sent !== undefined && !count(limit.sent))
    ) {
      throw new PostError(
        "Buffer のチャンネルの1日の投稿上限を確認できません。Buffer を確認してください",
      );
    }
    await this.api.observe({
      ...quota,
      channel: {
        observedAt: quota.observedAt,
        requestOrder: quota.requestOrder,
        channelId: this.channel,
        limit: limit.limit,
        scheduled: limit.scheduled,
        ...(limit.sent !== undefined ? { sent: limit.sent } : {}),
        atLimit: limit.isAtLimit,
      },
    });
    if (
      limit.isAtLimit ||
      (typeof limit.limit === "number" && limit.scheduled >= limit.limit)
    ) {
      throw new PostError(
        `Buffer のチャンネルが1日の投稿上限に達しています（${limit.scheduled}/${limit.limit} 件）。Buffer の上限がリセットされてから再度有効にしてください`,
      );
    }
  }

  async post(text: string): Promise<BufferPost> {
    const {
      data: { createPost: result },
    } = await this.request(
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
    const {
      data: { post },
    } = await this.request(
      `query($input: PostInput!) { post(input: $input) { ${POST_FIELDS} } }`,
      { input: { id } },
    );
    return validatePost(post, text, channelId, id);
  }
}
