import 'server-only';

import { z } from 'zod';

import type { PushSubscriptionData } from '@/lib/schemas/push';
import { secretsEqual } from '@/lib/server/guards';
import { RequestError } from '@/lib/server/http';
import { createToken, hashToken } from '@/lib/server/secrets';
import { withinLimit, type LabsStore } from '@/lib/server/store';
import { HOOK_CALLS_PER_MINUTE, HOOK_DEVICES_MAX, HOOK_TTL_DAYS } from '@/lib/trap-alerts';

import { safeJson, type Language, type PushService } from './push';

const hookSchema = z.object({ label: z.string(), manageTokenHash: z.string(), subscriptions: z.array(z.string()) });
type Hook = z.infer<typeof hookSchema>;

/**
 * Two credentials per hook. The trigger token is in the URL a device calls and can only raise an
 * alert; the manage token stays on the person's own devices and adds devices or deletes the hook.
 * A leaked device configuration therefore cannot redirect or remove the alerts. The record is keyed
 * by the trigger token's hash (the hook id), so the database holds neither token.
 *
 * Every write is a compare and set on the record as it was read, so concurrent changes (two devices
 * added at once, a call pruning devices while one is added) are retried instead of overwriting each
 * other, and a hook deleted meanwhile stays deleted.
 */
const hookKey = (hookId: string) => `labs:hook:${hookId}`;
const TTL_SECONDS = HOOK_TTL_DAYS * 24 * 60 * 60;
/** Hooks made per day across the service, so anonymous creation cannot fill the database. */
export const HOOKS_PER_DAY = 500;
const WRITE_ATTEMPTS = 8;

const gone = () => new RequestError(404, '通知用 URL が見つかりません。削除されたか期限が切れています。');

export function createTrapHooks(dependencies: { store: () => LabsStore; push: PushService; now?: () => number }) {
  const now = dependencies.now ?? Date.now;
  const store = () => dependencies.store();
  const expiry = () => new Date(now() + TTL_SECONDS * 1000).toISOString();

  async function read(hookId: string): Promise<{ hook: Hook; raw: string } | null> {
    const raw = await store().get(hookKey(hookId));
    const parsed = raw === null ? null : hookSchema.safeParse(safeJson(raw));
    return raw !== null && parsed?.success ? { hook: parsed.data, raw } : null;
  }

  async function authorize(hookId: string, manageToken: string) {
    const found = await read(hookId);
    if (!found) throw gone();
    if (!secretsEqual(hashToken(manageToken), found.hook.manageTokenHash)) {
      throw new RequestError(403, '通知用 URL を管理する権限を確認できませんでした。');
    }
    return found.hook;
  }

  /**
   * Applies `change` with compare and set, renewing the hook and its devices' subscriptions (record
   * and count) in the same step. Returns the hook written, or null when the hook no longer exists.
   */
  async function update(hookId: string, change: (hook: Hook) => Hook): Promise<Hook | null> {
    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
      const found = await read(hookId);
      if (!found) return null;
      const next = change(found.hook);
      const written = await store().compareAndSetRenewing(
        hookKey(hookId),
        found.raw,
        JSON.stringify(next),
        TTL_SECONDS,
        dependencies.push.renewalOf(next.subscriptions),
      );
      if (written) return next;
    }
    throw new RequestError(409, '通知用 URL が同時に更新されました。もう一度お試しください。');
  }

  return {
    async create(subscription: PushSubscriptionData, language: Language, label: string) {
      if (!(await withinLimit(store(), 'create:hooks', { max: HOOKS_PER_DAY, windowSeconds: 86_400 }, now()))) {
        throw new RequestError(429, '本日の発行数の上限に達しました。明日お試しください。');
      }
      const { id } = await dependencies.push.save(subscription, language);
      const triggerToken = createToken();
      const manageToken = createToken();
      const hookId = hashToken(triggerToken);
      const hook: Hook = { label, manageTokenHash: hashToken(manageToken), subscriptions: [id] };
      await store().set(hookKey(hookId), JSON.stringify(hook), { ttlSeconds: TTL_SECONDS });
      return { hookId, triggerToken, manageToken, label, expiresAt: expiry() };
    },

    /** Another of the person's devices joins, with the manage token from the first one. */
    async addDevice(hookId: string, manageToken: string, subscription: PushSubscriptionData, language: Language) {
      await authorize(hookId, manageToken);
      const { id } = await dependencies.push.save(subscription, language);
      const hook = await update(hookId, (current) => {
        if (current.subscriptions.includes(id)) return current;
        if (current.subscriptions.length >= HOOK_DEVICES_MAX) {
          throw new RequestError(409, `通知先の端末は ${HOOK_DEVICES_MAX} 台までです。`);
        }
        return { ...current, subscriptions: [...current.subscriptions, id] };
      });
      if (!hook) throw gone();
      return { hookId, label: hook.label, expiresAt: expiry() };
    },

    /**
     * The hook's name and current expiry, for the page to learn what the server has renewed. Only a
     * missing hook answers 404, which is when the page forgets the tokens.
     */
    async status(hookId: string, manageToken: string) {
      const hook = await authorize(hookId, manageToken);
      const ttl = await store().ttlSeconds(hookKey(hookId));
      return { hookId, label: hook.label, expiresAt: new Date(now() + Math.max(0, ttl) * 1000).toISOString() };
    },

    async remove(hookId: string, manageToken: string) {
      await authorize(hookId, manageToken);
      await store().del(hookKey(hookId));
    },

    /**
     * A call from the person's device or service. Each call renews the hook and the devices it
     * reaches, so a hook in use never outlives the subscriptions it sends to.
     */
    async receive(triggerToken: string, message: string) {
      const hookId = hashToken(triggerToken);
      const allowed = await withinLimit(
        store(),
        `hook:${hookId}`,
        { max: HOOK_CALLS_PER_MINUTE, windowSeconds: 60 },
        now(),
      );
      if (!allowed) throw new RequestError(429, 'Too many calls to this hook');
      const found = await read(hookId);
      if (!found) throw gone();
      const { hook } = found;
      const result = await dependencies.push.notify(
        hook.subscriptions,
        (language) =>
          language === 'ja'
            ? {
                title: `【${hook.label}】通知を受信しました`,
                body: message || '機器から通知がありました。現地を確認してください。',
                url: '/labs/trap-alerts',
              }
            : {
                title: `[${hook.label}] Alert received`,
                body: message || 'Your device sent an alert. Go and check.',
                url: '/labs/trap-alerts',
              },
        { ttlSeconds: 12 * 60 * 60, urgency: 'high' },
      );
      // Only the devices found gone are dropped; a device added meanwhile is kept.
      const kept = await update(hookId, (current) => ({
        ...current,
        subscriptions: current.subscriptions.filter((id) => !result.goneIds.includes(id)),
      }));
      // A hook deleted while the alert went out stays deleted; the call is still reported as delivered.
      // Devices that could not be reached this time are counted, so the caller can call again.
      return { delivered: result.sent, failed: result.failed, devices: kept ? kept.subscriptions.length : 0 };
    },
  };
}
