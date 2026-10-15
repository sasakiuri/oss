// SPDX-License-Identifier: MIT
/** Authenticated Buffer GraphQL boundary and ordered quota observations. */
import type { BufferQuota, Clock } from "../domain.ts";
import { clock as systemClock } from "../domain.ts";
import { FetchError } from "../net/http.ts";
import type { FetchBytes } from "../net/types.ts";
import { parseUtf8Json, isRecord, utf8 } from "../text.ts";

import { quotaObservation, quotaPause } from "./buffer-quota.ts";
import { PostError, PostRateLimitError } from "./errors.ts";

const ENDPOINT = "https://api.buffer.com";

export interface BufferClientOptions {
  clock?: Clock;
  observeQuota?: (quota: BufferQuota) => Promise<void>;
  readQuota?: () => Promise<BufferQuota | null>;
  nextRequestOrder?: () => Promise<number>;
}

/** Empty arrays and objects count as empty API fields. */
function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return Boolean(value);
}

export class BufferGraphQL {
  /** Latest API and channel observations, ordered independently. */
  private quota?: BufferQuota;
  private sequence = 0;
  private readonly key: string;
  private readonly transport: FetchBytes;
  private readonly options: BufferClientOptions;

  constructor(
    key: string,
    transport: FetchBytes,
    options: BufferClientOptions,
  ) {
    this.key = key;
    this.transport = transport;
    this.options = options;
  }

  async observe(quota: BufferQuota): Promise<void> {
    if ((quota.requestOrder ?? 0) >= (this.quota?.requestOrder ?? 0)) {
      this.quota = { ...quota, channel: this.quota?.channel };
    }
    if (
      quota.channel &&
      (quota.channel.requestOrder ?? 0) >=
        (this.quota?.channel?.requestOrder ?? 0)
    ) {
      this.quota = { ...(this.quota ?? quota), channel: quota.channel };
    }
    await this.options.observeQuota?.(quota);
  }

  private async checkRequestBudget(): Promise<void> {
    const now = (this.options.clock ?? systemClock)();
    const quota = (await this.options.readQuota?.()) ?? this.quota;
    const retryAt = quotaPause(quota, now);
    if (retryAt !== null)
      throw new PostRateLimitError(
        retryAt - now,
        quota?.api.state === "limited",
      );
  }

  async request(
    query: string,
    variables: object,
    mutation = false,
  ): Promise<{ data: Record<string, unknown>; quota: BufferQuota }> {
    await this.checkRequestBudget();
    let data: Uint8Array;
    let quota: BufferQuota;
    const requestOrder =
      (await this.options.nextRequestOrder?.()) ?? ++this.sequence;
    try {
      const response = await this.transport(ENDPOINT, {
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
      });
      data = response.data;
      quota = {
        ...quotaObservation(
          response.rateLimit,
          response.rateLimitPolicy,
          (this.options.clock ?? systemClock)(),
        ),
        requestOrder,
      };
      await this.observe(quota);
    } catch (error) {
      if (!(error instanceof FetchError)) throw error;
      const { status, retryAfter } = error;
      await this.observe({
        ...quotaObservation(
          error.rateLimit,
          error.rateLimitPolicy,
          (this.options.clock ?? systemClock)(),
          status === 429,
          retryAfter,
        ),
        requestOrder,
      });
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
      const value: unknown = parseUtf8Json(data);
      if (isRecord(value) && !truthy(value.errors) && isRecord(value.data))
        return { data: value.data, quota };
    } catch {
      // Treated as an unverifiable response below.
    }
    throw new PostError(
      "Buffer API の応答を確認できません。Buffer と X を確認してください",
      mutation,
    );
  }
}
