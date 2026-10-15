// SPDX-License-Identifier: MIT
/** Durable publication claims, authorization and bounded scheduling. */
import { GoogleNewsResolver } from "../collection/google-news-resolver.ts";
import type { Clock } from "../domain.ts";
import { clock as systemClock } from "../domain.ts";
import type { Jev } from "../jev/client.ts";
import type { FetchBytes } from "../net/types.ts";
import type { NewsRepository } from "../repository.ts";

import { PostError } from "./errors.ts";
import { isPostingTime } from "./policy.ts";
import { PostConfirmation } from "./post-confirmation.ts";
import { screenPost } from "./post-screening.ts";
import type { BufferPost, PublishingClient } from "./types.ts";

/** Operations, each a confirmation or a claimed send, one tick may perform. */
const TICK_OPERATIONS = 10;
/** A tick starts no further operation this many seconds after it started. */
const TICK_SECONDS = 45;

export class Publisher {
  private readonly repository: NewsRepository;
  readonly client: PublishingClient;
  private readonly clock: Clock;
  private readonly jev?: Jev;
  private readonly urlTransport?: FetchBytes;
  private readonly confirmation: PostConfirmation;

  constructor(
    repository: NewsRepository,
    client: PublishingClient,
    clock: Clock = systemClock,
    jev?: Jev,
    urlTransport?: FetchBytes,
  ) {
    this.repository = repository;
    this.client = client;
    this.clock = clock;
    this.jev = jev;
    this.urlTransport = urlTransport;
    this.confirmation = new PostConfirmation(repository, client, clock);
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
    const resolver = new GoogleNewsResolver(this.repository, {
      clock: this.clock,
      transport: this.urlTransport,
    });
    let at = Math.max(timestamp, started);
    for (let operation = 0; operation < TICK_OPERATIONS; operation += 1) {
      if (operation > 0) {
        const now = this.clock();
        if (now - started >= TICK_SECONDS) return;
        at = Math.max(at, now);
      }
      if (!(await this.step(at, resolver))) return;
    }
  }

  /**
   * Confirm one submitted post, or else claim and send at most one new post;
   * whether the tick may go on at once. Storage errors, including stale claim
   * tokens, propagate; an uncertain send is recorded as unknown and never
   * retried. A claim that is withdrawn or no longer owned right before
   * sending is never sent.
   */
  private async step(
    timestamp: number,
    resolver: GoogleNewsResolver,
  ): Promise<boolean> {
    const pending = await this.repository.claimPostCheck(timestamp);
    if (pending) return this.confirmation.check(pending);
    const attempt = await this.repository.claimPost(timestamp, (url) =>
      resolver.resolve(url),
    );
    if (!attempt) return false;
    let sending = false;
    let post: BufferPost;
    try {
      await this.client.verifyAccount();
      const screening = await screenPost(
        this.repository,
        attempt.articleId,
        this.jev,
      );
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
    return this.confirmation.accept(
      attempt.articleId,
      post,
      attempt.claimToken,
      false,
    );
  }
}
