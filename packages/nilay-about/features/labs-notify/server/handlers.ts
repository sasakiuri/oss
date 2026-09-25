import 'server-only';

import { z } from 'zod';

import { WATCHED_PAGE_IDS } from '@/lib/course-watch';
import { SCHEDULED_CHECKS_PAUSED_MESSAGE } from '@/lib/scheduled-checks';
import { bearWatchRequestSchema } from '@/lib/schemas/bear-alerts';
import {
  createResultsSchema,
  deleteResultsSchema,
  resultsIdSchema,
  updateResultsSchema,
} from '@/lib/schemas/event-results';
import { createRoomSchema, joinRoomSchema, positionSchema, roomIdSchema } from '@/lib/schemas/location-share';
import { pushSubscriptionSchema, subscriptionRequestSchema } from '@/lib/schemas/push';
import {
  createReturnPlanSchema,
  returnPlanTokenSchema,
  updateReturnPlanSchema,
  watchReturnPlanSchema,
} from '@/lib/schemas/return-alert';
import {
  addHookDeviceSchema,
  addedHookDeviceSchema,
  createHookSchema,
  manageHookSchema,
  triggerTokenSchema,
} from '@/lib/schemas/trap-alerts';
import { assertCronRequest, assertSameOrigin, bearerToken, readJsonBody, readTextBody } from '@/lib/server/guards';
import { createRoute, RequestError, type RouteDependencies } from '@/lib/server/http';
import { rateLimitPresets, type RateLimitConfig } from '@/lib/server/rate-limit';
import { getClientIp } from '@/lib/server/request';
import { HOOK_BODY_MAX_BYTES, readHookMessage } from '@/lib/trap-alerts';

import type { createBearAlerts } from './bear-alerts';
import type { createCourseWatch } from './course-watch';
import type { createEventResults } from './event-results';
import type { createLocationRooms } from './location-room';
import type { PushService } from './push';
import type { createReturnAlerts } from './return-alert';
import type { createTrapHooks } from './trap-hooks';

export interface LabsNotifyDependencies {
  siteUrl: () => string;
  vapidPublicKey: () => string | undefined;
  cronSecret: () => string | undefined;
  /** Whether the scheduled checks are paused (`lib/scheduled-checks.ts`); registrations for them are refused. */
  scheduledChecksPaused: () => boolean;
  push: PushService;
  bear: ReturnType<typeof createBearAlerts>;
  course: ReturnType<typeof createCourseWatch>;
  returns: ReturnType<typeof createReturnAlerts>;
  rooms: ReturnType<typeof createLocationRooms>;
  hooks: ReturnType<typeof createTrapHooks>;
  results: ReturnType<typeof createEventResults>;
  route?: RouteDependencies;
}

const JSON_BODY_MAX_BYTES = 16 * 1024;
const RESULTS_BODY_MAX_BYTES = 160 * 1024;
/**
 * A room page updates every five seconds and a party on one mobile network can share an address,
 * so the address limit only stops floods; each member is limited on its own in the room service.
 */
const ROOM_POLL_LIMIT: RateLimitConfig = { maxRequests: 1200, windowMs: 60_000 };
const FAILURE = '処理に失敗しました。しばらくしてからお試しください。';
const noStore = { 'Cache-Control': 'no-store' };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new RequestError(400, '入力内容に誤りがあります。');
  return result.data;
}

type Params<K extends string> = { params: Promise<Record<K, string>> };

export function createLabsNotifyHandlers(deps: LabsNotifyDependencies) {
  /** Refuses a registration that only a scheduled check would act on, while those checks are paused. */
  const assertScheduledChecksRunning = () => {
    if (deps.scheduledChecksPaused()) throw new RequestError(503, SCHEDULED_CHECKS_PAUSED_MESSAGE.ja);
  };

  const route = <C = unknown>(
    rateLimit: RateLimitConfig,
    handle: (request: Request, context: C) => Promise<Response>,
  ) => createRoute<C>({ rateLimit, failureMessage: FAILURE }, handle, deps.route);

  /** Browser-called writes: same origin, bounded JSON, validated. */
  const body = async <T>(request: Request, schema: z.ZodType<T>, maxBytes = JSON_BODY_MAX_BYTES) => {
    assertSameOrigin(request, deps.siteUrl());
    return parse(schema, await readJsonBody(request, maxBytes));
  };

  const cron = (run: () => Promise<unknown>) =>
    route(rateLimitPresets.apiWrite, async (request) => {
      assertCronRequest(request, deps.cronSecret());
      return json({ result: await run() });
    });

  return {
    vapidKey: route(rateLimitPresets.apiRead, async () => {
      const publicKey = deps.vapidPublicKey();
      if (!publicKey) throw new RequestError(503, '通知は現在利用できません。');
      return json({ publicKey });
    }),

    saveSubscription: route(rateLimitPresets.apiWrite, async (request) => {
      const { subscription, language } = await body(request, subscriptionRequestSchema);
      const { expiresAt } = await deps.push.save(subscription, language);
      return json({ expiresAt: expiresAt.toISOString() });
    }),

    /** Stops every notification to this device: the subscription and its alert places go. */
    deleteSubscription: route(rateLimitPresets.apiWrite, async (request) => {
      const { subscription } = await body(request, z.object({ subscription: pushSubscriptionSchema }));
      const id = await deps.push.owner(subscription);
      if (id) {
        // Places and pages are keyed by the device; plans and hooks drop it when a send finds it gone.
        await deps.bear.forget(id);
        await deps.course.forget(id);
        await deps.push.remove(subscription);
      }
      return json({ removed: id !== null });
    }),

    testPush: route(rateLimitPresets.strict, async (request) => {
      const { subscription } = await body(request, z.object({ subscription: pushSubscriptionSchema }));
      const id = await deps.push.owner(subscription);
      if (!id) throw new RequestError(404, 'この端末の通知の登録が見つかりません。');
      const result = await deps.push.notify(
        [id],
        (language) =>
          language === 'ja'
            ? { title: 'テスト通知', body: 'Nilay Labs からの通知は届いています。', url: '/labs', tag: 'test' }
            : {
                title: 'Test notification',
                body: 'Notifications from Nilay Labs are reaching you.',
                url: '/labs',
                tag: 'test',
              },
        { ttlSeconds: 60, urgency: 'normal' },
      );
      return json({ sent: result.sent });
    }),

    bearWatch: route(rateLimitPresets.apiWrite, async (request) => {
      assertScheduledChecksRunning();
      const { subscription, language, places } = await body(request, bearWatchRequestSchema);
      const { expiresAt } = await deps.bear.register(subscription, language, places);
      return json({ expiresAt: expiresAt.toISOString() });
    }),
    bearUnwatch: route(rateLimitPresets.apiWrite, async (request) => {
      const { subscription } = await body(request, z.object({ subscription: pushSubscriptionSchema }));
      await deps.bear.unregister(subscription);
      return json({ removed: true });
    }),

    coursePages: route(rateLimitPresets.apiRead, async () => json({ pages: await deps.course.pageStates() })),
    courseWatch: route(rateLimitPresets.apiWrite, async (request) => {
      assertScheduledChecksRunning();
      const { subscription, language, pages } = await body(
        request,
        subscriptionRequestSchema.extend({ pages: z.array(z.enum(WATCHED_PAGE_IDS)).min(1) }),
      );
      const { expiresAt } = await deps.course.register(subscription, language, pages);
      return json({ expiresAt: expiresAt.toISOString() });
    }),
    courseUnwatch: route(rateLimitPresets.apiWrite, async (request) => {
      const { subscription } = await body(request, z.object({ subscription: pushSubscriptionSchema }));
      await deps.course.unregister(subscription);
      return json({ removed: true });
    }),

    createReturnPlan: route(rateLimitPresets.apiWrite, async (request) => {
      assertScheduledChecksRunning();
      const { subscription, language, ...fields } = await body(request, createReturnPlanSchema);
      return json(await deps.returns.create(subscription, language, fields, getClientIp(request)), 201);
    }),
    returnPlanAction: route<Params<'action'>>(rateLimitPresets.apiWrite, async (request, context) => {
      const { action } = await context.params;
      switch (action) {
        case 'watch': {
          assertScheduledChecksRunning();
          const { planId, token, subscription, language } = await body(request, watchReturnPlanSchema);
          return json({ plan: await deps.returns.watch(planId, token, subscription, language) });
        }
        case 'arm': {
          assertScheduledChecksRunning();
          const { planId, token } = await body(request, returnPlanTokenSchema);
          return json({ plan: await deps.returns.arm(planId, token) });
        }
        case 'status': {
          const { planId, token } = await body(request, returnPlanTokenSchema);
          return json({ plan: await deps.returns.status(planId, token) });
        }
        case 'update': {
          assertScheduledChecksRunning();
          const { planId, token, returnAt } = await body(request, updateReturnPlanSchema);
          return json({ plan: await deps.returns.update(planId, token, returnAt) });
        }
        case 'return':
        case 'cancel': {
          const { planId, token } = await body(request, returnPlanTokenSchema);
          await deps.returns.finish(planId, token, action === 'return' ? 'returned' : 'cancelled');
          return json({ done: true });
        }
        default:
          throw new RequestError(404, 'Not found');
      }
    }),

    createRoom: route(rateLimitPresets.apiWrite, async (request) => {
      const fields = await body(request, createRoomSchema);
      return json(await deps.rooms.create(fields), 201);
    }),
    joinRoom: route<Params<'roomId'>>(rateLimitPresets.apiWrite, async (request, context) => {
      const roomId = parse(roomIdSchema, (await context.params).roomId);
      const fields = await body(request, joinRoomSchema);
      return json(await deps.rooms.join(roomId, fields, getClientIp(request)));
    }),
    viewRoom: route<Params<'roomId'>>(ROOM_POLL_LIMIT, async (request, context) => {
      const roomId = parse(roomIdSchema, (await context.params).roomId);
      return json(await deps.rooms.view(roomId, bearerToken(request)));
    }),
    reportPosition: route<Params<'roomId'>>(ROOM_POLL_LIMIT, async (request, context) => {
      const roomId = parse(roomIdSchema, (await context.params).roomId);
      const position = await body(request, positionSchema);
      return json(await deps.rooms.report(roomId, bearerToken(request), position));
    }),
    leaveRoom: route<Params<'roomId'>>(rateLimitPresets.apiWrite, async (request, context) => {
      const roomId = parse(roomIdSchema, (await context.params).roomId);
      assertSameOrigin(request, deps.siteUrl());
      await deps.rooms.leave(roomId, bearerToken(request));
      return json({ left: true });
    }),
    closeRoom: route<Params<'roomId'>>(rateLimitPresets.apiWrite, async (request, context) => {
      const roomId = parse(roomIdSchema, (await context.params).roomId);
      assertSameOrigin(request, deps.siteUrl());
      await deps.rooms.close(roomId, bearerToken(request));
      return json({ closed: true });
    }),

    createHook: route(rateLimitPresets.apiWrite, async (request) => {
      const { subscription, language, label } = await body(request, createHookSchema);
      return json(await deps.hooks.create(subscription, language, label), 201);
    }),
    addHookDevice: route(rateLimitPresets.apiWrite, async (request) => {
      const { hookId, manageToken, subscription, language } = await body(request, addHookDeviceSchema);
      return json(addedHookDeviceSchema.parse(await deps.hooks.addDevice(hookId, manageToken, subscription, language)));
    }),
    deleteHook: route(rateLimitPresets.apiWrite, async (request) => {
      const { hookId, manageToken } = await body(request, manageHookSchema);
      await deps.hooks.remove(hookId, manageToken);
      return json({ removed: true });
    }),
    /** The hook's current expiry, which calls to it may have extended since the page last saw it. */
    hookStatus: route(rateLimitPresets.apiRead, async (request) => {
      const { hookId, manageToken } = await body(request, manageHookSchema);
      return json(addedHookDeviceSchema.parse(await deps.hooks.status(hookId, manageToken)));
    }),
    /**
     * Called by the person's own device or service, so there is no origin to check: the secret URL
     * is the credential. Only POST is accepted, so a link preview or crawler that opens the URL
     * cannot raise an alert.
     */
    receiveHook: route<Params<'token'>>(rateLimitPresets.apiWrite, async (request, context) => {
      const token = parse(triggerTokenSchema, (await context.params).token);
      const text = await readTextBody(request, HOOK_BODY_MAX_BYTES);
      const result = await deps.hooks.receive(token, readHookMessage(request.headers.get('content-type'), text));
      return json(result, 202);
    }),

    createResults: route(rateLimitPresets.apiWrite, async (request) => {
      const { passphrase, days, content } = await body(request, createResultsSchema, RESULTS_BODY_MAX_BYTES);
      return json(await deps.results.create(passphrase, days, content), 201);
    }),
    getResults: route<Params<'id'>>(rateLimitPresets.apiRead, async (_request, context) => {
      const id = parse(resultsIdSchema, (await context.params).id);
      return json(await deps.results.get(id));
    }),
    updateResults: route<Params<'id'>>(rateLimitPresets.apiWrite, async (request, context) => {
      const id = parse(resultsIdSchema, (await context.params).id);
      const { passphrase, content } = await body(request, updateResultsSchema, RESULTS_BODY_MAX_BYTES);
      return json(await deps.results.update(id, passphrase, content, getClientIp(request)));
    }),
    deleteResults: route<Params<'id'>>(rateLimitPresets.apiWrite, async (request, context) => {
      const id = parse(resultsIdSchema, (await context.params).id);
      const { passphrase } = await body(request, deleteResultsSchema);
      await deps.results.remove(id, passphrase, getClientIp(request));
      return json({ removed: true });
    }),

    cronBearAlerts: cron(() => deps.bear.run()),
    cronCourseWatch: cron(() => deps.course.run()),
    cronReturnAlerts: cron(() => deps.returns.run()),
  };
}
