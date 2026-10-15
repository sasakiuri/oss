// SPDX-License-Identifier: MIT
/** Bounded observation of submitted posts; never resubmits uncertain sends. */
import type { BufferQuota, Clock, Post } from "../domain.ts";
import type { NewsRepository } from "../repository.ts";

import { xPostId } from "./buffer-post.ts";
import { quotaPause } from "./buffer-quota.ts";
import { PostError, PostRateLimitError } from "./errors.ts";
import { CONFIRMATION_MAX_CHECKS, confirmationDelay } from "./policy.ts";
import type { BufferPost, PublishingClient } from "./types.ts";

const INCOMPLETE =
  "Buffer の投稿が完了していません。Buffer と X を確認してください";

export class PostConfirmation {
  private readonly repository: NewsRepository;
  private readonly client: PublishingClient;
  private readonly clock: Clock;

  constructor(
    repository: NewsRepository,
    client: PublishingClient,
    clock: Clock,
  ) {
    this.repository = repository;
    this.client = client;
    this.clock = clock;
  }

  /** Consume a claimed confirmation without crossing its retry or quota limits. */
  async check(pending: Post): Promise<boolean> {
    const finalCheck = pending.check_count + 1 >= CONFIRMATION_MAX_CHECKS;
    let result: BufferPost;
    try {
      if (!pending.buffer_id || !pending.channel_id)
        throw new PostError(INCOMPLETE, true);
      const quota = await this.repository.getRecord<BufferQuota>(
        "buffer",
        "quota",
      );
      const retryAt = quotaPause(quota, this.clock());
      if (retryAt !== null)
        throw new PostRateLimitError(
          retryAt - this.clock(),
          quota?.api.state === "limited",
        );
      result = await this.client.getPost(
        pending.buffer_id,
        pending.text,
        pending.channel_id,
      );
    } catch (error) {
      if (finalCheck || (error instanceof PostError && error.uncertain)) {
        await this.repository.finishPost(pending.article_id, "unknown", {
          error:
            error instanceof PostRateLimitError
              ? error.message
              : "Buffer の投稿結果を取得できません。Buffer と X を確認してください",
          claimToken: pending.claim_token,
        });
      } else {
        await this.repository.deferPostCheck(
          pending.article_id,
          pending.claim_token,
          {
            timestamp: this.clock(),
            error:
              error instanceof PostRateLimitError
                ? error.message
                : "Buffer の投稿結果を取得できません。次の確認まで新しい投稿を保留します",
            ...(error instanceof PostRateLimitError &&
            error.retryAfter !== undefined
              ? {
                  nextAt:
                    this.clock() +
                    Math.max(confirmationDelay(0), error.retryAfter),
                }
              : {}),
          },
        );
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

  /** Records the remote outcome; whether the post was confirmed as sent. */
  async accept(
    articleId: string,
    post: BufferPost,
    claimToken: string,
    finalCheck: boolean,
  ): Promise<boolean> {
    await this.repository.deferPostCheck(articleId, claimToken, {
      timestamp: this.clock(),
      remoteStatus: post.status,
    });
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
