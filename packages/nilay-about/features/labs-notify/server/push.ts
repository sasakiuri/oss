import 'server-only';

import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  languageSchema,
  PUSH_SUBSCRIPTION_TTL_DAYS,
  pushSubscriptionSchema,
  type PushSubscriptionData,
} from '@/lib/schemas/push';
import { secretsEqual } from '@/lib/server/guards';
import { RequestError } from '@/lib/server/http';
import { indexScore, withinLimit, type LabsStore } from '@/lib/server/store';
import {
  isAllowedPushEndpoint,
  isValidUserAgentKey,
  VapidConfigError,
  type PushMessage,
  type SendPush,
} from '@/lib/server/web-push';

export type Language = z.infer<typeof languageSchema>;

const DAY_SECONDS = 24 * 60 * 60;
export const SUBSCRIPTION_TTL_SECONDS = PUSH_SUBSCRIPTION_TTL_DAYS * DAY_SECONDS;

/** Only what sending needs: the endpoint, its keys and the language to write in. */
const storedSubscriptionSchema = pushSubscriptionSchema.extend({ language: languageSchema });

export const subscriptionKey = (id: string) => `labs:push:sub:${id}`;
const SUBSCRIPTIONS_INDEX = 'labs:push:subs';

/**
 * Limits on anonymous registration: the stored subscriptions in all, and new ones a day. A device
 * that re-registers is never counted twice.
 */
export const PUSH_LIMITS = {
  subscriptions: 50_000,
  newPerDay: { max: 5_000, windowSeconds: 86_400 },
} as const;

/**
 * Push requests under way at once in this server instance, across every `notify`, whichever feature
 * or plan they are for. The limit is per instance, not for the whole service: sends come only from
 * the scheduled jobs (each route runs one at a time under its cron lock) and from trap hooks (limited
 * per IP and per hook), so the instances sending at once are few. A place is held only for the push
 * request itself, never while a subscription is read, and places go round the callers waiting for
 * one (one each in turn), so a caller with many slow devices cannot keep the others waiting.
 */
const SEND_PLACES = 25;
/** Sends one `notify` has under way at once, by default: its share, however many devices it has. */
const SENDS_PER_CALL = 5;
/** Subscription reads under way at once in this instance, outside the send places. */
const READ_PLACES = 50;

/** At most `limit` of the given jobs at a time, the others waiting in turn. */
function createSemaphore(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (active < limit) active += 1;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await work();
    } finally {
      // The place passes straight to the next in line, or is freed.
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}

/**
 * At most `limit` jobs at a time, handed out round the callers (`group`) waiting: each caller
 * waiting gets a place in turn, whatever the number of jobs it queued.
 */
function createFairSemaphore(limit: number) {
  let active = 0;
  const queues = new Map<object, (() => void)[]>();
  // Callers with jobs waiting, in the order they are served.
  const turn: object[] = [];
  const handOn = () => {
    const group = turn.shift();
    if (group === undefined) {
      active -= 1;
      return;
    }
    const queue = queues.get(group) ?? [];
    const next = queue.shift();
    if (queue.length > 0) turn.push(group);
    else queues.delete(group);
    next?.();
  };
  return async <T>(group: object, work: () => Promise<T>): Promise<T> => {
    if (active < limit) active += 1;
    else {
      await new Promise<void>((resolve) => {
        const queue = queues.get(group);
        if (queue) queue.push(resolve);
        else {
          queues.set(group, [resolve]);
          turn.push(group);
        }
      });
    }
    try {
      return await work();
    } finally {
      handOn();
    }
  };
}

/** A stable id for a device's subscription that does not reveal its endpoint. */
export const subscriptionId = (endpoint: string) => createHash('sha256').update(endpoint).digest('base64url');

/** Localized text for a notification, chosen by each recipient's language. */
export type LocalizedMessage = (language: Language) => PushMessage;

export interface NotifyResult {
  sent: number;
  gone: number;
  failed: number;
  /** Subscriptions that no longer exist, for the caller to drop from its own records. */
  goneIds: string[];
  /** Subscriptions that could not be reached this time (errors, timeouts), for the caller to retry. */
  failedIds: string[];
  /** Subscriptions not tried because `sendBy` had passed, for the caller to try again later. */
  skippedIds: string[];
}

/** Renewals of subscriptions, for a caller to apply in the same step as its own write. */
export interface SubscriptionRenewal {
  indexKey: string;
  members: { key: string; member: string; score: number }[];
}

export interface PushService {
  /** Stores or refreshes a device's subscription and returns its id and expiry. */
  save(subscription: PushSubscriptionData, language: Language): Promise<{ id: string; expiresAt: Date }>;
  /** Removes a subscription after checking the caller holds its secret. Returns its id. */
  remove(subscription: PushSubscriptionData): Promise<string | null>;
  /** How to renew these subscriptions (record and index entry) along with the caller's record. */
  renewalOf(ids: readonly string[]): SubscriptionRenewal;
  /** The id of a stored subscription whose secret matches, or null. */
  owner(subscription: PushSubscriptionData): Promise<string | null>;
  /**
   * Sends to several devices, a few at a time (`perCall`), and returns when every send has finished.
   * No read or send is started after `sendBy` (ms since the epoch); those devices are `skipped`.
   */
  notify(
    ids: readonly string[],
    message: LocalizedMessage,
    options: { ttlSeconds: number; urgency: 'normal' | 'high'; timeoutMs?: number; sendBy?: number; perCall?: number },
  ): Promise<NotifyResult>;
}

export function createPushService(dependencies: {
  store: () => LabsStore;
  send: SendPush;
  now?: () => number;
}): PushService {
  const now = dependencies.now ?? Date.now;
  const indexed = (id: string) => ({
    key: subscriptionKey(id),
    indexKey: SUBSCRIPTIONS_INDEX,
    member: id,
    score: indexScore(now() + SUBSCRIPTION_TTL_SECONDS * 1000, id),
  });
  const sendPlace = createFairSemaphore(SEND_PLACES);
  const readPlace = createSemaphore(READ_PLACES);
  // The record and its index entry go together, so the count never drifts from what is stored.
  const forget = (id: string) => dependencies.store().deleteIndexed(indexed(id));

  /** The stored record as read (for a conditional write over it) and, when it parses, its content. */
  async function read(id: string) {
    const raw = await dependencies.store().get(subscriptionKey(id));
    if (raw === null) return { raw, stored: null };
    const parsed = storedSubscriptionSchema.safeParse(safeJson(raw));
    return { raw, stored: parsed.success ? parsed.data : null };
  }

  const load = async (id: string) => (await read(id)).stored;

  type Outcome = 'sent' | 'gone' | 'failed' | 'skipped';

  /**
   * One device's send: the subscription is read outside the send places, and a place is held only
   * for the request. Nothing but a configuration fault escapes: a store error counts as failed.
   */
  async function sendOne(
    group: object,
    id: string,
    message: LocalizedMessage,
    options: { ttlSeconds: number; urgency: 'normal' | 'high'; timeoutMs?: number; sendBy?: number },
  ): Promise<Outcome> {
    const late = () => options.sendBy !== undefined && now() > options.sendBy;
    try {
      const target = await readPlace(async () => (late() ? 'late' : await load(id)));
      if (target === 'late') return 'skipped';
      if (!target) return 'gone';
      const outcome = await sendPlace(group, async () =>
        late()
          ? ('skipped' as const)
          : dependencies.send(target, message(target.language), {
              ttlSeconds: options.ttlSeconds,
              urgency: options.urgency,
              timeoutMs: options.timeoutMs,
            }),
      );
      if (outcome === 'gone') await forget(id);
      return outcome;
    } catch (error) {
      // Missing keys are a configuration fault for the whole job; anything else stays with this device.
      if (error instanceof VapidConfigError) throw error;
      return 'failed';
    }
  }

  return {
    async save(subscription, language) {
      if (!isAllowedPushEndpoint(subscription.endpoint)) {
        throw new RequestError(400, 'このブラウザーの通知サービスには対応していません。');
      }
      // A key that is not a point on the curve would make every later send throw.
      if (!isValidUserAgentKey(subscription.keys.p256dh)) throw new RequestError(400, '通知の登録情報が不正です。');
      const store = dependencies.store();
      const id = subscriptionId(subscription.endpoint);
      const record = { endpoint: subscription.endpoint, keys: subscription.keys, language };
      // Someone who learned an endpoint must not replace its keys and so silence the device. The
      // keys are checked against the record read, and written only over that same record (or only
      // if there is still none), so two first saves of one endpoint cannot both succeed.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { raw, stored } = await read(id);
        if (stored && !secretsEqual(stored.keys.auth, subscription.keys.auth)) {
          throw new RequestError(403, '登録を確認できませんでした。');
        }
        if (raw === null && !(await withinLimit(store, 'create:subscriptions', PUSH_LIMITS.newPerDay, now()))) {
          throw new RequestError(429, '本日の通知登録数の上限に達しました。明日お試しください。');
        }
        const expiresAt = now() + SUBSCRIPTION_TTL_SECONDS * 1000;
        const saved = await store.putIndexed({
          ...indexed(id),
          value: JSON.stringify(record),
          ttlSeconds: SUBSCRIPTION_TTL_SECONDS,
          max: PUSH_LIMITS.subscriptions,
          pruneUpTo: now(),
          expected: raw,
        });
        if (saved === 'full') throw new RequestError(503, '通知の登録数が上限に達しています。');
        if (saved === 'written') return { id, expiresAt: new Date(expiresAt) };
        // Changed since it was read: read it again and check the keys against what is there now.
      }
      throw new RequestError(409, '通知の登録が混み合っています。もう一度お試しください。');
    },

    async remove(subscription) {
      const id = subscriptionId(subscription.endpoint);
      const stored = await load(id);
      if (!stored) return null;
      // The endpoint alone is not proof of owning the subscription; its auth secret is.
      if (!secretsEqual(stored.keys.auth, subscription.keys.auth)) {
        throw new RequestError(403, '登録を確認できませんでした。');
      }
      await forget(id);
      return id;
    },

    renewalOf: (ids) => ({ indexKey: SUBSCRIPTIONS_INDEX, members: [...new Set(ids)].map(indexed) }),

    async owner(subscription) {
      const id = subscriptionId(subscription.endpoint);
      const stored = await load(id);
      if (!stored || !secretsEqual(stored.keys.auth, subscription.keys.auth)) return null;
      return id;
    },

    async notify(ids, message, options) {
      const unique = [...new Set(ids)];
      const outcomes = new Map<string, Outcome>();
      // This call's turn in the send places, shared by its own sends.
      const group = {};
      let next = 0;
      let fault: unknown = null;
      // Every send is awaited, even when another one throws: none keeps running after this returns,
      // so a caller's next message is never overtaken by an earlier one still in flight. After a
      // fault, no new send is started.
      const workers = Array.from({ length: Math.min(options.perCall ?? SENDS_PER_CALL, unique.length) }, async () => {
        while (next < unique.length && fault === null) {
          const id = unique[next];
          next += 1;
          if (id === undefined) continue;
          try {
            outcomes.set(id, await sendOne(group, id, message, options));
          } catch (error) {
            fault = error;
          }
        }
      });
      await Promise.allSettled(workers);
      if (fault !== null) throw fault;
      const result: NotifyResult = {
        sent: 0,
        gone: 0,
        failed: 0,
        goneIds: [],
        failedIds: [],
        skippedIds: [],
      };
      for (const id of unique) {
        const outcome = outcomes.get(id) ?? 'failed';
        if (outcome === 'skipped') {
          result.skippedIds.push(id);
          continue;
        }
        result[outcome] += 1;
        if (outcome === 'gone') result.goneIds.push(id);
        if (outcome === 'failed') result.failedIds.push(id);
      }
      return result;
    },
  };
}

export function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
