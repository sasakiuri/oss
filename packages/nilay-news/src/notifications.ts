// SPDX-License-Identifier: MIT
/**
 * Bounded Slack operational notices; callers supply curated, nonsecret text.
 *
 * Delivery failures never replace the caller's result. A durable hourly
 * claim suppresses uncertain sends as well as successful ones. Without a
 * working repository, suppression is best effort within one isolate.
 *
 * A throttle claim must be referenced by a durable record so recovery can
 * release it. If that record cannot be written the claim is released at once;
 * if that release fails too, the claim is kept in this isolate and released by
 * the next operation holding the notification lock. Recovery keeps the
 * released token in the record, so a failed release is retried by the next
 * report. Releases match the token and are idempotent.
 */
import { withDeadline } from "./deadline.ts";
import type { Clock } from "./domain.ts";
import { clock as systemClock } from "./domain.ts";
import { fetchBytes } from "./net/http.ts";
import type { FetchBytes } from "./net/types.ts";
import { urlsplit } from "./net/url.ts";
import type { NewsRepository } from "./repository.ts";
import { dropEnd, length, sha256, strip, utf8 } from "./text.ts";

type NoticeLevel = "error" | "warning" | "info" | "recovery";

const HOUR = 3600;
const LOCAL_LIMIT = 256;
const FAILURE = "NilayNews operational notification could not be completed";
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const LABELS: Record<NoticeLevel, string> = {
  error: "エラー",
  warning: "注意",
  info: "お知らせ",
  recovery: "復旧",
};

interface LocalNotice {
  at: number;
  active: boolean;
}
interface NoticeRecord {
  active?: boolean;
  lastAttemptAt?: number;
  lastStatus?: string;
  claimToken?: string;
  delivered?: boolean;
  recoveredAt?: number;
}

// Isolate-wide state shared by every Notifier, as a Worker isolate is.
const local = new Map<string, LocalNotice>();
const orphans = new Map<string, readonly [string, string]>();

/** Forget isolate-local notice state (tests simulate a fresh isolate). */
export function resetNoticeState(): void {
  local.clear();
  orphans.clear();
}

/** Number of unreleased throttle claims kept in this isolate. */
export function orphanClaims(): number {
  return orphans.size;
}

function fail(): void {
  // Never include an exception, URL, response body, header or token.
  console.error(FAILURE);
}

function validWebhook(value: string): boolean {
  if (length(value) > 512) return false;
  try {
    const parts = urlsplit(value);
    return (
      parts.scheme === "https" &&
      parts.netloc === "hooks.slack.com" &&
      !parts.query &&
      !parts.fragment &&
      /^\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(
        parts.path,
      ) &&
      value === `https://hooks.slack.com${parts.path}`
    );
  } catch {
    return false;
  }
}

/** Defense in depth, not permission to pass raw exception messages. */
function safe(value: string, limit: number): string {
  const text = value
    .replace(/https?:\/\/\S+/gi, "[URL omitted]")
    .replace(/\b(?:Bearer|Basic)\s+\S+/gi, "[credential omitted]")
    .replace(
      /\b(?:[A-Z_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|WEBHOOK_URL)|authorization)\s*[:=]\s*\S+/gi,
      "[credential omitted]",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[credential omitted]",
    )
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, " ")
    // Escaping also protects fallbacks from Slack mention and link syntax.
    .replaceAll("&", "＆")
    .replaceAll("<", "＜")
    .replaceAll(">", "＞")
    .replaceAll("@", "＠");
  const raw = utf8(strip(text));
  let end = Math.min(limit, raw.length);
  while (end > 0 && end < raw.length && ((raw[end] ?? 0) & 0xc0) === 0x80)
    end -= 1;
  return new TextDecoder().decode(raw.subarray(0, end));
}

/** Slack payload of at most 1024 UTF-8 bytes, plain text only. */
export function noticePayload(
  title: string,
  detail: string,
  level: NoticeLevel,
): Uint8Array {
  let heading = `NilayNews｜${LABELS[level]}｜${safe(title, 180) || "処理状況を確認してください"}`;
  let body = safe(detail, 450);
  const encode = () =>
    utf8(
      JSON.stringify({
        text: heading,
        mrkdwn: false,
        unfurl_links: false,
        unfurl_media: false,
        blocks: [
          {
            type: "section",
            text: {
              type: "plain_text",
              text: heading + (body ? `\n${body}` : ""),
              emoji: false,
            },
          },
        ],
      }),
    );
  // The fallback text repeats the heading; shrink text, never serialized JSON.
  let payload = encode();
  while (payload.length > 1024) {
    body = dropEnd(body, 16);
    if (!body) heading = dropEnd(heading, 16);
    payload = encode();
  }
  return payload;
}

export class Notifier {
  readonly configured: boolean;
  private readonly webhook: string;
  private readonly scope: Promise<string>;

  constructor(
    private readonly repository: NewsRepository | null,
    webhook = "",
    private readonly transport: FetchBytes = fetchBytes,
    private readonly clock: Clock = systemClock,
  ) {
    this.webhook = validWebhook(webhook) ? webhook : "";
    this.configured = Boolean(this.webhook);
    this.scope = this.webhook ? sha256(this.webhook) : Promise.resolve("");
    if (webhook && !this.configured)
      console.error(
        "NilayNews operational notification configuration is invalid",
      );
  }

  /**
   * Attempt one notice per stable event per hour; resolve to delivery success.
   * `title` and `detail` must be application-authored summaries.
   */
  async report(
    key: string,
    title: string,
    detail = "",
    level: NoticeLevel = "error",
  ): Promise<boolean> {
    const identity = this.configured ? await this.identity(key) : null;
    if (!identity) return false;
    const [digest, localKey] = identity;
    const operation = `notice-op:${digest}`;
    const throttle = `notice:${digest}`;
    const repository = this.repository;
    if (!repository) return this.fallback(localKey, title, detail, level);
    const held: {
      token: string | null;
      claim: string | null;
      attempted: boolean;
      persisted: boolean;
    } = {
      token: null,
      claim: null,
      attempted: false,
      persisted: false,
    };
    try {
      return await withDeadline(async (signal) => {
        held.token = await repository.acquireHost(operation, this.clock(), 30);
        if (held.token === null) return false;
        await this.releaseOrphan(repository, localKey);
        const previous =
          (await repository.getRecord<NoticeRecord>("notifications", digest)) ??
          {};
        signal.throwIfAborted();
        if (
          previous.active &&
          (previous.lastAttemptAt ?? 0) + HOUR > this.clock()
        )
          return false;
        // Retry the claim release of a recovered or expired incident.
        if (previous.claimToken)
          await repository.releaseHost(throttle, previous.claimToken);
        // The claim is kept until its TTL, including uncertain network results;
        // recovery releases it under the operation lock.
        held.claim = await repository.acquireHost(throttle, this.clock(), HOUR);
        if (held.claim === null) return false;
        signal.throwIfAborted();
        const record: NoticeRecord = {
          active: true,
          lastAttemptAt: this.clock(),
          lastStatus: level,
          claimToken: held.claim,
          delivered: false,
        };
        const lease = { leaseHost: operation, leaseToken: held.token };
        await repository.putRecord("notifications", digest, record, lease);
        held.persisted = true;
        const seen = local.get(localKey);
        if (seen?.active && seen.at + HOUR > this.clock()) return false;
        signal.throwIfAborted();
        this.remember(localKey, true);
        held.attempted = true;
        record.delivered = await this.deliver(title, detail, level);
        await repository.putRecord("notifications", digest, record, lease);
        return record.delivered;
      }, 12_000);
    } catch {
      fail();
      const { claim } = held;
      if (claim !== null && !held.persisted) {
        // No record references this claim, so recovery could not release it.
        try {
          await withDeadline(
            () => repository.releaseHost(throttle, claim),
            2000,
          );
        } catch {
          fail();
          this.orphan(localKey, throttle, claim);
        }
      }
      return held.attempted
        ? false
        : this.fallback(localKey, title, detail, level);
    } finally {
      await this.release(repository, operation, held.token);
    }
  }

  /** Notify recovery once, and permit a later, distinct incident. */
  async recover(key: string, title: string): Promise<boolean> {
    const identity = this.configured ? await this.identity(key) : null;
    if (!identity) return false;
    const [digest, localKey] = identity;
    const operation = `notice-op:${digest}`;
    const repository = this.repository;
    if (!repository)
      return this.fallback(localKey, title, "", "recovery", true);
    const held: { token: string | null; attempted: boolean } = {
      token: null,
      attempted: false,
    };
    try {
      return await withDeadline(async (signal) => {
        held.token = await repository.acquireHost(operation, this.clock(), 30);
        if (held.token === null) return false;
        const record = await repository.getRecord<NoticeRecord>(
          "notifications",
          digest,
        );
        signal.throwIfAborted();
        if (!record) {
          await this.releaseOrphan(repository, localKey);
          signal.throwIfAborted();
          return this.fallback(localKey, title, "", "recovery", true);
        }
        if (!record.active) {
          this.remember(localKey, false);
          return false;
        }
        Object.assign(record, {
          active: false,
          lastStatus: "recovery",
          recoveredAt: this.clock(),
        });
        // Persist first: a timeout must not repeat recovery on every success.
        await repository.putRecord("notifications", digest, record, {
          leaseHost: operation,
          leaseToken: held.token,
        });
        this.remember(localKey, false);
        held.attempted = true;
        const { claimToken } = record;
        if (claimToken) {
          // The inactive record keeps the token; the next report retries a failed release.
          try {
            await withDeadline(
              () => repository.releaseHost(`notice:${digest}`, claimToken),
              2000,
            );
          } catch {
            fail();
          }
        }
        return this.deliver(title, "", "recovery");
      }, 12_000);
    } catch {
      fail();
      return held.attempted
        ? false
        : this.fallback(localKey, title, "", "recovery", true);
    } finally {
      await this.release(repository, operation, held.token);
    }
  }

  private async identity(key: string): Promise<[string, string] | null> {
    if (
      typeof key !== "string" ||
      !key ||
      length(key) > 512 ||
      LONE_SURROGATE.test(key)
    )
      return null;
    const digest = await sha256(key);
    return [digest, `${await this.scope}:${digest}`];
  }

  private remember(key: string, active: boolean): void {
    if (!local.has(key) && local.size >= LOCAL_LIMIT) {
      let oldest: string | undefined;
      for (const [name, value] of local)
        if (oldest === undefined || value.at < (local.get(oldest)?.at ?? 0))
          oldest = name;
      if (oldest !== undefined) local.delete(oldest);
    }
    local.set(key, { at: this.clock(), active });
  }

  private orphan(localKey: string, host: string, claim: string): void {
    orphans.delete(localKey);
    const first = orphans.keys().next();
    if (orphans.size >= LOCAL_LIMIT && !first.done) orphans.delete(first.value);
    orphans.set(localKey, [host, claim]);
  }

  private async releaseOrphan(
    repository: NewsRepository,
    localKey: string,
  ): Promise<void> {
    const orphan = orphans.get(localKey);
    if (!orphan) return;
    await repository.releaseHost(...orphan);
    if (orphans.get(localKey) === orphan) orphans.delete(localKey);
  }

  private async release(
    repository: NewsRepository,
    operation: string,
    token: string | null,
  ): Promise<void> {
    if (token === null) return;
    try {
      await withDeadline(() => repository.releaseHost(operation, token), 2000);
    } catch {
      fail();
    }
  }

  private async deliver(
    title: string,
    detail: string,
    level: NoticeLevel,
  ): Promise<boolean> {
    try {
      const result = await withDeadline(
        (signal) =>
          this.transport(this.webhook, {
            body: noticePayload(title, detail, level),
            headers: { "Content-Type": "application/json" },
            timeout: 5,
            maxBytes: 1024,
            beforeRedirect: () => {
              throw new Error("Notification redirects are not allowed");
            },
            signal,
          }),
        5000,
      );
      const ack = new TextDecoder()
        .decode(result.data)
        .replace(/^[ \t\n\r\v\f]+|[ \t\n\r\v\f]+$/g, "");
      if (result.url === this.webhook && ack === "ok") return true;
    } catch {
      // Reported below without detail.
    }
    fail();
    return false;
  }

  private fallback(
    localKey: string,
    title: string,
    detail: string,
    level: NoticeLevel,
    recovery = false,
  ): Promise<boolean> {
    const previous = local.get(localKey);
    if (recovery) {
      if (!previous?.active) return Promise.resolve(false);
      this.remember(localKey, false);
    } else {
      if (previous?.active && previous.at + HOUR > this.clock())
        return Promise.resolve(false);
      this.remember(localKey, true);
    }
    return this.deliver(title, detail, level);
  }
}
