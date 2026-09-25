import { createECDH, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBearAlerts } from '@/features/labs-notify/server/bear-alerts';
import { createCourseWatch } from '@/features/labs-notify/server/course-watch';
import { createEventResults } from '@/features/labs-notify/server/event-results';
import { createLabsNotifyHandlers } from '@/features/labs-notify/server/handlers';
import { createLocationRooms } from '@/features/labs-notify/server/location-room';
import { createPushService } from '@/features/labs-notify/server/push';
import { createReturnAlerts, RETURN_RUN_TIMING } from '@/features/labs-notify/server/return-alert';
import { createTrapHooks } from '@/features/labs-notify/server/trap-hooks';
import { BEAR_SOURCES } from '@/lib/bear-alerts';
import { WATCHED_PAGES } from '@/lib/course-watch';
import { SCRIPTS } from '@/lib/server/store';
import type { PushMessage, PushTarget } from '@/lib/server/web-push';

import { createFakeUpstash, installFakeUpstash } from './fake-upstash';

afterEach(() => {
  vi.unstubAllGlobals();
});

const SITE = 'https://about.nilay.jp';
const CRON_SECRET = 'cron-secret-for-unit-tests-0123';

// Real P-256 points: the server checks that a subscription's key is on the curve.
const userAgentKeys = new Map<number, string>();
const userAgentKey = (n: number) => {
  let key = userAgentKeys.get(n);
  if (!key) {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    key = ecdh.getPublicKey().toString('base64url');
    userAgentKeys.set(n, key);
  }
  return key;
};
const subscription = (n: number) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`,
  keys: { p256dh: userAgentKey(n), auth: `${String(n).padStart(22, 'a')}` },
});

function setup(options: { retry?: boolean; realTimeScale?: number; scheduledChecksPaused?: boolean } = {}) {
  const scheduledChecksPaused = options.scheduledChecksPaused ?? false;
  let clock = Date.parse('2026-11-15T08:00:00+09:00');
  // With a scale, the clock also runs with real time, that many times faster, so work done at the
  // same time takes the same time on it (for tests of what a run manages within its budget).
  const startedReal = Date.now();
  const now = () => clock + (options.realTimeScale ? (Date.now() - startedReal) * options.realTimeScale : 0);
  // The real adapter and the real @upstash/redis client, with only fetch answered in memory.
  const fake = createFakeUpstash(now);
  installFakeUpstash(fake);
  const adapter = fake.store({ retry: options.retry });
  const memory = { ...fake, store: adapter };
  const store = () => adapter;
  const sent: { endpoint: string; message: PushMessage; urgency: string }[] = [];
  /** The timeout each send was given, in the order the sends started. */
  const timeouts: (number | undefined)[] = [];
  const gone = new Set<string>();
  const failing = new Set<string>();
  /** Runs while a push is being sent, to interleave another request with it. */
  let duringSend: ((message: PushMessage, endpoint: string) => Promise<void>) | null = null;
  const send = vi.fn(
    async (target: PushTarget, message: PushMessage, options: { urgency: string; timeoutMs?: number }) => {
      timeouts.push(options.timeoutMs);
      if (gone.has(target.endpoint)) return 'gone' as const;
      if (failing.has(target.endpoint)) return 'failed' as const;
      if (duringSend) await duringSend(message, target.endpoint);
      sent.push({ endpoint: target.endpoint, message, urgency: options.urgency });
      return 'sent' as const;
    },
  );
  const push = createPushService({ store, send, now });
  const fetch = vi.fn<typeof globalThis.fetch>();
  const handlers = createLabsNotifyHandlers({
    siteUrl: () => SITE,
    vapidPublicKey: () => 'B'.padEnd(87, 'x'),
    cronSecret: () => CRON_SECRET,
    scheduledChecksPaused: () => scheduledChecksPaused,
    push,
    bear: createBearAlerts({ store, push, fetch, now }),
    course: createCourseWatch({ store, push, fetch, now }),
    returns: createReturnAlerts({ store, push, now }),
    rooms: createLocationRooms({ store, now }),
    hooks: createTrapHooks({ store, push, now }),
    results: createEventResults({ store, now }),
    route: {
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 1, resetIn: 0 }),
      createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    },
  });
  return {
    handlers,
    memory,
    sent,
    timeouts,
    gone,
    failing,
    fetch,
    fake,
    duringSend: (hook: ((message: PushMessage, endpoint: string) => Promise<void>) | null) => {
      duringSend = hook;
    },
    advance: (ms: number) => {
      clock += ms;
    },
    now,
  };
}

type Handler = (request: Request, context: never) => Promise<Response>;
const call = async (
  handler: unknown,
  method: string,
  body?: unknown,
  options: { headers?: Record<string, string>; params?: Record<string, string>; path?: string } = {},
) => {
  const request = new Request(`${SITE}${options.path ?? '/api/labs/test'}`, {
    method,
    headers: {
      origin: SITE,
      'content-type': 'application/json',
      'x-vercel-forwarded-for': '203.0.113.1',
      ...options.headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const response = await (handler as Handler)(request, { params: Promise.resolve(options.params ?? {}) } as never);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};
/** An ended plan keeps only a bare record of its ending: no note, no devices, nothing to send. */
async function expectOnlyEndings(t: {
  memory: { keys: () => string[]; store: { get: (key: string) => Promise<string | null> } };
}) {
  const plans = t.memory.keys().filter((key) => key.startsWith('labs:return:plan:'));
  for (const key of plans) {
    const plan = JSON.parse((await t.memory.store.get(key)) ?? '{}') as Record<string, unknown>;
    expect(plan).toMatchObject({ note: '', ownerSubscriptions: [], watcherSubscriptions: [], outbox: null });
    expect(plan.ending).toMatch(/^(returned|cancelled)$/);
  }
  expect(t.memory.keys().filter((key) => key.startsWith('labs:return:lock:'))).toEqual([]);
}

/** Each plan made by `createArmed` comes from its own address, as plans from many people would. */
let nextAddress = 0;
const anotherAddress = () => {
  nextAddress += 1;
  return `10.${(nextAddress >> 16) & 255}.${(nextAddress >> 8) & 255}.${nextAddress & 255}`;
};

/** Creates a plan and arms it, as the page does once it has saved the keys. */
async function createArmed(t: { handlers: { createReturnPlan: unknown; returnPlanAction: unknown } }, body: unknown) {
  const created = await call(t.handlers.createReturnPlan, 'POST', body, {
    headers: { 'x-vercel-forwarded-for': anotherAddress() },
  });
  if (created.status === 201) {
    const { planId, ownerToken } = created.body as Record<string, string>;
    await call(t.handlers.returnPlanAction, 'POST', { planId, token: ownerToken }, { params: { action: 'arm' } });
  }
  return created;
}

const cronCall = (handler: unknown, secret = CRON_SECRET) =>
  call(handler, 'GET', undefined, { headers: { authorization: `Bearer ${secret}` } });

describe('push subscriptions', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('serves the public key', async () => {
    expect(await call(t.handlers.vapidKey, 'GET')).toMatchObject({
      status: 200,
      body: { publicKey: expect.any(String) },
    });
  });

  it('stores only the endpoint, keys and language, for 90 days', async () => {
    const response = await call(t.handlers.saveSubscription, 'POST', { subscription: subscription(1), language: 'ja' });
    expect(response.status).toBe(200);
    const [key] = t.memory.keys().filter((item) => item.startsWith('labs:push:sub:'));
    expect(key).toMatch(/^labs:push:sub:/);
    expect(JSON.parse((await t.memory.store.get(key ?? '')) ?? '')).toEqual({ ...subscription(1), language: 'ja' });
    expect(t.memory.ttlOf(key ?? '')).toBe(90 * 24 * 3600);
  });

  it('refuses another site, a foreign push service and malformed input', async () => {
    const body = { subscription: subscription(1), language: 'ja' };
    expect(
      (await call(t.handlers.saveSubscription, 'POST', body, { headers: { origin: 'https://evil.test' } })).status,
    ).toBe(403);
    const foreign = { ...body, subscription: { ...subscription(1), endpoint: 'https://10.0.0.1/push' } };
    expect((await call(t.handlers.saveSubscription, 'POST', foreign)).status).toBe(400);
    expect((await call(t.handlers.saveSubscription, 'POST', { ...body, language: 'fr' })).status).toBe(400);
    expect((await call(t.handlers.saveSubscription, 'POST', '{')).status).toBe(400);
    expect(t.memory.keys()).toEqual([]);
  });

  it('does not let another caller replace the keys of a stored subscription', async () => {
    await call(t.handlers.saveSubscription, 'POST', { subscription: subscription(1), language: 'ja' });
    const forged = { ...subscription(1), keys: { ...subscription(1).keys, auth: 'b'.repeat(22) } };
    expect((await call(t.handlers.saveSubscription, 'POST', { subscription: forged, language: 'en' })).status).toBe(
      403,
    );
    expect(
      (await call(t.handlers.saveSubscription, 'POST', { subscription: subscription(1), language: 'en' })).status,
    ).toBe(200);
  });

  it('deletes a subscription and its places only with its secret', async () => {
    await call(t.handlers.bearWatch, 'PUT', {
      subscription: subscription(1),
      language: 'ja',
      places: [{ latitude: 39.7, longitude: 140.1, radiusKm: 5 }],
    });
    const wrong = { subscription: { ...subscription(1), keys: { ...subscription(1).keys, auth: 'b'.repeat(22) } } };
    expect(await call(t.handlers.deleteSubscription, 'DELETE', wrong)).toMatchObject({ body: { removed: false } });
    expect(t.memory.keys().length).toBeGreaterThan(0);
    expect(await call(t.handlers.deleteSubscription, 'DELETE', { subscription: subscription(1) })).toMatchObject({
      body: { removed: true },
    });
    // Only the daily registration counter, which expires on its own, is left.
    expect(t.memory.keys().filter((key) => !key.startsWith('labs:limit:'))).toEqual([]);
  });

  it('sends a test notification to a registered device only', async () => {
    expect((await call(t.handlers.testPush, 'POST', { subscription: subscription(1) })).status).toBe(404);
    await call(t.handlers.saveSubscription, 'POST', { subscription: subscription(1), language: 'en' });
    expect(await call(t.handlers.testPush, 'POST', { subscription: subscription(1) })).toMatchObject({
      body: { sent: 1 },
    });
    expect(t.sent[0]?.message.title).toBe('Test notification');
  });
});

describe('scheduled jobs', () => {
  it('refuse calls without the cron secret', async () => {
    const t = setup();
    for (const handler of [t.handlers.cronBearAlerts, t.handlers.cronCourseWatch, t.handlers.cronReturnAlerts]) {
      expect((await cronCall(handler, 'wrong-secret-wrong-secret')).status).toBe(401);
      expect((await call(handler, 'GET')).status).toBe(401);
    }
    expect(t.fetch).not.toHaveBeenCalled();
  });
});

const AKITA_HEADER =
  '出没情報ID,情報種別,市町村,地番情報,目撃日時,獣種,性別,単独か親子,頭数,目撃時の状況,x(緯度),y(経度)';
const akitaFile = (...rows: string[]) => [AKITA_HEADER, ...rows].join('\n');
const akitaRow = (id: number, date: string, latitude: number, longitude: number) =>
  `${id},目撃,秋田市,住所,${date},ツキノワグマ,不明,単独,1,状況,${latitude},${longitude}`;

describe('while the scheduled checks are paused', () => {
  it('refuses every registration a scheduled check would act on', async () => {
    const { handlers } = setup({ scheduledChecksPaused: true });
    const refusals = [
      await call(handlers.bearWatch, 'PUT', {}),
      await call(handlers.courseWatch, 'PUT', {}),
      await call(handlers.createReturnPlan, 'POST', {}),
      ...(await Promise.all(
        ['watch', 'arm', 'update'].map((action) => call(handlers.returnPlanAction, 'POST', {}, { params: { action } })),
      )),
    ];
    for (const refusal of refusals) {
      expect(refusal.status).toBe(503);
      expect(JSON.stringify(refusal.body)).toContain('定期確認を一時停止');
    }
  });
});

describe('bear alerts', () => {
  it('records the data on the first run and notifies nearby watchers of new rows only', async () => {
    const t = setup();
    await call(t.handlers.bearWatch, 'PUT', {
      subscription: subscription(1),
      language: 'ja',
      places: [{ latitude: 39.72, longitude: 140.1, radiusKm: 5 }],
    });
    await call(t.handlers.bearWatch, 'PUT', {
      subscription: subscription(2),
      language: 'en',
      places: [{ latitude: 40.2, longitude: 140.8, radiusKm: 1 }],
    });

    t.fetch.mockResolvedValueOnce(
      new Response(akitaFile(akitaRow(1, '2026/11/10 07:00', 39.721, 140.101)), {
        headers: { etag: '"v1"', 'content-type': 'text/csv' },
      }),
    );
    expect(await cronCall(t.handlers.cronBearAlerts)).toMatchObject({ body: { result: { akita: 'baseline' } } });
    expect(t.sent).toHaveLength(0);
    expect(t.fetch.mock.calls[0]?.[0]).toBe(BEAR_SOURCES[0]?.dataUrl);

    t.fetch.mockResolvedValueOnce(new Response(null, { status: 304 }));
    expect(await cronCall(t.handlers.cronBearAlerts)).toMatchObject({ body: { result: { akita: 'unchanged' } } });
    expect((t.fetch.mock.calls[1]?.[1]?.headers as Record<string, string>)['If-None-Match']).toBe('"v1"');

    t.fetch.mockResolvedValueOnce(
      new Response(
        akitaFile(
          akitaRow(1, '2026/11/10 07:00', 39.721, 140.101),
          akitaRow(2, '2026/11/14 16:30', 39.73, 140.12),
          akitaRow(3, '2026/11/14 17:00', 39.9, 140.5),
        ),
        { headers: { 'content-type': 'text/csv' } },
      ),
    );
    expect(await cronCall(t.handlers.cronBearAlerts)).toMatchObject({
      body: { result: { akita: { fresh: 2, notified: 1, complete: true } } },
    });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]?.endpoint).toBe(subscription(1).endpoint);
    expect(t.sent[0]?.message.title).toBe('クマの出没情報 1 件（秋田県）');
    expect(t.sent[0]?.message.body).toContain('約 2.0 km（11/14 16:30）');
    expect(t.sent[0]?.message.body).toContain('出典：秋田県のオープンデータ');
  });

  it('keeps the previous state when the file cannot be read', async () => {
    const t = setup();
    t.fetch.mockResolvedValueOnce(new Response('changed,header\n1,2', { headers: { 'content-type': 'text/csv' } }));
    expect((await cronCall(t.handlers.cronBearAlerts)).status).toBe(500);
    expect(t.memory.keys()).toEqual([]);
  });
});

describe('course page watch', () => {
  const page = (text: string) => `<div id="main"><p>${text}</p></div><div id="tmp_contents"><p>${text}</p></div>`;

  it('notifies the watchers of a page when its content changes', async () => {
    const t = setup();
    const [first] = WATCHED_PAGES;
    await call(t.handlers.courseWatch, 'PUT', { subscription: subscription(1), language: 'ja', pages: [first?.id] });
    t.fetch.mockImplementation(async () => new Response(page('9月12日'), { headers: { 'content-type': 'text/html' } }));
    expect(await cronCall(t.handlers.cronCourseWatch)).toMatchObject({
      body: { result: { ...Object.fromEntries(WATCHED_PAGES.map((item) => [item.id, 'baseline'])), complete: true } },
    });
    expect(await cronCall(t.handlers.cronCourseWatch)).toMatchObject({
      body: { result: { ...Object.fromEntries(WATCHED_PAGES.map((item) => [item.id, 'unchanged'])), complete: true } },
    });
    t.fetch.mockImplementation(async () => new Response(page('10月3日'), { headers: { 'content-type': 'text/html' } }));
    await cronCall(t.handlers.cronCourseWatch);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]?.message.url).toBe(`/labs/course-watch#${first?.id}`);
    expect(JSON.stringify(await t.memory.store.get(`labs:course:page:${first?.id}`))).not.toContain('10月3日');
    const pages = await call(t.handlers.coursePages, 'GET');
    expect(pages.body.pages).toEqual(WATCHED_PAGES.map((item) => ({ id: item.id, changedAt: expect.any(String) })));
  });

  it('reports a page without its content element as an error, not a change', async () => {
    const t = setup();
    t.fetch.mockImplementation(async () => new Response('<p>moved</p>', { headers: { 'content-type': 'text/html' } }));
    const result = await cronCall(t.handlers.cronCourseWatch);
    expect(result.body.result).toEqual({
      ...Object.fromEntries(WATCHED_PAGES.map((item) => [item.id, 'error'])),
      complete: true,
    });
  });
});

describe('return alerts', () => {
  const create = (t: ReturnType<typeof setup>, fields: Record<string, unknown> = {}) =>
    createArmed(t, {
      subscription: subscription(1),
      language: 'ja',
      returnAt: '2026-11-15T17:00:00+09:00',
      graceMinutes: 30,
      note: '黒森山 北尾根',
      ...fields,
    });

  it('reminds the owner, then alerts owner and watchers until the return button', async () => {
    const t = setup();
    const created = await create(t);
    expect(created.status).toBe(201);
    const { planId, ownerToken, watchToken } = created.body as Record<string, string>;
    const watched = await call(
      t.handlers.returnPlanAction,
      'POST',
      { planId, token: watchToken, subscription: subscription(2), language: 'en' },
      { params: { action: 'watch' } },
    );
    expect(watched.body.plan).toMatchObject({ note: '黒森山 北尾根', watchers: 1, status: 'before' });

    // 08:00 → 17:01: the owner alone is reminded.
    t.advance(9 * 3600_000 + 60_000);
    expect(await cronCall(t.handlers.cronReturnAlerts)).toMatchObject({
      body: { result: { reminded: 1, alerted: 0 } },
    });
    expect(t.sent.map((item) => item.endpoint)).toEqual([subscription(1).endpoint]);

    // 17:31: everyone.
    t.advance(30 * 60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    expect(t.sent.slice(1).map((item) => [item.endpoint, item.message.title, item.urgency])).toEqual([
      [subscription(1).endpoint, '帰着の連絡がありません', 'high'],
      [subscription(2).endpoint, 'No word of return', 'high'],
    ]);
    expect(t.sent[2]?.message.body).toContain('黒森山 北尾根');

    // A duplicate run in the same minute sends nothing more.
    await cronCall(t.handlers.cronReturnAlerts);
    expect(t.sent).toHaveLength(3);

    const back = await call(
      t.handlers.returnPlanAction,
      'POST',
      { planId, token: ownerToken },
      { params: { action: 'return' } },
    );
    expect(back.status).toBe(200);
    expect(t.sent[3]).toMatchObject({ endpoint: subscription(2).endpoint, message: { title: 'Back safely' } });
    await expectOnlyEndings(t);
    t.advance(3600_000);
    await cronCall(t.handlers.cronReturnAlerts);
    expect(t.sent).toHaveLength(4);
  });

  it('lets only the owner move or end the plan', async () => {
    const t = setup();
    const { planId, watchToken = '' } = (await create(t)).body as Record<string, string>;
    const status = (action: string, token: string, extra = {}) =>
      call(t.handlers.returnPlanAction, 'POST', { planId, token, ...extra }, { params: { action } }).then(
        (r) => r.status,
      );
    expect(await status('return', watchToken)).toBe(403);
    expect(await status('update', watchToken, { returnAt: '2026-11-15T18:00:00+09:00' })).toBe(403);
    expect(await status('status', watchToken)).toBe(200);
    expect(await status('status', 'x'.repeat(43))).toBe(403);
    expect(await status('unknown', watchToken)).toBe(404);
  });

  it('refuses a return time in the past or more than a week ahead, and deletes plans on its own', async () => {
    const t = setup();
    expect((await create(t, { returnAt: '2026-11-15T07:00:00+09:00' })).status).toBe(400);
    expect((await create(t, { returnAt: '2026-11-23T08:00:00+09:00' })).status).toBe(400);
    expect((await create(t, { graceMinutes: 45 })).status).toBe(400);
    expect((await create(t, { note: 'x'.repeat(201) })).status).toBe(400);
    const { planId } = (await create(t)).body as Record<string, string>;
    // Return at 17:00, three alerts to 19:30, then a day.
    expect(t.memory.ttlOf(`labs:return:plan:${planId}`)).toBe((9 + 3.5 + 24) * 3600);
  });
});

describe('location rooms', () => {
  it('shares only the latest position among members and deletes everything when closed', async () => {
    const t = setup();
    const host = (await call(t.handlers.createRoom, 'POST', { passphrase: 'yamagami', name: '勢子 A', hours: 4 })).body;
    const roomId = host.roomId as string;
    const params = { roomId };
    const wrong = await call(t.handlers.joinRoom, 'POST', { passphrase: 'yamagamx', name: 'B' }, { params });
    expect(wrong.status).toBe(403);
    const member = (await call(t.handlers.joinRoom, 'POST', { passphrase: 'yamagami', name: '射手 B' }, { params }))
      .body;
    expect(member).toMatchObject({ host: false, roomId });

    const auth = (token: unknown) => ({ params, headers: { authorization: `Bearer ${String(token)}` } });
    await call(
      t.handlers.reportPosition,
      'PUT',
      { latitude: 39.1, longitude: 140.1, accuracy: 12 },
      auth(member.memberToken),
    );
    t.advance(5000);
    await call(
      t.handlers.reportPosition,
      'PUT',
      { latitude: 39.2, longitude: 140.2, accuracy: 8 },
      auth(member.memberToken),
    );
    const view = await call(t.handlers.viewRoom, 'GET', undefined, auth(host.memberToken));
    expect(view.body.members).toEqual([
      { memberId: host.memberId, name: '勢子 A', position: null },
      {
        memberId: member.memberId,
        name: '射手 B',
        position: { latitude: 39.2, longitude: 140.2, accuracy: 8, at: t.now() },
      },
    ]);
    expect((await call(t.handlers.viewRoom, 'GET', undefined, auth('x'.repeat(43)))).status).toBe(401);
    expect(t.memory.ttlOf(`labs:room:${roomId}:positions`)).toBe(4 * 3600 - 5);

    expect((await call(t.handlers.closeRoom, 'DELETE', undefined, auth(member.memberToken))).status).toBe(403);
    expect((await call(t.handlers.closeRoom, 'DELETE', undefined, auth(host.memberToken))).status).toBe(200);
    // Only the rate-limit counters, which expire on their own, are left.
    expect(t.memory.keys().filter((key) => !key.startsWith('labs:limit:'))).toEqual([]);
  });

  it('removes a leaving member at once and expires the room', async () => {
    const t = setup();
    const host = (await call(t.handlers.createRoom, 'POST', { passphrase: 'yamagami', name: 'A', hours: 2 })).body;
    const params = { roomId: host.roomId as string };
    const auth = { params, headers: { authorization: `Bearer ${String(host.memberToken)}` } };
    await call(t.handlers.reportPosition, 'PUT', { latitude: 39.1, longitude: 140.1, accuracy: 12 }, auth);
    await call(t.handlers.leaveRoom, 'POST', undefined, auth);
    expect(await t.memory.store.hGetAll(`labs:room:${host.roomId}:positions`)).toEqual({});
    t.advance(2 * 3600_000);
    expect(t.memory.keys().filter((key) => key.startsWith('labs:room:'))).toEqual([]);
  });

  it('limits passphrase guesses per address, and in all per room', async () => {
    const t = setup();
    const host = (await call(t.handlers.createRoom, 'POST', { passphrase: 'yamagami', name: 'A', hours: 2 })).body;
    const params = { roomId: host.roomId as string };
    const statuses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push(
        (await call(t.handlers.joinRoom, 'POST', { passphrase: `guess-${attempt}`, name: 'X' }, { params })).status,
      );
    }
    expect(statuses).toEqual([403, 403, 403, 403, 403, 429]);
    // Another address is not locked out by the first one's guesses.
    const other = { params, headers: { 'x-vercel-forwarded-for': '198.51.100.7' } };
    expect((await call(t.handlers.joinRoom, 'POST', { passphrase: 'yamagami', name: 'Y' }, other)).status).toBe(200);
  });
});

describe('trap hooks', () => {
  it('turns a POST to the secret URL into a push to every registered device', async () => {
    const t = setup();
    const created = await call(t.handlers.createHook, 'POST', {
      subscription: subscription(1),
      language: 'ja',
      label: '沢の箱わな',
    });
    const { triggerToken: token, hookId, manageToken } = created.body as Record<string, string>;
    await call(t.handlers.addHookDevice, 'POST', {
      hookId,
      manageToken,
      subscription: subscription(2),
      language: 'en',
    });

    // Called by a device: no Origin header.
    const receive = (body: string, type = 'application/json') =>
      call(t.handlers.receiveHook, 'POST', body, {
        params: { token: token ?? '' },
        headers: { origin: '', 'content-type': type },
      });
    expect(await receive('{"message":"扉が閉じました"}')).toMatchObject({
      status: 202,
      body: { delivered: 2, devices: 2 },
    });
    expect(t.sent.map((item) => [item.message.title, item.message.body])).toEqual([
      ['【沢の箱わな】通知を受信しました', '扉が閉じました'],
      ['[沢の箱わな] Alert received', '扉が閉じました'],
    ]);
    expect(t.memory.keys().some((key) => key.includes(token ?? '') || key.includes(manageToken ?? ''))).toBe(false);

    t.gone.add(subscription(2).endpoint);
    expect(await receive('', 'text/plain')).toMatchObject({ body: { delivered: 1, devices: 1 } });
    expect(t.sent[2]?.message.body).toBe('機器から通知がありました。現地を確認してください。');
  });

  it('limits calls per hook and forgets a deleted hook', async () => {
    const t = setup();
    const {
      triggerToken: token,
      hookId,
      manageToken,
    } = (await call(t.handlers.createHook, 'POST', { subscription: subscription(1), language: 'ja', label: '柵' }))
      .body as Record<string, string>;
    const receive = () =>
      call(t.handlers.receiveHook, 'POST', '{}', { params: { token: token ?? '' } }).then((r) => r.status);
    const statuses = [];
    for (let i = 0; i < 7; i += 1) statuses.push(await receive());
    expect(statuses).toEqual([202, 202, 202, 202, 202, 202, 429]);
    expect((await call(t.handlers.deleteHook, 'DELETE', { hookId, manageToken })).status).toBe(200);
    t.advance(60_000);
    expect(await receive()).toBe(404);
    expect((await call(t.handlers.receiveHook, 'POST', '{}', { params: { token: 'short' } })).status).toBe(400);
  });
});

describe('event results', () => {
  const content = { title: '秋季クレー大会', note: '', columns: ['順位', '氏名', '点数'], rows: [['1', '山田', '25']] };

  it('publishes a page, edits it with the passphrase and removes it', async () => {
    const t = setup();
    const created = await call(t.handlers.createResults, 'POST', { passphrase: 'club-2026', days: 7, content });
    expect(created.status).toBe(201);
    const params = { id: created.body.id as string };
    expect((await call(t.handlers.getResults, 'GET', undefined, { params })).body).toMatchObject({
      title: '秋季クレー大会',
    });
    const edited = { ...content, rows: [['1', '山田', '24']] };
    expect(
      (await call(t.handlers.updateResults, 'PUT', { passphrase: 'wrong-pass', content: edited }, { params })).status,
    ).toBe(403);
    expect(
      (await call(t.handlers.updateResults, 'PUT', { passphrase: 'club-2026', content: edited }, { params })).body,
    ).toMatchObject({
      rows: [['1', '山田', '24']],
    });
    expect((await call(t.handlers.deleteResults, 'DELETE', { passphrase: 'club-2026' }, { params })).status).toBe(200);
    expect((await call(t.handlers.getResults, 'GET', undefined, { params })).status).toBe(404);
  });

  it('refuses ragged tables and expires pages on their own', async () => {
    const t = setup();
    const ragged = { ...content, rows: [['1', '山田']] };
    expect(
      (await call(t.handlers.createResults, 'POST', { passphrase: 'club-2026', days: 7, content: ragged })).status,
    ).toBe(400);
    expect((await call(t.handlers.createResults, 'POST', { passphrase: 'short', days: 7, content })).status).toBe(400);
    expect((await call(t.handlers.createResults, 'POST', { passphrase: 'club-2026', days: 365, content })).status).toBe(
      400,
    );
    const { id } = (await call(t.handlers.createResults, 'POST', { passphrase: 'club-2026', days: 7, content })).body;
    t.advance(7 * 24 * 3600_000);
    expect((await call(t.handlers.getResults, 'GET', undefined, { params: { id: id as string } })).status).toBe(404);
    expect(t.memory.keys().filter((key) => key.startsWith(`labs:results:${String(id)}`))).toEqual([]);
  });
});

describe('review fixes', () => {
  it('refuses a key that is not a point on the curve (M1)', async () => {
    const t = setup();
    const offCurve = { ...subscription(1), keys: { ...subscription(1).keys, p256dh: `B${'A'.repeat(86)}` } };
    expect((await call(t.handlers.saveSubscription, 'POST', { subscription: offCurve, language: 'ja' })).status).toBe(
      400,
    );
  });

  it('keeps the return job going past a broken plan, and sends nothing for a plan ended meanwhile (M1, M2)', async () => {
    const t = setup();
    const make = (n: number) =>
      createArmed(t, {
        subscription: subscription(n),
        language: 'ja',
        returnAt: '2026-11-15T17:00:00+09:00',
        graceMinutes: 0,
        note: '',
      }).then((r) => r.body as Record<string, string>);
    const first = await make(1);
    const second = await make(2);
    const third = await make(3);
    // The first plan is unreadable; the second is returned just before the job swaps its state.
    await t.memory.store.set(`labs:return:plan:${first.planId}`, '{broken', { ttlSeconds: 3600 });
    const writeScheduled = t.memory.store.writeScheduled;
    t.memory.store.writeScheduled = async (key, expected, next, ttl, entries) => {
      if (key.endsWith(second.planId ?? '')) await t.memory.store.del(key);
      return writeScheduled(key, expected, next, ttl, entries);
    };
    t.advance(9 * 3600_000 + 60_000);
    expect((await cronCall(t.handlers.cronReturnAlerts)).status).toBe(200);
    // Only the third plan, untouched, is alerted.
    expect(t.sent.map((item) => item.endpoint)).toEqual([subscription(3).endpoint]);
    expect(third.planId).toBeDefined();
  });

  it('sends an overdue alert once when the job runs again (M2)', async () => {
    const t = setup();
    await createArmed(t, {
      subscription: subscription(1),
      language: 'ja',
      returnAt: '2026-11-15T17:00:00+09:00',
      graceMinutes: 0,
      note: '',
    });
    t.advance(9 * 3600_000 + 60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    await cronCall(t.handlers.cronReturnAlerts);
    expect(t.sent).toHaveLength(1);
  });

  it('does not let the trigger URL manage the hook (M3)', async () => {
    const t = setup();
    const created = (
      await call(t.handlers.createHook, 'POST', { subscription: subscription(1), language: 'ja', label: '柵' })
    ).body as Record<string, string>;
    const asManager = { hookId: created.hookId, manageToken: created.triggerToken };
    expect((await call(t.handlers.deleteHook, 'DELETE', asManager)).status).toBe(403);
    expect(
      (await call(t.handlers.addHookDevice, 'POST', { ...asManager, subscription: subscription(9), language: 'ja' }))
        .status,
    ).toBe(403);
    // Knowing the hook id is not enough to trigger it either.
    expect((await call(t.handlers.receiveHook, 'POST', '{}', { params: { token: created.hookId ?? '' } })).status).toBe(
      404,
    );
  });

  it('bounds what anonymous callers can store (M4)', async () => {
    const t = setup();
    for (let i = 0; i < 200; i += 1) await t.memory.store.zAdd('labs:rooms:active', t.now() + 3600_000, `room-${i}`);
    expect((await call(t.handlers.createRoom, 'POST', { passphrase: 'yamagami', name: 'A', hours: 2 })).status).toBe(
      503,
    );
    const wide = {
      title: 'x',
      note: '',
      columns: Array.from({ length: 10 }, () => 'h'.repeat(40)),
      rows: Array.from({ length: 150 }, () => Array.from({ length: 10 }, () => 'あ'.repeat(40))),
    };
    expect(
      (await call(t.handlers.createResults, 'POST', { passphrase: 'club-2026', days: 7, content: wide })).status,
    ).toBe(413);
  });

  it('limits polling per member, so a party behind one address is not refused (M4)', async () => {
    const t = setup();
    const host = (await call(t.handlers.createRoom, 'POST', { passphrase: 'yamagami', name: 'A', hours: 2 })).body;
    const params = { roomId: host.roomId as string };
    const guest = (await call(t.handlers.joinRoom, 'POST', { passphrase: 'yamagami', name: 'B' }, { params })).body;
    const poll = (token: unknown) =>
      call(t.handlers.viewRoom, 'GET', undefined, { params, headers: { authorization: `Bearer ${String(token)}` } });
    for (let i = 0; i < 30; i += 1) expect((await poll(host.memberToken)).status).toBe(200);
    expect((await poll(host.memberToken)).status).toBe(429);
    expect((await poll(guest.memberToken)).status).toBe(200);
  });

  it(
    'reads watchers a page at a time, skips expired ones and never sends twice (M5)',
    { timeout: 30_000 },
    async () => {
      const t = setup();
      for (let n = 1; n <= 450; n += 1) {
        await call(t.handlers.bearWatch, 'PUT', {
          subscription: subscription(n),
          language: 'ja',
          places: [{ latitude: 39.72, longitude: 140.1, radiusKm: 5 }],
        });
      }
      const csv = (...rows: string[]) => new Response(akitaFile(...rows), { headers: { 'content-type': 'text/csv' } });
      const old = akitaRow(1, '2026/11/10 07:00', 39.721, 140.101);
      const fresh = akitaRow(2, '2026/11/14 16:30', 39.73, 140.12);
      t.fetch.mockResolvedValueOnce(csv(old));
      await cronCall(t.handlers.cronBearAlerts);
      t.fetch.mockResolvedValueOnce(csv(old, fresh));
      await cronCall(t.handlers.cronBearAlerts);
      expect(new Set(t.sent.map((item) => item.endpoint)).size).toBe(450);
      expect(t.sent).toHaveLength(450);

      // The same batch again, as after a run cut short, sends nothing more.
      await t.memory.store.set('labs:bear:source:akita', JSON.stringify({ recentIds: ['1'] }), { ttlSeconds: 3600 });
      t.fetch.mockResolvedValueOnce(csv(old, fresh));
      await cronCall(t.handlers.cronBearAlerts);
      expect(t.sent).toHaveLength(450);

      // Records past their expiry leave the index before it is read.
      t.advance(91 * 24 * 3600_000);
      t.fetch.mockResolvedValueOnce(csv(akitaRow(3, '2027/2/13 16:30', 39.73, 140.12)));
      await cronCall(t.handlers.cronBearAlerts);
      expect(await t.memory.store.zRangeWithScores('labs:bear:watchers', '-inf', '+inf', 10)).toEqual([]);
    },
  );

  it('fails closed when the store cannot count passphrase tries (m7)', async () => {
    const t = setup();
    const host = (await call(t.handlers.createRoom, 'POST', { passphrase: 'yamagami', name: 'A', hours: 2 })).body;
    t.memory.fail(true);
    const params = { roomId: host.roomId as string };
    expect((await call(t.handlers.joinRoom, 'POST', { passphrase: 'yamagami', name: 'B' }, { params })).status).toBe(
      500,
    );
    t.memory.fail(false);
  });

  it('renews the devices of a hook in use, so they expire together (m8)', async () => {
    const t = setup();
    const created = (
      await call(t.handlers.createHook, 'POST', { subscription: subscription(1), language: 'ja', label: '柵' })
    ).body as Record<string, string>;
    const params = { token: created.triggerToken ?? '' };
    t.advance(80 * 24 * 3600_000);
    await call(t.handlers.receiveHook, 'POST', '{}', { params });
    t.advance(20 * 24 * 3600_000);
    expect(await call(t.handlers.receiveHook, 'POST', '{}', { params })).toMatchObject({
      body: { delivered: 1, devices: 1 },
    });
  });

  it('never lets a room grow past its limit (m9)', { timeout: 30_000 }, async () => {
    const t = setup();
    const host = (await call(t.handlers.createRoom, 'POST', { passphrase: 'yamagami', name: 'A', hours: 2 })).body;
    const params = { roomId: host.roomId as string };
    const statuses = [];
    for (let i = 0; i < 30; i += 1) {
      const headers = { 'x-vercel-forwarded-for': `198.51.100.${i}` };
      const joined = await call(
        t.handlers.joinRoom,
        'POST',
        { passphrase: 'yamagami', name: `M${i}` },
        { params, headers },
      );
      statuses.push(joined.status);
    }
    expect(statuses.filter((status) => status === 200)).toHaveLength(29);
    expect(statuses.at(-1)).toBe(409);
    expect(Object.keys(await t.memory.store.hGetAll(`labs:room:${String(host.roomId)}:members`))).toHaveLength(30);
  });
});

describe('second review fixes', () => {
  const plan = async (t: ReturnType<typeof setup>, owner: number, watcher?: number) => {
    const created = (
      await createArmed(t, {
        subscription: subscription(owner),
        language: 'ja',
        returnAt: '2026-11-15T17:00:00+09:00',
        graceMinutes: 0,
        note: '北尾根',
      })
    ).body as Record<string, string>;
    if (watcher !== undefined) {
      await call(
        t.handlers.returnPlanAction,
        'POST',
        { planId: created.planId, token: created.watchToken, subscription: subscription(watcher), language: 'ja' },
        { params: { action: 'watch' } },
      );
    }
    return created;
  };
  const finish = (t: ReturnType<typeof setup>, created: Record<string, string>) =>
    call(
      t.handlers.returnPlanAction,
      'POST',
      { planId: created.planId, token: created.ownerToken },
      { params: { action: 'return' } },
    );

  it('reads due plans with a valid bound and alerts them (M1)', async () => {
    const t = setup();
    await plan(t, 1);
    t.advance(9 * 3600_000 + 60_000);
    expect(await cronCall(t.handlers.cronReturnAlerts)).toMatchObject({
      status: 200,
      body: { result: { alerted: 1 } },
    });
    const zrange = t.fake.commands.find((command) => command[0] === 'zrange');
    expect(zrange?.[2]).toBe('-inf');
  });

  it('sends the return after an overdue alert the job had already committed, never before it (M2)', async () => {
    const t = setup();
    const created = await plan(t, 1, 2);
    let finishing: Promise<{ status: number }> | null = null;
    let committed = false;
    t.fake.beforeCommand(async (command) => {
      // Right after the job commits the overdue alert to the plan, the owner presses the return.
      if (!committed) {
        committed =
          command[0] === 'eval' && command[1] === SCRIPTS.writeScheduled && String(command[8]).includes('"overdue"');
        return false;
      }
      finishing = finish(t, created);
      return true;
    });
    t.advance(9 * 3600_000 + 60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    expect((await (finishing as unknown as Promise<{ status: number }>)).status).toBe(200);
    const titles = t.sent.map((item) => item.message.title);
    expect(titles.at(-1)).toBe('帰着しました');
    expect(titles.lastIndexOf('帰着の連絡がありません')).toBeLessThan(titles.indexOf('帰着しました'));
    await expectOnlyEndings(t);
  });

  it('delivers the return after an overdue alert already on its way, under the same tag (M2)', async () => {
    const t = setup();
    const created = await plan(t, 1, 2);
    // The owner presses the return while the overdue alert is going out (concurrently, not nested).
    let finishing: Promise<{ status: number }> | null = null;
    t.duringSend(async (message) => {
      if (!finishing && message.title === '帰着の連絡がありません') finishing = finish(t, created);
    });
    t.advance(9 * 3600_000 + 60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    const finishStatuses = [(await (finishing as unknown as Promise<{ status: number }>)).status];
    const titles = t.sent.map((item) => [item.message.title, item.message.tag]);
    expect(titles.at(-1)).toEqual(['帰着しました', 'return-status']);
    expect(
      titles.filter(([title]) => title === '帰着の連絡がありません').every(([, tag]) => tag === 'return-status'),
    ).toBe(true);
    // The plan is gone and no later check alerts again.
    t.advance(3600_000);
    await cronCall(t.handlers.cronReturnAlerts);
    expect(t.sent.at(-1)?.message.title).toBe('帰着しました');
    expect(finishStatuses).toEqual([200]);
  });

  it('pages by cursor, so devices removed during the run do not hide the rest (M4)', { timeout: 30_000 }, async () => {
    const t = setup();
    for (let n = 1; n <= 250; n += 1) {
      await call(t.handlers.bearWatch, 'PUT', {
        subscription: subscription(n),
        language: 'ja',
        places: [{ latitude: 39.72, longitude: 140.1, radiusKm: 5 }],
      });
      // The first 120 are gone at the push service, so they are removed while the job runs.
      if (n <= 120) t.gone.add(subscription(n).endpoint);
    }
    const csv = (...rows: string[]) => new Response(akitaFile(...rows), { headers: { 'content-type': 'text/csv' } });
    const old = akitaRow(1, '2026/11/10 07:00', 39.721, 140.101);
    t.fetch.mockResolvedValueOnce(csv(old));
    await cronCall(t.handlers.cronBearAlerts);
    t.fetch.mockResolvedValueOnce(csv(old, akitaRow(2, '2026/11/14 16:30', 39.73, 140.12)));
    expect(await cronCall(t.handlers.cronBearAlerts)).toMatchObject({
      body: { result: { akita: { fresh: 1, notified: 130, complete: true } } },
    });
    expect(new Set(t.sent.map((item) => item.endpoint)).size).toBe(130);
  });

  it('caps stored subscriptions and watchers in all (M5)', async () => {
    const t = setup();
    t.fake.seedSortedSet('labs:push:subs', 50_000, t.now() + 3600_000);
    expect(
      (await call(t.handlers.saveSubscription, 'POST', { subscription: subscription(1), language: 'ja' })).status,
    ).toBe(503);
    const u = setup();
    u.fake.seedSortedSet('labs:bear:watchers', 20_000, u.now() + 3600_000);
    const watch = await call(u.handlers.bearWatch, 'PUT', {
      subscription: subscription(1),
      language: 'ja',
      places: [{ latitude: 39.72, longitude: 140.1, radiusKm: 5 }],
    });
    expect(watch.status).toBe(503);
  });

  it('keeps a hook deleted during a call deleted (M6)', async () => {
    const t = setup();
    const created = (
      await call(t.handlers.createHook, 'POST', { subscription: subscription(1), language: 'ja', label: '柵' })
    ).body as Record<string, string>;
    t.duringSend(async () => {
      await call(t.handlers.deleteHook, 'DELETE', { hookId: created.hookId, manageToken: created.manageToken });
    });
    const received = await call(t.handlers.receiveHook, 'POST', '{}', {
      params: { token: created.triggerToken ?? '' },
    });
    expect(received).toMatchObject({ status: 202, body: { delivered: 1, devices: 0 } });
    expect(t.memory.keys().some((key) => key.startsWith('labs:hook:'))).toBe(false);
  });

  it('tells the page the expiry the server has extended (M7)', async () => {
    const t = setup();
    const created = (
      await call(t.handlers.createHook, 'POST', { subscription: subscription(1), language: 'ja', label: '柵' })
    ).body as Record<string, string>;
    t.advance(60 * 24 * 3600_000);
    await call(t.handlers.receiveHook, 'POST', '{}', { params: { token: created.triggerToken ?? '' } });
    const status = await call(t.handlers.hookStatus, 'POST', {
      hookId: created.hookId,
      manageToken: created.manageToken,
    });
    expect(Date.parse(String(status.body.expiresAt))).toBe(t.now() + 90 * 24 * 3600_000);
    expect(Date.parse(String(status.body.expiresAt))).toBeGreaterThan(Date.parse(created.expiresAt ?? ''));
    await call(t.handlers.deleteHook, 'DELETE', { hookId: created.hookId, manageToken: created.manageToken });
    expect(
      (await call(t.handlers.hookStatus, 'POST', { hookId: created.hookId, manageToken: created.manageToken })).status,
    ).toBe(404);
  });

  it('retries on the next check a device the overdue alert did not reach (M8)', async () => {
    const t = setup();
    await plan(t, 1, 2);
    t.failing.add(subscription(2).endpoint);
    t.advance(9 * 3600_000 + 60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    expect(t.sent.map((item) => item.endpoint)).toEqual([subscription(1).endpoint]);
    t.failing.clear();
    t.advance(5 * 60_000 + 1);
    await cronCall(t.handlers.cronReturnAlerts);
    expect(t.sent.map((item) => item.endpoint)).toEqual([subscription(1).endpoint, subscription(2).endpoint]);
  });

  it('never lets concurrent room creations pass the open-room limit (m9)', async () => {
    const t = setup();
    t.fake.seedSortedSet('labs:rooms:active', 199, t.now() + 3600_000);
    const statuses = await Promise.all(
      [1, 2, 3].map((n) =>
        call(t.handlers.createRoom, 'POST', { passphrase: 'yamagami', name: `A${n}`, hours: 2 }).then((r) => r.status),
      ),
    );
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 503)).toHaveLength(2);
  });

  it('renews a hook and its devices in one step (m10)', async () => {
    const t = setup();
    const created = (
      await call(t.handlers.createHook, 'POST', { subscription: subscription(1), language: 'ja', label: '柵' })
    ).body as Record<string, string>;
    t.fake.commands.length = 0;
    await call(t.handlers.receiveHook, 'POST', '{}', { params: { token: created.triggerToken ?? '' } });
    const writes = t.fake.commands.filter(
      (command) => command[0] === 'eval' && command[1] === SCRIPTS.compareAndSetRenewing,
    );
    expect(writes).toHaveLength(1);
    // The hook, the subscriptions' count and the subscription itself, in one script.
    expect(writes[0]?.slice(2, 6)).toEqual([
      3,
      `labs:hook:${created.hookId}`,
      'labs:push:subs',
      expect.stringMatching(/^labs:push:sub:/),
    ]);
    expect(t.fake.commands.some((command) => command[0] === 'expire')).toBe(false);
  });
});

describe('third review counterexamples', () => {
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const makePlan = async (t: ReturnType<typeof setup>, watchers: number[]) => {
    const created = (
      await createArmed(t, {
        subscription: subscription(1),
        language: 'ja',
        returnAt: '2026-11-15T17:00:00+09:00',
        graceMinutes: 0,
        note: '',
      })
    ).body as Record<string, string>;
    for (const n of watchers) {
      await call(
        t.handlers.returnPlanAction,
        'POST',
        { planId: created.planId, token: created.watchToken, subscription: subscription(n), language: 'ja' },
        { params: { action: 'watch' } },
      );
    }
    return created;
  };
  const action = (t: ReturnType<typeof setup>, created: Record<string, string>, name: string, extra = {}) =>
    call(
      t.handlers.returnPlanAction,
      'POST',
      { planId: created.planId, token: created.ownerToken, ...extra },
      { params: { action: name } },
    );

  it('never sends an overdue alert after the return, even when a send outlasts the others (F1)', async () => {
    const t = setup();
    const created = await makePlan(t, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    let finishing: Promise<{ status: number }> | null = null;
    t.duringSend(async (message, endpoint) => {
      if (message.title !== '帰着の連絡がありません' || endpoint !== subscription(11).endpoint) return;
      finishing = action(t, created, 'return');
      // This one device is slow; the return is pressed meanwhile.
      await pause(100);
    });
    t.advance(9 * 3600_000 + 60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    expect((await (finishing as unknown as Promise<{ status: number }>)).status).toBe(200);
    await pause(150);
    const titles = t.sent.map((item) => item.message.title);
    expect(titles.lastIndexOf('帰着の連絡がありません')).toBeLessThan(titles.indexOf('帰着しました'));
  });

  it('recovers a plan whose job stopped between claiming and sending, and does not clog the queue (F2)', async () => {
    const t = setup();
    const created = await makePlan(t, [2]);
    // The first overdue check dies after taking the plan, before any send.
    t.fake.beforeCommand(async (command) => {
      if (command[0] === 'get' && String(command[1]).startsWith('labs:push:sub:')) {
        t.fake.fail(true);
        return true;
      }
      return false;
    });
    t.advance(9 * 3600_000 + 60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    t.fake.fail(false);
    // Later checks deliver the alert to everyone it had not reached.
    for (let i = 0; i < 3; i += 1) {
      t.advance(5 * 60_000 + 1);
      await cronCall(t.handlers.cronReturnAlerts);
    }
    const alerted = t.sent
      .filter((item) => item.message.title === '帰着の連絡がありません')
      .map((item) => item.endpoint);
    expect(new Set(alerted)).toEqual(new Set([subscription(1).endpoint, subscription(2).endpoint]));
    // Nothing for this plan stays due in the past.
    const due = await t.memory.store.zRangeWithScores('labs:return:due', '-inf', t.now(), 10);
    expect(due.filter((row) => row.member === created.planId)).toEqual([]);
  });

  it('does not send an overdue alert carrying a time the owner moved during the check (F3)', async () => {
    const t = setup();
    const created = await makePlan(t, [2]);
    let moving: Promise<unknown> | null = null;
    let committed = false;
    t.fake.beforeCommand(async (command) => {
      // Once the job has committed the overdue step, the owner moves the return time.
      if (command[0] === 'eval' && String(command[5] ?? '').includes('"overdueAlerts":1')) {
        committed = true;
        return false;
      }
      if (committed) {
        moving = action(t, created, 'update', { returnAt: '2026-11-15T21:00:00+09:00' });
        await pause(50);
        return true;
      }
      return false;
    });
    t.advance(9 * 3600_000 + 60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    await moving;
    const overdue = t.sent.filter((item) => item.message.title === '帰着の連絡がありません');
    expect(overdue.every((item) => !item.message.body.includes('21:00'))).toBe(true);
  });

  it('keeps a subscription renewed by a hook counted, and uncounts one that is gone (F4)', async () => {
    const t = setup();
    const created = (
      await call(t.handlers.createHook, 'POST', { subscription: subscription(1), language: 'ja', label: '柵' })
    ).body as Record<string, string>;
    t.advance(80 * 24 * 3600_000);
    await call(t.handlers.receiveHook, 'POST', '{}', { params: { token: created.triggerToken ?? '' } });
    t.advance(20 * 24 * 3600_000);
    const counted = await t.memory.store.zRangeWithScores('labs:push:subs', t.now(), '+inf', 10);
    expect(counted).toHaveLength(1);
    t.gone.add(subscription(1).endpoint);
    await call(t.handlers.receiveHook, 'POST', '{}', { params: { token: created.triggerToken ?? '' } });
    expect(await t.memory.store.zRangeWithScores('labs:push:subs', '-inf', '+inf', 10)).toEqual([]);
  });

  it('never leaves a results page outside the page count after an edit and a delete race (F5)', async () => {
    const t = setup();
    const content = { title: '大会', note: '', columns: ['順位'], rows: [['1']] };
    const { id } = (await call(t.handlers.createResults, 'POST', { passphrase: 'club-2026', days: 7, content })).body;
    const params = { id: String(id) };
    // The delete lands between the edit's check and its write.
    t.fake.beforeCommand(async (command) => {
      const key = `labs:results:${String(id)}`;
      // The edit's write of the page, whether a plain SET or a compare-and-set script.
      if ((command[0] === 'set' && command[1] === key) || (command[0] === 'eval' && command[3] === key)) {
        await call(t.handlers.deleteResults, 'DELETE', { passphrase: 'club-2026' }, { params });
        return true;
      }
      return false;
    });
    await call(
      t.handlers.updateResults,
      'PUT',
      { passphrase: 'club-2026', content: { ...content, title: '改' } },
      { params },
    );
    const body = t.memory.keys().includes(`labs:results:${String(id)}`);
    const counted = (await t.memory.store.zRangeWithScores('labs:results:active', '-inf', '+inf', 10)).some(
      (row) => row.member === id,
    );
    expect(body).toBe(counted);
  });

  it('keeps every device added to a hook at the same time (F6)', async () => {
    const t = setup();
    const created = (
      await call(t.handlers.createHook, 'POST', { subscription: subscription(1), language: 'ja', label: '柵' })
    ).body as Record<string, string>;
    const add = (n: number) =>
      call(t.handlers.addHookDevice, 'POST', {
        hookId: created.hookId,
        manageToken: created.manageToken,
        subscription: subscription(n),
        language: 'ja',
      });
    const statuses = (await Promise.all([add(2), add(3), add(4)])).map((result) => result.status);
    expect(statuses).toEqual([200, 200, 200]);
    const received = await call(t.handlers.receiveHook, 'POST', '{}', {
      params: { token: created.triggerToken ?? '' },
    });
    expect(received.body).toMatchObject({ devices: 4 });
  });

  it(
    'reads watchers that share one expiry without reading them again and again (F7)',
    { timeout: 60_000 },
    async () => {
      const t = setup();
      for (let n = 1; n <= 450; n += 1) {
        await call(t.handlers.bearWatch, 'PUT', {
          subscription: subscription(n),
          language: 'ja',
          places: [{ latitude: 39.72, longitude: 140.1, radiusKm: 5 }],
        });
      }
      const csv = (...rows: string[]) => new Response(akitaFile(...rows), { headers: { 'content-type': 'text/csv' } });
      const old = akitaRow(1, '2026/11/10 07:00', 39.721, 140.101);
      t.fetch.mockResolvedValueOnce(csv(old));
      await cronCall(t.handlers.cronBearAlerts);
      t.fake.commands.length = 0;
      t.fake.work.examined = 0;
      t.fetch.mockResolvedValueOnce(csv(old, akitaRow(2, '2026/11/14 16:30', 39.73, 140.12)));
      await cronCall(t.handlers.cronBearAlerts);
      expect(new Set(t.sent.map((item) => item.endpoint)).size).toBe(450);
      // All 450 registered in the same millisecond share one expiry; each is still read about once.
      // Counted inside the paging script too, not only in what it returns.
      const pageRequests = t.fake.commands.filter(
        (command) => command[0] === 'eval' && command[1] === SCRIPTS.pageAfter,
      );
      expect(pageRequests.length).toBeGreaterThan(0);
      expect(t.fake.work.examined).toBeLessThan(450 * 2);
    },
  );

  it('delivers a bear alert on the next run when a run stops after marking a device (F8)', async () => {
    const t = setup();
    await call(t.handlers.bearWatch, 'PUT', {
      subscription: subscription(1),
      language: 'ja',
      places: [{ latitude: 39.72, longitude: 140.1, radiusKm: 5 }],
    });
    const csv = (...rows: string[]) => new Response(akitaFile(...rows), { headers: { 'content-type': 'text/csv' } });
    const old = akitaRow(1, '2026/11/10 07:00', 39.721, 140.101);
    const fresh = akitaRow(2, '2026/11/14 16:30', 39.73, 140.12);
    t.fetch.mockResolvedValueOnce(csv(old));
    await cronCall(t.handlers.cronBearAlerts);
    // The run dies as it looks up the device to send to.
    t.fake.beforeCommand(async (command) => {
      if (command[0] === 'get' && String(command[1]).startsWith('labs:push:sub:')) {
        t.fake.fail(true);
        return true;
      }
      return false;
    });
    t.fetch.mockResolvedValueOnce(csv(old, fresh));
    await cronCall(t.handlers.cronBearAlerts);
    t.fake.fail(false);
    await t.memory.store.del('labs:lock:bear-alerts');
    t.fetch.mockResolvedValueOnce(csv(old, fresh));
    await cronCall(t.handlers.cronBearAlerts);
    expect(t.sent).toHaveLength(1);
  });
});

describe('fourth review counterexamples', () => {
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const makePlan = async (t: ReturnType<typeof setup>, watchers: number[]) => {
    const created = (
      await createArmed(t, {
        subscription: subscription(1),
        language: 'ja',
        returnAt: '2026-11-15T17:00:00+09:00',
        graceMinutes: 0,
        note: '',
      })
    ).body as Record<string, string>;
    for (const n of watchers) {
      await call(
        t.handlers.returnPlanAction,
        'POST',
        { planId: created.planId, token: created.watchToken, subscription: subscription(n), language: 'ja' },
        { params: { action: 'watch' } },
      );
    }
    return created;
  };
  const finish = (t: ReturnType<typeof setup>, created: Record<string, string>) =>
    call(
      t.handlers.returnPlanAction,
      'POST',
      { planId: created.planId, token: created.ownerToken },
      { params: { action: 'return' } },
    );
  const subscriptionKeyOf = async (n: number) =>
    `labs:push:sub:${(await import('@/features/labs-notify/server/push')).subscriptionId(subscription(n).endpoint)}`;

  it('keeps the lock until every send has ended, even when one device cannot be read (R1)', async () => {
    const t = setup();
    const created = await makePlan(t, [2, 3]);
    const unreadable = await subscriptionKeyOf(3);
    let finishing: Promise<{ status: number }> | null = null;
    t.duringSend(async (message, endpoint) => {
      if (message.title !== '帰着の連絡がありません' || endpoint !== subscription(2).endpoint || finishing) return;
      // Device 2 is slow; the owner presses the return meanwhile.
      finishing = finish(t, created);
      await pause(150);
    });
    t.advance(9 * 3600_000 + 60_000);
    // Reading device 3 takes a while and then fails, while device 2 is still being sent to.
    t.fake.beforeCommand(async (command) => {
      if (command[0] === 'get' && command[1] === unreadable) {
        await pause(40);
        t.fake.rejectWhen((next) => next[0] === 'get' && next[1] === unreadable);
        return true;
      }
      return false;
    });
    await cronCall(t.handlers.cronReturnAlerts);
    await finishing;
    t.fake.rejectWhen(null);
    await pause(200);
    const titles = t.sent.map((item) => item.message.title);
    expect(titles).toContain('帰着しました');
    expect(titles.lastIndexOf('帰着の連絡がありません')).toBeLessThan(titles.lastIndexOf('帰着しました'));
  });

  it('does not send from a check that stalled past its lock (R2)', async () => {
    const t = setup();
    const created = await makePlan(t, [2]);
    let finishing: Promise<{ status: number }> | null = null;
    let committed = false;
    t.fake.beforeCommand(async (command) => {
      // After committing the overdue alert, the check stalls longer than the lock lasts; meanwhile
      // the owner returns and the return goes out.
      if (!committed) {
        committed =
          command[0] === 'eval' && command[1] === SCRIPTS.writeScheduled && String(command[8]).includes('"overdue"');
        return false;
      }
      t.advance(10 * 60_000);
      finishing = finish(t, created);
      await finishing;
      return true;
    });
    t.advance(9 * 3600_000 + 60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    const titles = t.sent.map((item) => item.message.title);
    expect(titles).toContain('帰着しました');
    expect(titles.lastIndexOf('帰着の連絡がありません')).toBeLessThan(titles.lastIndexOf('帰着しました'));
  });

  it('delivers the return even when the request stops after ending the plan (R3)', async () => {
    const t = setup();
    const created = await makePlan(t, [2]);
    const watcherKey = await subscriptionKeyOf(2);
    // The return request dies as it looks up the watcher's device.
    t.fake.rejectWhen((command) => command[0] === 'get' && command[1] === watcherKey);
    await finish(t, created);
    t.fake.rejectWhen(null);
    expect(t.sent.filter((item) => item.message.title === '帰着しました')).toHaveLength(0);
    // Pressing it again is not an error, and the watcher is told.
    expect((await finish(t, created)).status).toBe(200);
    t.advance(60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    expect(t.sent.filter((item) => item.message.title === '帰着しました').map((item) => item.endpoint)).toContain(
      subscription(2).endpoint,
    );
    // Once told, only a bare record of the ending is left.
    t.advance(10 * 60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    await expectOnlyEndings(t);
  });

  it('reads a thousand watchers that share one score in about a thousand rows (R4)', { timeout: 60_000 }, async () => {
    const t = setup();
    for (let n = 1; n <= 1000; n += 1) {
      await call(t.handlers.bearWatch, 'PUT', {
        subscription: subscription(n),
        language: 'ja',
        places: [{ latitude: 39.72, longitude: 140.1, radiusKm: 5 }],
      });
    }
    // Force every entry onto one score, the worst case for a score cursor.
    const index = t.fake.raw('labs:bear:watchers');
    if (index?.kind === 'zset') for (const member of index.value.keys()) index.value.set(member, 9e15);
    const csv = (...rows: string[]) => new Response(akitaFile(...rows), { headers: { 'content-type': 'text/csv' } });
    const old = akitaRow(1, '2026/11/10 07:00', 39.721, 140.101);
    t.fetch.mockResolvedValueOnce(csv(old));
    await cronCall(t.handlers.cronBearAlerts);
    t.fake.commands.length = 0;
    t.fake.work.examined = 0;
    t.fetch.mockResolvedValueOnce(csv(old, akitaRow(2, '2026/11/14 16:30', 39.73, 140.12)));
    await cronCall(t.handlers.cronBearAlerts);
    expect(new Set(t.sent.map((item) => item.endpoint)).size).toBe(1000);
    // What the paging script looks at inside Redis, not only what it returns.
    expect(t.fake.work.examined).toBeLessThan(1000 * 1.5);
  });
});

describe('fifth review counterexamples', () => {
  const planFor = async (t: ReturnType<typeof setup>, returnAt: string) => {
    const created = (
      await createArmed(t, {
        subscription: subscription(1),
        language: 'ja',
        returnAt,
        graceMinutes: 0,
        note: '',
      })
    ).body as Record<string, string>;
    await call(
      t.handlers.returnPlanAction,
      'POST',
      { planId: created.planId, token: created.watchToken, subscription: subscription(2), language: 'ja' },
      { params: { action: 'watch' } },
    );
    return created;
  };
  const finish = (t: ReturnType<typeof setup>, created: Record<string, string>) =>
    call(
      t.handlers.returnPlanAction,
      'POST',
      { planId: created.planId, token: created.ownerToken },
      { params: { action: 'return' } },
    );

  it('delivers the return even when the request stops between writing it and scheduling it (V1)', async () => {
    const t = setup();
    const created = await planFor(t, '2026-11-21T17:00:00+09:00');
    // The request dies right after the ending is written: nothing after it reaches the store.
    let written = false;
    t.fake.rejectWhen((command) => {
      if (written) return true;
      if (command[0] === 'eval' && String(command.slice(3).join(' ')).includes('"ending":"returned"')) written = true;
      return false;
    });
    await finish(t, created);
    t.fake.rejectWhen(null);
    // Pressing it again answers done, and the next check tells the watcher.
    expect((await finish(t, created)).status).toBe(200);
    t.advance(5 * 60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    expect(t.sent.filter((item) => item.message.title === '帰着しました').map((item) => item.endpoint)).toEqual([
      subscription(2).endpoint,
    ]);
  });

  it(
    'reaches every watcher over several runs when one run cannot reach them all (V2)',
    { timeout: 120_000 },
    async () => {
      const t = setup();
      for (let n = 1; n <= 300; n += 1) {
        await call(t.handlers.bearWatch, 'PUT', {
          subscription: subscription(n),
          language: 'ja',
          places: [{ latitude: 39.72, longitude: 140.1, radiusKm: 5 }],
        });
      }
      const csv = (...rows: string[]) => new Response(akitaFile(...rows), { headers: { 'content-type': 'text/csv' } });
      const old = akitaRow(1, '2026/11/10 07:00', 39.721, 140.101);
      const rows = [old, akitaRow(2, '2026/11/14 16:30', 39.73, 140.12)];
      t.fetch.mockResolvedValueOnce(csv(old));
      await cronCall(t.handlers.cronBearAlerts);
      // Every read of a device's record or of a sent mark takes 0.2 s, and every send 0.1 s.
      t.fake.beforeCommand(async (command) => {
        if (command[0] === 'get' && /^labs:bear:(watch|sent):/.test(String(command[1]))) t.advance(200);
        return false;
      });
      t.duringSend(async () => {
        t.advance(100);
      });
      for (let run = 0; run < 8; run += 1) {
        t.fetch.mockResolvedValueOnce(csv(...rows));
        await t.memory.store.del('labs:lock:bear-alerts');
        await cronCall(t.handlers.cronBearAlerts);
        t.advance(24 * 3600_000);
      }
      expect(new Set(t.sent.map((item) => item.endpoint)).size).toBe(300);
    },
  );

  it('reports a stored plan it cannot read instead of dropping it silently (V3)', async () => {
    const t = setup();
    const created = await planFor(t, '2026-11-15T17:00:00+09:00');
    const key = `labs:return:plan:${created.planId}`;
    const stored = JSON.parse((await t.memory.store.get(key)) ?? '{}') as Record<string, unknown>;
    delete stored.ending;
    await t.memory.store.set(key, JSON.stringify(stored), { ttlSeconds: 2 * 24 * 3600 });
    t.advance(9 * 3600_000 + 60_000);
    expect(await cronCall(t.handlers.cronReturnAlerts)).toMatchObject({ body: { result: { invalid: 1 } } });
  });
});

describe('sixth review counterexamples', () => {
  const csv = (...rows: string[]) => new Response(akitaFile(...rows), { headers: { 'content-type': 'text/csv' } });
  const page = (text: string) =>
    new Response(`<div id="main"><p>${text}</p></div><div id="tmp_contents"><p>${text}</p></div>`, {
      headers: { 'content-type': 'text/html' },
    });

  it('tells watchers again when a page returns to text it had before (W2)', async () => {
    const t = setup();
    const [first] = WATCHED_PAGES;
    await call(t.handlers.courseWatch, 'PUT', { subscription: subscription(1), language: 'ja', pages: [first?.id] });
    for (const text of ['A', 'B', 'C', 'B']) {
      t.fetch.mockImplementation(async () => page(text));
      await cronCall(t.handlers.cronCourseWatch);
      t.advance(24 * 3600_000);
    }
    // A was the baseline; B, C and B again are three changes.
    expect(t.sent.filter((item) => item.endpoint === subscription(1).endpoint)).toHaveLength(3);
  });

  it('tells watchers again when a sighting is taken down and published again (W2)', async () => {
    const t = setup();
    await call(t.handlers.bearWatch, 'PUT', {
      subscription: subscription(1),
      language: 'ja',
      places: [{ latitude: 39.72, longitude: 140.1, radiusKm: 5 }],
    });
    const old = akitaRow(1, '2026/11/10 07:00', 39.721, 140.101);
    const sighting = akitaRow(2, '2026/11/14 16:30', 39.73, 140.12);
    for (const rows of [[old], [old, sighting], [old], [old, sighting]]) {
      t.fetch.mockResolvedValueOnce(csv(...rows));
      await cronCall(t.handlers.cronBearAlerts);
      t.advance(12 * 3600_000);
    }
    expect(t.sent).toHaveLength(2);
  });

  it('waits for every worker before giving up on a failed one (W4)', async () => {
    const { eachLimited } = await import('@/features/labs-notify/server/cron-lock');
    let slowDone = false;
    const run = eachLimited([1, 2], 2, async (item) => {
      if (item === 1) throw new Error('first fails at once');
      await new Promise((resolve) => setTimeout(resolve, 50));
      slowDone = true;
    });
    await expect(run).rejects.toThrow('first fails at once');
    expect(slowDone).toBe(true);
  });

  it(
    'does not send a batch twice to a device that registers again during the scan (W5)',
    { timeout: 60_000 },
    async () => {
      const t = setup();
      for (let n = 1; n <= 150; n += 1) {
        await call(t.handlers.bearWatch, 'PUT', {
          subscription: subscription(n),
          language: 'ja',
          places: [{ latitude: 39.72, longitude: 140.1, radiusKm: 5 }],
        });
        t.advance(1000);
      }
      const old = akitaRow(1, '2026/11/10 07:00', 39.721, 140.101);
      t.fetch.mockResolvedValueOnce(csv(old));
      await cronCall(t.handlers.cronBearAlerts);
      // Device 1 is told, then registers again, which moves it to the end of the index.
      let again = false;
      t.duringSend(async (_message, endpoint) => {
        if (again || endpoint !== subscription(1).endpoint) return;
        again = true;
        await call(t.handlers.bearWatch, 'PUT', {
          subscription: subscription(1),
          language: 'ja',
          places: [{ latitude: 39.72, longitude: 140.1, radiusKm: 5 }],
        });
      });
      t.fetch.mockResolvedValueOnce(csv(old, akitaRow(2, '2026/11/14 16:30', 39.73, 140.12)));
      await cronCall(t.handlers.cronBearAlerts);
      expect(t.sent.filter((item) => item.endpoint === subscription(1).endpoint)).toHaveLength(1);
      expect(new Set(t.sent.map((item) => item.endpoint)).size).toBe(150);
    },
  );
});

describe('seventh review counterexamples', () => {
  it('does not tell a device again about a page it was told about when another page failed (Y3)', async () => {
    const t = setup();
    const pages = WATCHED_PAGES.map((item) => item.id);
    await call(t.handlers.courseWatch, 'PUT', { subscription: subscription(1), language: 'ja', pages });
    const page = (text: string) =>
      new Response(`<div id="main"><p>${text}</p></div><div id="tmp_contents"><p>${text}</p></div>`, {
        headers: { 'content-type': 'text/html' },
      });
    t.fetch.mockImplementation(async () => page('A'));
    await cronCall(t.handlers.cronCourseWatch);
    // Both pages change; the second page's message fails once.
    let failedOnce = false;
    t.duringSend(async (message) => {
      if (!failedOnce && message.url.endsWith(pages[1] ?? '')) {
        failedOnce = true;
        throw new Error('push service unavailable');
      }
    });
    t.fetch.mockImplementation(async () => page('B'));
    await cronCall(t.handlers.cronCourseWatch);
    t.advance(24 * 3600_000);
    await cronCall(t.handlers.cronCourseWatch);
    const perPage = pages.map((id) => t.sent.filter((item) => item.message.url.endsWith(id)).length);
    expect(perPage).toEqual([1, 1]);
  });
});

describe('two-step creation: a plan alerts only once armed', () => {
  const createOnly = (t: ReturnType<typeof setup>, returnAt = '2026-11-15T17:00:00+09:00') =>
    call(t.handlers.createReturnPlan, 'POST', {
      subscription: subscription(1),
      language: 'ja',
      returnAt,
      graceMinutes: 0,
      note: '',
    }).then((r) => r as { status: number; body: Record<string, string> });
  const arm = (t: ReturnType<typeof setup>, created: Record<string, string>, token = created.ownerToken) =>
    call(t.handlers.returnPlanAction, 'POST', { planId: created.planId, token }, { params: { action: 'arm' } });

  it('sends nothing for a plan whose creation answer was lost, and a new one can be made (C1)', async () => {
    const t = setup();
    // The answer to this creation never reaches the page, so it is never armed.
    await createOnly(t, '2026-11-15T08:20:00+09:00');
    t.advance(5 * 60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    const again = await createOnly(t);
    expect(again.status).toBe(201);
    expect((await arm(t, again.body)).status).toBe(200);
    t.advance(30 * 60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    expect(t.sent).toHaveLength(0);
    t.advance(9 * 3600_000);
    await cronCall(t.handlers.cronReturnAlerts);
    expect(t.sent.map((item) => item.message.title)).toEqual(['帰着の連絡がありません']);
  });

  it('arms again without harm when the answer to arming was lost (C2)', async () => {
    const t = setup();
    const created = (await createOnly(t)).body;
    expect((await arm(t, created)).status).toBe(200);
    expect((await arm(t, created)).status).toBe(200);
    expect((await arm(t, created, created.watchToken)).status).toBe(403);
    t.advance(9 * 3600_000 + 60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    await cronCall(t.handlers.cronReturnAlerts);
    expect(t.sent).toHaveLength(1);
  });

  it('lets an unarmed plan expire without a word (C3)', async () => {
    const t = setup();
    const made = await createOnly(t);
    expect(made.status).toBe(201);
    const created = made.body;
    // Before it is armed or expires, a check sends nothing for it either.
    t.advance(5 * 60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    t.advance(6 * 60_000);
    expect(t.memory.keys().filter((key) => key.startsWith('labs:return:plan:'))).toEqual([]);
    expect((await arm(t, created)).status).toBe(404);
    t.advance(9 * 3600_000);
    await cronCall(t.handlers.cronReturnAlerts);
    expect(t.sent).toHaveLength(0);
  });
});

describe('ninth review counterexamples', () => {
  const PLANS = 'labs:return:plans';
  const createOnly = (t: ReturnType<typeof setup>, returnAt = '2026-11-15T17:00:00+09:00') =>
    call(t.handlers.createReturnPlan, 'POST', {
      subscription: subscription(1),
      language: 'ja',
      returnAt,
      graceMinutes: 0,
      note: '',
    }).then((r) => r as { status: number; body: Record<string, string> });
  const action = (
    t: ReturnType<typeof setup>,
    created: Record<string, string>,
    name: string,
    extra: object = {},
    token = created.ownerToken,
  ) =>
    call(
      t.handlers.returnPlanAction,
      'POST',
      { planId: created.planId, token, ...extra },
      { params: { action: name } },
    );
  /** The plan's place in the count of held plans, against the time its record actually expires. */
  const capAgainstExpiry = async (t: ReturnType<typeof setup>, planId: string | undefined) => {
    const rows = await t.memory.store.zRangeWithScores(PLANS, '-inf', '+inf', 10_000);
    const score = rows.find((row) => row.member === planId)?.score ?? null;
    const ttl = t.memory.ttlOf(`labs:return:plan:${planId}`);
    return { score, expiresAt: ttl === null ? null : t.now() + ttl * 1000 };
  };

  it('refuses to arm a plan whose return time has passed, and sends nothing for it (N2)', async () => {
    const t = setup();
    const created = (await createOnly(t, '2026-11-15T08:02:00+09:00')).body;
    // The page closed before arming and is opened again after the return time, within ten minutes.
    t.advance(9 * 60_000);
    expect((await action(t, created, 'arm')).status).toBe(410);
    await cronCall(t.handlers.cronReturnAlerts);
    t.advance(5 * 60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    expect(t.sent).toHaveLength(0);
  });

  it('keeps the count of held plans in step with a plan moved later (N3)', async () => {
    const t = setup();
    const created = (await createOnly(t)).body;
    expect((await action(t, created, 'arm')).status).toBe(200);
    expect((await action(t, created, 'update', { returnAt: '2026-11-19T17:00:00+09:00' })).status).toBe(200);
    const { score, expiresAt } = await capAgainstExpiry(t, created.planId);
    expect(score).not.toBeNull();
    expect(Math.abs((score ?? 0) - (expiresAt ?? 0))).toBeLessThan(2_000);
  });

  it('frees a cancelled plan’s place in the count when its record goes (N3)', async () => {
    const t = setup();
    // Other people's plans, held for two more days, leave room for exactly one more.
    t.memory.seedSortedSet(PLANS, 4_999, t.now() + 2 * 86_400_000);
    const created = (await createOnly(t, '2026-11-21T17:00:00+09:00')).body;
    expect((await action(t, created, 'arm')).status).toBe(200);
    expect((await action(t, created, 'cancel')).status).toBe(200);
    const { score, expiresAt } = await capAgainstExpiry(t, created.planId);
    expect(Math.abs((score ?? 0) - (expiresAt ?? 0))).toBeLessThan(2_000);
    // A day later the cancelled plan is gone, so there is room again.
    t.advance(86_400_000 + 60_000);
    expect(t.memory.keys().filter((key) => key.startsWith('labs:return:plan:'))).toEqual([]);
    expect((await createOnly(t, '2026-11-17T17:00:00+09:00')).status).toBe(201);
  });

  it('never leaves an armed plan counted only for its unarmed ten minutes (N3)', async () => {
    const t = setup();
    const created = (await createOnly(t)).body;
    // Any request that touches the count on its own fails; the plan's own write goes through.
    t.fake.rejectWhen((command) => command.includes(PLANS) && command[0] !== 'eval');
    await action(t, created, 'arm');
    t.fake.rejectWhen(null);
    const { score, expiresAt } = await capAgainstExpiry(t, created.planId);
    // Armed or not, the plan is counted for as long as its record lives.
    expect(expiresAt).not.toBeNull();
    expect(score ?? 0).toBeGreaterThanOrEqual((expiresAt ?? 0) - 2_000);
  });

  it('treats an unarmed plan as not registered: no watching, status or change, and a silent cancel (N4)', async () => {
    const t = setup();
    const created = (await createOnly(t)).body;
    const watch = await action(
      t,
      created,
      'watch',
      { subscription: subscription(2), language: 'ja' },
      created.watchToken,
    );
    expect(watch.status).toBe(404);
    expect((await action(t, created, 'status', {}, created.watchToken)).status).toBe(404);
    expect((await action(t, created, 'update', { returnAt: '2026-11-15T18:00:00+09:00' })).status).toBe(404);
    expect((await action(t, created, 'cancel')).status).toBe(200);
    expect(t.sent).toHaveLength(0);
    // It cannot be armed after the cancel, and nothing is ever sent for it.
    expect((await action(t, created, 'arm')).status).toBe(404);
    t.advance(10 * 3600_000);
    await cronCall(t.handlers.cronReturnAlerts);
    expect(t.sent).toHaveLength(0);
    await expectOnlyEndings(t);
  });

  it('cancels an unarmed plan without telling anyone already on it (N4)', async () => {
    const t = setup();
    const created = (await createOnly(t)).body;
    // A device already on the plan, written directly.
    const key = `labs:return:plan:${created.planId}`;
    const plan = JSON.parse((await t.memory.store.get(key)) ?? '{}') as { ownerSubscriptions: string[] };
    await t.memory.store.set(key, JSON.stringify({ ...plan, watcherSubscriptions: plan.ownerSubscriptions }), {
      ttlSeconds: 600,
    });
    expect((await action(t, created, 'cancel')).status).toBe(200);
    expect(t.sent).toHaveLength(0);
  });
});

describe('tenth review counterexamples', () => {
  it('drops watchers found gone from the plan, so the count is true and they can be replaced (T2)', async () => {
    const t = setup();
    const created = (
      await createArmed(t, {
        subscription: subscription(1),
        language: 'ja',
        returnAt: '2026-11-15T17:00:00+09:00',
        graceMinutes: 0,
        note: '',
      })
    ).body as Record<string, string>;
    const watch = (n: number) =>
      call(
        t.handlers.returnPlanAction,
        'POST',
        { planId: created.planId, token: created.watchToken, subscription: subscription(n), language: 'ja' },
        { params: { action: 'watch' } },
      );
    for (let n = 2; n <= 11; n += 1) expect((await watch(n)).status).toBe(200);
    for (let n = 2; n <= 11; n += 1) t.gone.add(subscription(n).endpoint);
    t.advance(9 * 3600_000 + 60_000);
    await cronCall(t.handlers.cronReturnAlerts);
    expect(t.sent.map((item) => item.endpoint)).toEqual([subscription(1).endpoint]);
    const status = await call(
      t.handlers.returnPlanAction,
      'POST',
      { planId: created.planId, token: created.ownerToken },
      { params: { action: 'status' } },
    );
    expect(status.body).toMatchObject({ plan: { watchers: 0 } });
    expect((await watch(12)).status).toBe(200);
  });

  it('lets only one of two first saves of an endpoint set its keys (T3)', async () => {
    const t = setup();
    const withAuth = (auth: string) => ({
      subscription: { ...subscription(1), keys: { ...subscription(1).keys, auth } },
      language: 'ja',
    });
    let second: Promise<{ status: number }> | null = null;
    t.fake.beforeCommand(async (command) => {
      if (command[0] !== 'eval' || command[1] !== SCRIPTS.putIndexed) return false;
      // The first save has checked that the endpoint is new; the second one runs to the end first.
      second = call(t.handlers.saveSubscription, 'POST', withAuth('b'.repeat(22)));
      await second;
      return true;
    });
    const first = await call(t.handlers.saveSubscription, 'POST', withAuth('a'.repeat(22)));
    const later = await (second as unknown as Promise<{ status: number }>);
    const [key] = t.memory.keys().filter((item) => item.startsWith('labs:push:sub:'));
    const stored = JSON.parse((await t.memory.store.get(key ?? '')) ?? '{}') as { keys: { auth: string } };
    // Exactly one caller was told its keys were saved, and those are the keys kept.
    expect([first.status, later.status].filter((status) => status === 200)).toHaveLength(1);
    expect(stored.keys.auth).toBe(first.status === 200 ? 'a'.repeat(22) : 'b'.repeat(22));
  });
});

describe('twelfth review counterexamples', () => {
  it(
    'reaches a later plan within one run while the push services of earlier plans stall (X1)',
    { timeout: 30_000 },
    async () => {
      const scale = 100;
      const t = setup({ realTimeScale: scale });
      const make = (n: number, returnAt: string) =>
        createArmed(t, { subscription: subscription(n), language: 'ja', returnAt, graceMinutes: 0, note: '' });
      // Eight plans due first, whose devices' push services stall until the sender gives up (10 s).
      for (let n = 1; n <= 8; n += 1) await make(n, '2026-11-15T16:00:00+09:00');
      await make(9, '2026-11-15T16:30:00+09:00');
      t.duringSend(async (_message, endpoint) => {
        if (endpoint !== subscription(9).endpoint) await new Promise((resolve) => setTimeout(resolve, 10_000 / scale));
      });
      t.advance(9 * 3600_000);
      expect((await cronCall(t.handlers.cronReturnAlerts)).status).toBe(200);
      expect(t.sent.map((item) => item.endpoint)).toContain(subscription(9).endpoint);
    },
  );
});

describe('thirteenth review counterexamples', () => {
  it(
    'never has more than 25 sends under way at once, however many plans alert together (Z1)',
    { timeout: 60_000 },
    async () => {
      const t = setup();
      // Twenty-five plans, each with ten watchers, all overdue at the same check.
      for (let plan = 1; plan <= 25; plan += 1) {
        const created = (
          await createArmed(t, {
            subscription: subscription(plan * 100),
            language: 'ja',
            returnAt: '2026-11-15T17:00:00+09:00',
            graceMinutes: 0,
            note: '',
          })
        ).body as Record<string, string>;
        for (let watcher = 1; watcher <= 10; watcher += 1) {
          await call(
            t.handlers.returnPlanAction,
            'POST',
            {
              planId: created.planId,
              token: created.watchToken,
              subscription: subscription(plan * 100 + watcher),
              language: 'ja',
            },
            { params: { action: 'watch' } },
          );
        }
      }
      let inFlight = 0;
      let most = 0;
      t.duringSend(async () => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
      });
      t.advance(9 * 3600_000);
      expect((await cronCall(t.handlers.cronReturnAlerts)).status).toBe(200);
      expect(t.sent).toHaveLength(25 * 11);
      expect(most).toBeLessThanOrEqual(25);
    },
  );

  it('gives the return check’s sends a short timeout and leaves the others the sender’s own (Z2)', async () => {
    const t = setup();
    await createArmed(t, {
      subscription: subscription(1),
      language: 'ja',
      returnAt: '2026-11-15T17:00:00+09:00',
      graceMinutes: 0,
      note: '',
    });
    t.advance(9 * 3600_000);
    await cronCall(t.handlers.cronReturnAlerts);
    expect(t.timeouts).toEqual([5_000]);
    const created = await call(t.handlers.createHook, 'POST', {
      subscription: subscription(2),
      language: 'ja',
      label: 'わな',
    });
    const { triggerToken } = created.body as Record<string, string>;
    await call(t.handlers.receiveHook, 'POST', '{}', {
      params: { token: triggerToken ?? '' },
      headers: { origin: '', 'content-type': 'application/json' },
    });
    expect(t.timeouts).toEqual([5_000, undefined]);
  });

  it('tells the caller of a hook how many devices it could not reach, so it can call again (Z3)', async () => {
    const t = setup();
    const created = await call(t.handlers.createHook, 'POST', {
      subscription: subscription(1),
      language: 'ja',
      label: 'わな',
    });
    const { triggerToken, hookId, manageToken } = created.body as Record<string, string>;
    await call(t.handlers.addHookDevice, 'POST', {
      hookId,
      manageToken,
      subscription: subscription(2),
      language: 'ja',
    });
    t.failing.add(subscription(2).endpoint);
    const received = await call(t.handlers.receiveHook, 'POST', '{}', {
      params: { token: triggerToken ?? '' },
      headers: { origin: '', 'content-type': 'application/json' },
    });
    expect(received).toMatchObject({ status: 202, body: { delivered: 1, failed: 1, devices: 2 } });
  });
});

describe('fourteenth review counterexamples', () => {
  it(
    'reaches a plan behind fifty plans whose eleven devices all stall, within one run (P1)',
    { timeout: 120_000 },
    async () => {
      const scale = 20;
      const t = setup({ realTimeScale: scale });
      for (let plan = 1; plan <= 50; plan += 1) {
        const created = (
          await createArmed(t, {
            subscription: subscription(plan * 100),
            language: 'ja',
            returnAt: '2026-11-15T16:00:00+09:00',
            graceMinutes: 0,
            note: '',
          })
        ).body as Record<string, string>;
        for (let watcher = 1; watcher <= 10; watcher += 1) {
          await call(
            t.handlers.returnPlanAction,
            'POST',
            {
              planId: created.planId,
              token: created.watchToken,
              subscription: subscription(plan * 100 + watcher),
              language: 'ja',
            },
            { params: { action: 'watch' } },
          );
        }
      }
      const victim = subscription(99_999).endpoint;
      await createArmed(t, {
        subscription: subscription(99_999),
        language: 'ja',
        returnAt: '2026-11-15T16:30:00+09:00',
        graceMinutes: 0,
        note: '',
      });
      // Every device of the earlier plans stalls until the return check's timeout (5 s).
      t.duringSend(async (_message, endpoint) => {
        if (endpoint !== victim) await new Promise((resolve) => setTimeout(resolve, 5_000 / scale));
      });
      t.advance(9 * 3600_000);
      expect((await cronCall(t.handlers.cronReturnAlerts)).status).toBe(200);
      expect(t.sent.map((item) => item.endpoint)).toContain(victim);
    },
  );

  it('keeps a slow subscription read from holding a send place another alert needs (P3)', async () => {
    const t = setup();
    const fake = t.fake;
    const push = createPushService({ store: () => t.memory.store, send: async () => 'sent' as const, now: t.now });
    const slow: string[] = [];
    for (let n = 1; n <= 30; n += 1) slow.push((await push.save(subscription(n), 'ja')).id);
    const { id: quick } = await push.save(subscription(31), 'ja');
    let release: () => void = () => undefined;
    const stalled = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Reads of the thirty subscriptions stall; the thirty-first is read at once.
    const slowKeys = new Set(slow.map((id) => `labs:push:sub:${id}`));
    fake.beforeCommand(async (command) => {
      if (command[0] === 'get' && slowKeys.has(String(command[1]))) await stalled;
      return false;
    });
    const message = () => ({ title: 't', body: 'b', url: '/labs' });
    const first = push.notify(slow, message, { ttlSeconds: 60, urgency: 'high' });
    const second = await Promise.race([
      push.notify([quick], message, { ttlSeconds: 60, urgency: 'high' }),
      new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 500)),
    ]);
    release();
    fake.beforeCommand(null);
    await first;
    expect(second).toMatchObject({ sent: 1 });
  });

  it('leaves devices it has no time left for unsent and unpenalised (P3)', async () => {
    const t = setup();
    const send = vi.fn(async () => 'sent' as const);
    const push = createPushService({ store: () => t.memory.store, send, now: t.now });
    const { id } = await push.save(subscription(1), 'ja');
    const result = await push.notify([id], () => ({ title: 't', body: 'b', url: '/labs' }), {
      ttlSeconds: 60,
      urgency: 'high',
      sendBy: t.now() - 1,
    });
    expect(send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ sent: 0, failed: 0, skippedIds: [id] });
  });

  it('fits the worst run of the return check inside its route and its locks (P3)', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/cron/return-alerts/route.ts'), 'utf8');
    const maxDuration = Number(/export const maxDuration = (\d+);/.exec(route)?.[1]);
    const timing = RETURN_RUN_TIMING;
    // Every store request may take its timeout three times over, every push its own timeout.
    expect(timing.runWorstMs).toBeLessThanOrEqual(maxDuration * 1000 - 10_000);
    expect(timing.planHoldWorstMs).toBeLessThan(timing.planLockSeconds * 1000);
    expect(timing.cronLockSeconds * 1000).toBeGreaterThanOrEqual(maxDuration * 1000);
    // Shorter than the five minutes between runs, so the next run is not locked out.
    expect(timing.cronLockSeconds).toBeLessThan(5 * 60);
  });
});

describe('eighteenth review counterexamples', () => {
  it('counts tries per device: one there was no time for keeps all its tries (Q1)', async () => {
    const t = setup();
    const created = (
      await createArmed(t, {
        subscription: subscription(1),
        language: 'ja',
        returnAt: '2026-11-15T17:00:00+09:00',
        graceMinutes: 0,
        note: '',
      })
    ).body as Record<string, string>;
    await call(
      t.handlers.returnPlanAction,
      'POST',
      { planId: created.planId, token: created.watchToken, subscription: subscription(2), language: 'ja' },
      { params: { action: 'watch' } },
    );
    const watcherId = createHash('sha256').update(subscription(2).endpoint).digest('base64url');
    // The owner's device fails; the watcher's is read only after the owner's send, once the plan's
    // time to send is up, so it is not tried.
    t.failing.add(subscription(1).endpoint);
    let sendsBefore = 0;
    let skipWatcher = true;
    t.fake.beforeCommand(async (command) => {
      if (skipWatcher && command[0] === 'get' && command[1] === `labs:push:sub:${watcherId}`) {
        // Waits for the owner's send of this check to have started.
        await vi.waitFor(() => {
          if (t.timeouts.length <= sendsBefore) throw new Error('the owner has not been sent to yet');
        });
        t.advance(100_000);
      }
      return false;
    });
    t.advance(9 * 3600_000 + 60_000);
    // Three checks: the owner's device fails each time and is given up; the watcher's is never tried.
    for (let run = 0; run < 3; run += 1) {
      sendsBefore = t.timeouts.length;
      await cronCall(t.handlers.cronReturnAlerts);
      t.advance(5 * 60_000);
    }
    expect(t.sent.filter((item) => item.endpoint === subscription(2).endpoint)).toEqual([]);
    // Now the watcher's device is tried, and fails once.
    skipWatcher = false;
    t.fake.beforeCommand(null);
    t.failing.add(subscription(2).endpoint);
    await cronCall(t.handlers.cronReturnAlerts);
    t.advance(5 * 60_000);
    // It has tries left: the next check reaches it.
    t.failing.delete(subscription(2).endpoint);
    await cronCall(t.handlers.cronReturnAlerts);
    expect(
      t.sent.filter((item) => item.endpoint === subscription(2).endpoint).map((item) => item.message.title),
    ).toEqual(['帰着の連絡がありません']);
  });
});

describe('nineteenth review counterexamples', () => {
  const planBody = (n: number, returnAt = '2026-11-15T17:00:00+09:00') => ({
    subscription: subscription(n),
    language: 'ja',
    returnAt,
    graceMinutes: 0,
    note: '',
  });
  const arm = (t: ReturnType<typeof setup>, created: Record<string, string>) =>
    call(
      t.handlers.returnPlanAction,
      'POST',
      { planId: created.planId, token: created.ownerToken },
      { params: { action: 'arm' } },
    );

  it('keeps taking due plans while the run has time, past the first hundred (S1)', { timeout: 120_000 }, async () => {
    const t = setup();
    for (let n = 1; n <= 150; n += 1) await createArmed(t, planBody(n));
    t.advance(9 * 3600_000);
    expect((await cronCall(t.handlers.cronReturnAlerts)).status).toBe(200);
    expect(new Set(t.sent.map((item) => item.endpoint)).size).toBe(150);
  });

  it('arms at most three plans at once for one device (S2)', async () => {
    const t = setup();
    const made: Record<string, string>[] = [];
    for (let n = 0; n < 4; n += 1) {
      const created = await call(t.handlers.createReturnPlan, 'POST', planBody(1), {
        headers: { 'x-vercel-forwarded-for': anotherAddress() },
      });
      made.push(created.body as Record<string, string>);
    }
    const statuses = [];
    for (const created of made) statuses.push((await arm(t, created)).status);
    expect(statuses).toEqual([200, 200, 200, 409]);
    // Once one has ended, its place is free again.
    const [first, , , fourth] = made;
    await call(
      t.handlers.returnPlanAction,
      'POST',
      { planId: first?.planId, token: first?.ownerToken },
      { params: { action: 'cancel' } },
    );
    expect((await arm(t, fourth ?? {})).status).toBe(200);
  });

  it('lets one address make at most ten plans a day (S3)', async () => {
    const t = setup();
    const statuses = [];
    for (let n = 1; n <= 11; n += 1) {
      statuses.push((await call(t.handlers.createReturnPlan, 'POST', planBody(n))).status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
    // Another address still can.
    const other = await call(t.handlers.createReturnPlan, 'POST', planBody(12), {
      headers: { 'x-vercel-forwarded-for': '198.51.100.7' },
    });
    expect(other.status).toBe(201);
  });
});
