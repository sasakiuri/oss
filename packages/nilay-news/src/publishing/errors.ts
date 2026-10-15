// SPDX-License-Identifier: MIT
import { UserError } from "../errors.ts";

import { formatQuotaWait } from "./buffer-quota.ts";

export class PostError extends UserError {
  readonly uncertain: boolean;

  constructor(
    message: string,
    /** The post may have reached Buffer; never retry it automatically. */
    uncertain = false,
  ) {
    super(message);
    this.uncertain = uncertain;
  }
}

/** A local, sanitized message; never contains the remote response body. */
export class PostRateLimitError extends PostError {
  constructor(retryAfter?: number, http429 = true) {
    super(
      retryAfter !== undefined && Number.isFinite(retryAfter) && retryAfter >= 0
        ? `Buffer API の利用上限に達しました${http429 ? "（HTTP 429）" : "（残り利用回数の観測）"}。${formatQuotaWait(retryAfter)}後に接続と Buffer・X の投稿結果を確認してください`
        : "Buffer API の利用上限に達しました（HTTP 429）。しばらく待ってから接続と Buffer・X の投稿結果を確認してください",
    );
    this.retryAfter = retryAfter;
  }
  readonly retryAfter?: number;
}
