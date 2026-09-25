import { z } from 'zod';

import { HttpError, requestJson } from '@/lib/http/client';
import { pushSubscriptionSchema, vapidKeyResponseSchema, type PushSubscriptionData } from '@/lib/schemas/push';

const pushRemovedSchema = z.object({ removed: z.boolean() });

export const PUSH_WORKER_URL = '/labs-push-sw.js';
/** A path with no pages, so the notification worker never controls one. */
export const PUSH_WORKER_SCOPE = '/labs-push/';

export type PushSupport = 'supported' | 'unsupported' | 'insecure';

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    ? 'supported'
    : 'unsupported';
}

/** Sends JSON to a Labs API and validates the answer. */
export function sendJson<T>(
  url: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body: unknown,
  schema: z.ZodType<T>,
  headers: Record<string, string> = {},
): Promise<T> {
  return requestJson(url, schema, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(PUSH_WORKER_SCOPE);
  const current = existing ?? (await navigator.serviceWorker.register(PUSH_WORKER_URL, { scope: PUSH_WORKER_SCOPE }));
  // A worker that is still installing cannot subscribe yet.
  if (!current.active) {
    await new Promise<void>((resolve) => {
      const worker = current.installing ?? current.waiting;
      if (!worker) return resolve();
      worker.addEventListener('statechange', () => worker.state === 'activated' && resolve());
    });
  }
  return current;
}

const toData = (subscription: PushSubscription): PushSubscriptionData =>
  pushSubscriptionSchema.parse(subscription.toJSON());

/** This browser's existing subscription, without asking for permission. */
export async function currentSubscription(): Promise<PushSubscriptionData | null> {
  if (pushSupport() !== 'supported') return null;
  const existing = await navigator.serviceWorker.getRegistration(PUSH_WORKER_SCOPE);
  const subscription = await existing?.pushManager.getSubscription();
  return subscription ? toData(subscription) : null;
}

export class PushPermissionError extends Error {
  constructor(public readonly permission: NotificationPermission) {
    super(`Notification permission is ${permission}`);
    this.name = 'PushPermissionError';
  }
}

/** Asks for permission (after a click) and subscribes this browser. */
export async function subscribePush(): Promise<PushSubscriptionData> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushPermissionError(permission);
  const { publicKey } = await requestJson('/api/labs/push/key', vapidKeyResponseSchema);
  const worker = await registration();
  const existing = await worker.pushManager.getSubscription();
  if (existing) return toData(existing);
  const subscription = await worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
      c.charCodeAt(0),
    ),
  });
  return toData(subscription);
}

/** Removes this browser's subscription on the server and in the browser. */
export async function unsubscribePush(subscription: PushSubscriptionData): Promise<void> {
  await sendJson('/api/labs/push/subscription', 'DELETE', { subscription }, pushRemovedSchema);
  const existing = await navigator.serviceWorker.getRegistration(PUSH_WORKER_SCOPE);
  await (await existing?.pushManager.getSubscription())?.unsubscribe();
}

export type ErrorKind = 'invalid' | 'forbidden' | 'notFound' | 'conflict' | 'rateLimited' | 'unavailable' | 'network';

/** The kind of failure, for a message in the reader's language. */
export function errorKind(error: unknown): ErrorKind {
  if (error instanceof HttpError) {
    if (error.status === 400 || error.status === 413) return 'invalid';
    if (error.status === 401 || error.status === 403) return 'forbidden';
    if (error.status === 404) return 'notFound';
    if (error.status === 409) return 'conflict';
    if (error.status === 429) return 'rateLimited';
    return 'unavailable';
  }
  return 'network';
}

export const ERROR_MESSAGES: Record<ErrorKind, { ja: string; en: string }> = {
  invalid: { ja: '入力内容を確認してください。', en: 'Check what you entered.' },
  forbidden: { ja: '合言葉または権限を確認できませんでした。', en: 'The passphrase or access could not be confirmed.' },
  notFound: {
    ja: '見つかりません。期限が切れたか削除されました。',
    en: 'Not found. It may have expired or been deleted.',
  },
  conflict: { ja: '上限に達しています。', en: 'The limit has been reached.' },
  rateLimited: {
    ja: '操作が多すぎます。少し待ってからお試しください。',
    en: 'Too many attempts. Wait a moment and try again.',
  },
  unavailable: {
    ja: 'サーバーの機能が現在利用できません。時間をおいてお試しください。',
    en: 'The server feature is unavailable right now. Try again later.',
  },
  network: { ja: '通信できませんでした。電波の状況を確認してください。', en: 'Could not connect. Check your signal.' },
};
