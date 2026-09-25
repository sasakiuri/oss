import 'server-only';

import { z } from 'zod';

import {
  RETURN_MAX_DAYS,
  RETURN_WATCHERS_MAX,
  returnStatus,
  scheduleDueAt,
  stepReturnSchedule,
} from '@/lib/return-alert';
import type { PushSubscriptionData } from '@/lib/schemas/push';
import type { ReturnPlanView } from '@/lib/schemas/return-alert';
import { secretsEqual } from '@/lib/server/guards';
import { RequestError } from '@/lib/server/http';
import { createToken, hashToken } from '@/lib/server/secrets';
import { STORE_CALL_WORST_MS, withinLimit, type LabsStore } from '@/lib/server/store';

import { eachLimited, withCronLock } from './cron-lock';
import { safeJson, type Language, type PushService } from './push';

/*
 * The design, kept deliberately small:
 *
 * - Everything that changes a plan or sends for it — the scheduled check, the return or cancel,
 *   a new return time, a new watcher — runs under one lock per plan. Two of them never interleave,
 *   so the messages for a plan go out in the order its states change: an ending can only follow
 *   an alert that has finished sending, never overtake it or be overtaken by it.
 * - The lock outlives its holder: it lasts 180 s, a person's request stops at 60 s (`maxDuration`),
 *   and the check holds a plan at most `RETURN_RUN_TIMING.planHoldWorstMs` even when every store
 *   call and push runs to its timeout. A holder sends only after checking it still holds the lock,
 *   and starts no read or send more than 90 s after taking it. Sends are awaited to the end.
 * - What to send is written to the plan's outbox in the same write that calls for it — an alert with
 *   the next stage, the return or cancel with the ending — and removed after sending. A holder that
 *   stops half-way leaves it there; the next check sends it (at least once). Devices it did not reach
 *   stay in the outbox, up to three tries each; a device there was no time for keeps its tries.
 * - An ended plan is kept, stripped of its note and devices, for a day: pressing the return again
 *   is answered as done rather than as an error.
 * - A plan is made in two steps. Creating it stores it unarmed for ten minutes: it is not scheduled
 *   and sends nothing. The page saves the keys it was given and then arms it, which schedules it.
 *   If the answer to the creation is lost, the page simply makes a new plan and the first one
 *   expires unarmed, having told no one; arming is idempotent, so a lost answer to it is repaired
 *   by arming again. Until it is armed it is not a plan for anyone else: it cannot be watched,
 *   read or moved, and cancelling it tells no one. A plan whose return time passed before it was
 *   armed is refused, so it can never be armed straight into an overdue alert.
 * - Every write of a plan also sets its place in the schedule and in the count of held plans, in
 *   one step. The count is scored by when the plan's record expires, so it follows every change of
 *   the plan's life (arming, a new return time, an ending) and frees the place when the record goes.
 * - Writes are still compare and set, so a stale holder cannot overwrite a newer state.
 * - The scheduled check starts every due plan of its batch at once. Their sends share the push
 *   service's places round the plans, one each in turn, so plans whose devices stall cannot keep a
 *   later plan waiting: each plan's first device is tried within the first rounds. Devices there was
 *   no time for stay in the outbox, without using up an attempt, and plans still due keep their
 *   scores, so the next check takes them first, the longest overdue first.
 */

const alertKindSchema = z.enum(['remind', 'overdue']);
type AlertKind = z.infer<typeof alertKindSchema>;
const endingSchema = z.enum(['returned', 'cancelled']);
type Ending = z.infer<typeof endingSchema>;

const planSchema = z.object({
  ownerTokenHash: z.string(),
  watchTokenHash: z.string(),
  stage: z.enum(['waiting', 'reminded', 'overdue']),
  returnAt: z.number(),
  graceMinutes: z.number(),
  overdueAlerts: z.number(),
  note: z.string(),
  ownerSubscriptions: z.array(z.string()),
  watcherSubscriptions: z.array(z.string()),
  outbox: z
    .object({
      kind: z.union([alertKindSchema, endingSchema]),
      /** Each device still to be told, with the tries it has already failed. */
      recipients: z.array(z.object({ id: z.string(), attempts: z.number() })),
    })
    .nullable(),
  /** Set by the return or cancel; the plan then only delivers its outbox. */
  ending: endingSchema.nullable(),
  /** False until the page has saved the keys and armed the plan; only an armed plan is scheduled. */
  armed: z.boolean(),
  /** The device the plan was made from; it may have at most `OWNER_ARMED_MAX` plans armed at once. */
  owner: z.string(),
});
type Plan = z.infer<typeof planSchema>;

const planKey = (id: string) => `labs:return:plan:${id}`;
const lockKey = (id: string) => `labs:return:lock:${id}`;
const DUE_KEY = 'labs:return:due';
// A plan is deleted this long after its last possible alert, whether or not anyone pressed a button.
const KEEP_AFTER_MS = 24 * 60 * 60 * 1000;
/** Due plans the check takes in one run, all started at once. */
const DUE_BATCH = 100;
/** The check starts no plan this long after it began. */
const START_BY_MS = 60_000;
/** How long a push service may take with one of the check's sends, so a stalled one cannot hold the run. */
const SEND_TIMEOUT_MS = 5_000;
/** No read or send for a plan is started this long after its lock was taken. */
const SEND_WINDOW_MS = 90_000;
/** Longer than any holder keeps it (see `RETURN_RUN_TIMING`), so it lapses only for a dead process. */
const LOCK_SECONDS = 180;
/** The check's own lock: longer than the route may run (280 s), shorter than the 5 minutes between runs. */
const CRON_LOCK_SECONDS = 290;

/**
 * The longest the check can take, with every store call (`STORE_CALL_WORST_MS`) and every push
 * running to its timeout. A plan is held for its reads and writes before sending (three calls), then
 * until the send window closes, then for the last read or send started in it and its clean-up, the
 * final write and the unlock. The run adds taking the lock before a plan started at the last moment,
 * the reschedule of a plan that failed, and freeing its own lock. Tests hold these against the route's
 * `maxDuration` and the locks.
 */
const planHoldWorstMs =
  Math.max(SEND_WINDOW_MS, 3 * STORE_CALL_WORST_MS) + SEND_TIMEOUT_MS + STORE_CALL_WORST_MS + 2 * STORE_CALL_WORST_MS;
export const RETURN_RUN_TIMING = {
  planHoldWorstMs,
  // The last batch read, taking a plan's lock, the plan, its reschedule, freeing the check's lock.
  runWorstMs: START_BY_MS + 2 * STORE_CALL_WORST_MS + planHoldWorstMs + 2 * STORE_CALL_WORST_MS,
  planLockSeconds: LOCK_SECONDS,
  cronLockSeconds: CRON_LOCK_SECONDS,
} as const;
const ENDED_KEEP_SECONDS = 24 * 60 * 60;
/** How long a plan waits to be armed before it expires unannounced. */
const UNARMED_SECONDS = 10 * 60;
/** Plans held at once across the service, armed, unarmed or ended, so anonymous creation cannot fill Redis. */
const PLANS_KEY = 'labs:return:plans';
const PLANS_MAX = 5_000;
/** How long a person's request waits for the check to finish with the plan. */
const LOCK_WAIT_MS = 20_000;
const SEND_ATTEMPTS = 3;
/** Plans made per day across the service, so anonymous creation cannot fill the database. */
const PLANS_PER_DAY = { max: 2000, windowSeconds: 86_400 };
/** Plans made per day from one address. */
const PLANS_PER_ADDRESS_PER_DAY = { max: 10, windowSeconds: 86_400 };
/** Plans armed at once for one device, so one person cannot fill the check's queue. */
const OWNER_ARMED_MAX = 3;
const ownerKey = (subscriptionId: string) => `labs:return:owner:${subscriptionId}`;

const formatTime = (ms: number, language: Language) =>
  new Intl.DateTimeFormat(language === 'ja' ? 'ja-JP' : 'en-GB', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ms);

export function createReturnAlerts(dependencies: {
  store: () => LabsStore;
  push: PushService;
  now?: () => number;
  /** Waits between lock attempts; tests keep the real timer. */
  sleep?: (ms: number) => Promise<void>;
}) {
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const store = () => dependencies.store();

  const notFound = () =>
    new RequestError(404, '入山計画が見つかりません。終了したか、期限を過ぎて削除された可能性があります。');

  type Lease = { planId: string; owner: string; acquiredAt: number };

  /** Runs `work` holding the plan's lock; `wait` false gives up at once if another holder has it. */
  async function withPlanLock<T>(
    planId: string,
    wait: boolean,
    work: (lease: Lease) => Promise<T>,
  ): Promise<T | undefined> {
    const owner = createToken(16);
    const started = Date.now();
    while (!(await store().set(lockKey(planId), owner, { ttlSeconds: LOCK_SECONDS, onlyIfAbsent: true }))) {
      if (!wait) return undefined;
      if (Date.now() - started > LOCK_WAIT_MS) {
        throw new RequestError(409, '計画を処理中です。少し待ってからもう一度お試しください。');
      }
      await sleep(100);
    }
    try {
      return await work({ planId, owner, acquiredAt: now() });
    } finally {
      await store().deleteIfEquals(lockKey(planId), owner);
    }
  }

  /** Refuses to send unless the lease is recent enough and still ours (a fence against stale holders). */
  async function assertHeld(lease: Lease) {
    if (now() - lease.acquiredAt > SEND_WINDOW_MS || (await store().get(lockKey(lease.planId))) !== lease.owner) {
      throw new RequestError(409, '計画の処理が中断されました。もう一度お試しください。');
    }
  }

  /** Thrown for a stored plan that does not match the current format; it is reported, not skipped. */
  class InvalidPlanError extends Error {}

  async function read(planId: string): Promise<{ plan: Plan; raw: string } | null> {
    const raw = await store().get(planKey(planId));
    if (raw === null) return null;
    const parsed = planSchema.safeParse(safeJson(raw));
    if (!parsed.success) throw new InvalidPlanError(planId);
    return { plan: parsed.data, raw };
  }

  /**
   * A live, armed plan; an ended one is gone for everything but pressing the return again, and an
   * unarmed one is not registered yet for anything but arming it (`unarmed`).
   */
  async function load(planId: string, options: { unarmed?: boolean } = {}): Promise<{ plan: Plan; raw: string }> {
    const found = await read(planId);
    if (!found || found.plan.ending || (!found.plan.armed && !options.unarmed)) throw notFound();
    return found;
  }

  const ttlFor = (plan: Plan) => {
    if (plan.ending) return ENDED_KEEP_SECONDS;
    if (!plan.armed) return UNARMED_SECONDS;
    const lastAlert = plan.returnAt + (plan.graceMinutes + 3 * 60) * 60_000;
    return Math.max(60, Math.ceil((lastAlert + KEEP_AFTER_MS - now()) / 1000));
  };

  /** A plan with something in its outbox is due now; otherwise at its next step, or never. */
  const dueAt = (plan: Plan) => (!plan.armed ? null : plan.outbox ? now() : plan.ending ? null : scheduleDueAt(plan));

  /** Puts the schedule back in line with a plan that has not changed. */
  async function schedule(planId: string, plan: Plan) {
    const at = dueAt(plan);
    if (at === null) await store().zRem(DUE_KEY, planId);
    else await store().zAdd(DUE_KEY, at, planId);
  }

  /**
   * Writes a plan with its place in the schedule and in the count of held plans in one step, over
   * the version read (null: a new plan, refused when the count is full). The plan, the schedule and
   * the count can then never disagree, whatever stops in between. False: the plan changed meanwhile.
   */
  async function write(planId: string, found: { raw: string } | null, next: Plan) {
    const result = await store().writeScheduled(
      planKey(planId),
      found?.raw ?? null,
      JSON.stringify(next),
      ttlFor(next),
      {
        member: planId,
        schedule: { key: DUE_KEY, score: dueAt(next) },
        held: { key: PLANS_KEY, max: PLANS_MAX, now: now() },
        owner: { key: ownerKey(next.owner), max: OWNER_ARMED_MAX, active: next.armed && !next.ending },
      },
    );
    if (result === 'full') throw new RequestError(503, 'ただいま登録できる計画の数が上限に達しています。');
    if (result === 'ownerFull') {
      throw new RequestError(
        409,
        `この端末で見守り中の入山計画は ${OWNER_ARMED_MAX} 件までです。終わった計画を帰着・取消してから登録してください。`,
      );
    }
    return result === 'written';
  }

  function view(plan: Plan): ReturnPlanView {
    return {
      returnAt: new Date(plan.returnAt).toISOString(),
      graceMinutes: plan.graceMinutes,
      note: plan.note,
      watchers: plan.watcherSubscriptions.length,
      status: returnStatus(plan, now()),
    };
  }

  function checkReturnAt(returnAt: string): number {
    const ms = Date.parse(returnAt);
    if (ms <= now() + 60_000) throw new RequestError(400, '帰着予定は現在より後の時刻にしてください。');
    if (ms > now() + RETURN_MAX_DAYS * 86_400_000) {
      throw new RequestError(400, `帰着予定は ${RETURN_MAX_DAYS} 日以内にしてください。`);
    }
    return ms;
  }

  function authorize(plan: Plan, token: string, role: 'owner' | 'any') {
    const hash = hashToken(token);
    const owner = secretsEqual(hash, plan.ownerTokenHash);
    if (!owner && (role === 'owner' || !secretsEqual(hash, plan.watchTokenHash))) {
      throw new RequestError(403, '計画を確認できませんでした。');
    }
  }

  const message = (plan: Plan, kind: AlertKind | Ending) => (language: Language) => {
    const time = formatTime(plan.returnAt, language);
    const note = plan.note ? (language === 'ja' ? `（${plan.note}）` : ` (${plan.note})`) : '';
    const ja = {
      remind: [
        '帰着予定の時刻です',
        `予定 ${time}。戻ったら「帰着した」を押してください。押さないと見守りの人に通知します。`,
      ],
      overdue: [
        '帰着の連絡がありません',
        `帰着予定 ${time} を過ぎても帰着の操作がありません${note}。連絡を取り、必要なら救助を要請してください。`,
      ],
      returned: ['帰着しました', `帰着予定 ${time} の入山計画で、帰着の操作がありました${note}。`],
      cancelled: ['入山計画が取り消されました', `帰着予定 ${time} の入山計画は取り消されました${note}。`],
    } as const;
    const en = {
      remind: [
        'Time to be back',
        `Planned return ${time} JST. Press “I’m back” once you are, or your watchers will be alerted.`,
      ],
      overdue: [
        'No word of return',
        `The planned return ${time} JST has passed without the return button${note}. Try to reach them and call for help if needed.`,
      ],
      returned: ['Back safely', `The return button was pressed for the plan due back at ${time} JST${note}.`],
      cancelled: ['Plan cancelled', `The plan due back at ${time} JST was cancelled${note}.`],
    } as const;
    const [title, body] = (language === 'ja' ? ja : en)[kind];
    // An overdue alert and the plan's ending share a tag, so the ending replaces the alert on screen.
    return { title, body, url: '/labs/return-alert', tag: kind === 'remind' ? 'return-remind' : 'return-status' };
  };

  const untried = (ids: string[]) => ids.map((id) => ({ id, attempts: 0 }));

  const recipientsFor = (plan: Plan, kind: AlertKind | Ending) =>
    kind === 'remind'
      ? plan.ownerSubscriptions
      : kind === 'overdue'
        ? [...plan.ownerSubscriptions, ...plan.watcherSubscriptions]
        : plan.watcherSubscriptions;

  /**
   * Sends the plan's outbox under the lease and records what is left. An ended plan whose ending
   * has gone out keeps only a bare record of the ending.
   */
  async function deliver(planId: string, found: { plan: Plan; raw: string }, lease: Lease) {
    const outbox = found.plan.outbox;
    if (!outbox) return null;
    await assertHeld(lease);
    const result = await dependencies.push.notify(
      outbox.recipients.map((recipient) => recipient.id),
      message(found.plan, outbox.kind),
      {
        ttlSeconds: outbox.kind === 'remind' ? 60 * 60 : outbox.kind === 'overdue' ? 6 * 60 * 60 : 12 * 60 * 60,
        urgency: outbox.kind === 'returned' || outbox.kind === 'cancelled' ? 'normal' : 'high',
        timeoutMs: SEND_TIMEOUT_MS,
        sendBy: lease.acquiredAt + SEND_WINDOW_MS,
      },
    );
    // A try that failed uses up an attempt; devices there was no time for are kept without one.
    const triedBefore = new Map(outbox.recipients.map((recipient) => [recipient.id, recipient.attempts]));
    const kept = [
      ...result.failedIds
        .map((id) => ({ id, attempts: (triedBefore.get(id) ?? 0) + 1 }))
        .filter((recipient) => recipient.attempts < SEND_ATTEMPTS),
      ...result.skippedIds.map((id) => ({ id, attempts: triedBefore.get(id) ?? 0 })),
    ];
    const remaining = kept.length > 0 ? { kind: outbox.kind, recipients: kept } : null;
    // Devices found gone are dropped in the same write, so the plan counts only devices that exist
    // and a gone watcher's place can be taken by a new one.
    const live = (ids: string[]) => ids.filter((id) => !result.goneIds.includes(id));
    const next: Plan =
      found.plan.ending && !remaining
        ? { ...found.plan, outbox: null, note: '', ownerSubscriptions: [], watcherSubscriptions: [] }
        : {
            ...found.plan,
            outbox: remaining,
            ownerSubscriptions: live(found.plan.ownerSubscriptions),
            watcherSubscriptions: live(found.plan.watcherSubscriptions),
          };
    await write(planId, found, next);
    return outbox;
  }

  /** One plan's turn in the check, under its lock. */
  async function process(
    planId: string,
    lease: Lease,
    counts: { reminded: number; alerted: number; retried: number; ended: number },
  ) {
    let found = await read(planId);
    if (!found) {
      await store().zRem(DUE_KEY, planId);
      return;
    }
    // Move to the next stage and put its alert in the outbox, in one write.
    if (!found.plan.outbox) {
      if (found.plan.ending) {
        await store().zRem(DUE_KEY, planId);
        return;
      }
      const step = stepReturnSchedule(found.plan, now());
      if (!step.action) {
        await schedule(planId, found.plan);
        return;
      }
      const kind: AlertKind = step.action === 'remind-owner' ? 'remind' : 'overdue';
      const staged: Plan = { ...found.plan, ...step.next };
      const next: Plan = { ...staged, outbox: { kind, recipients: untried(recipientsFor(staged, kind)) } };
      if (!(await write(planId, found, next))) return;
      found = { plan: next, raw: JSON.stringify(next) };
    }
    const sent = await deliver(planId, found, lease);
    if (!sent) return;
    if (sent.recipients.some((recipient) => recipient.attempts > 0)) counts.retried += 1;
    else if (sent.kind === 'remind') counts.reminded += 1;
    else if (sent.kind === 'overdue') counts.alerted += 1;
    else counts.ended += 1;
  }

  return {
    /** Stores a new plan, unarmed: it sends nothing until `arm` is called with its owner key. */
    async create(
      subscription: PushSubscriptionData,
      language: Language,
      fields: { returnAt: string; graceMinutes: number; note: string },
      /** The caller's address, counted (hashed) against the plans one address may make a day. */
      address: string,
    ) {
      const returnAt = checkReturnAt(fields.returnAt);
      if (
        !(await withinLimit(store(), `create:plans:address:${hashToken(address)}`, PLANS_PER_ADDRESS_PER_DAY, now()))
      ) {
        throw new RequestError(429, 'この接続からの本日の登録数の上限に達しました。');
      }
      if (!(await withinLimit(store(), 'create:plans', PLANS_PER_DAY, now()))) {
        throw new RequestError(429, '本日の登録数の上限に達しました。');
      }
      const planId = createToken(16);
      const { id: ownerSubscription } = await dependencies.push.save(subscription, language);
      const ownerToken = createToken();
      const watchToken = createToken();
      const plan: Plan = {
        ownerTokenHash: hashToken(ownerToken),
        watchTokenHash: hashToken(watchToken),
        stage: 'waiting',
        returnAt,
        graceMinutes: fields.graceMinutes,
        overdueAlerts: 0,
        note: fields.note,
        ownerSubscriptions: [ownerSubscription],
        watcherSubscriptions: [],
        outbox: null,
        ending: null,
        armed: false,
        owner: ownerSubscription,
      };
      if (!(await write(planId, null, plan))) throw new RequestError(409, 'もう一度お試しください。');
      return { planId, ownerToken, watchToken, plan: view(plan) };
    },

    /**
     * Schedules a plan whose keys the page has saved. Arming an armed plan is answered as done; a
     * plan whose return time has already passed is refused (410), since arming it would alert at once.
     */
    async arm(planId: string, token: string) {
      authorize((await load(planId, { unarmed: true })).plan, token, 'owner');
      const plan = await withPlanLock(planId, true, async () => {
        const found = await load(planId, { unarmed: true });
        if (found.plan.armed) return found.plan;
        if (found.plan.returnAt <= now()) {
          throw new RequestError(410, '帰着予定を過ぎたため登録していません。帰着予定を入れ直して登録してください。');
        }
        const next: Plan = { ...found.plan, armed: true };
        if (!(await write(planId, found, next))) throw new RequestError(409, 'もう一度お試しください。');
        return next;
      });
      if (!plan) throw notFound();
      return view(plan);
    },

    /** A watcher (a companion, or the owner's other device) asks to be told. */
    async watch(planId: string, token: string, subscription: PushSubscriptionData, language: Language) {
      authorize((await load(planId)).plan, token, 'any');
      const { id } = await dependencies.push.save(subscription, language);
      const plan = await withPlanLock(planId, true, async () => {
        const found = await load(planId);
        if (found.plan.watcherSubscriptions.includes(id) || found.plan.ownerSubscriptions.includes(id)) {
          return found.plan;
        }
        if (found.plan.watcherSubscriptions.length >= RETURN_WATCHERS_MAX) {
          throw new RequestError(409, `見守りの端末は ${RETURN_WATCHERS_MAX} 台までです。`);
        }
        const next = { ...found.plan, watcherSubscriptions: [...found.plan.watcherSubscriptions, id] };
        if (!(await write(planId, found, next))) throw new RequestError(409, 'もう一度お試しください。');
        return next;
      });
      if (!plan) throw notFound();
      return view(plan);
    },

    async status(planId: string, token: string) {
      const { plan } = await load(planId);
      authorize(plan, token, 'any');
      return view(plan);
    },

    /** Moves the return time; the reminders start over and a pending alert is dropped. */
    async update(planId: string, token: string, returnAt: string) {
      authorize((await load(planId)).plan, token, 'owner');
      const ms = checkReturnAt(returnAt);
      const plan = await withPlanLock(planId, true, async () => {
        const found = await load(planId);
        const next: Plan = { ...found.plan, returnAt: ms, stage: 'waiting', overdueAlerts: 0, outbox: null };
        if (!(await write(planId, found, next))) throw new RequestError(409, 'もう一度お試しください。');
        return next;
      });
      if (!plan) throw notFound();
      return view(plan);
    },

    /**
     * The owner returns or cancels. The ending and its message to the watchers are written in one
     * step, then sent; if the request stops in between, the next check sends it. Pressing it again
     * on an ended plan is answered as done. An unarmed plan was never registered, so it ends quietly.
     */
    async finish(planId: string, token: string, kind: Ending) {
      const first = await read(planId);
      if (!first) throw notFound();
      authorize(first.plan, token, 'owner');
      if (first.plan.ending) {
        // Already ended. If its message is still waiting, make sure the next check picks it up.
        if (first.plan.outbox) await store().zAdd(DUE_KEY, now(), planId);
        return;
      }
      await withPlanLock(planId, true, async (lease) => {
        const found = await read(planId);
        if (!found) throw notFound();
        if (found.plan.ending) return;
        const next: Plan = found.plan.armed
          ? { ...found.plan, ending: kind, outbox: { kind, recipients: untried(recipientsFor(found.plan, kind)) } }
          : { ...found.plan, ending: kind, outbox: null, note: '', ownerSubscriptions: [], watcherSubscriptions: [] };
        if (!(await write(planId, found, next))) {
          // Written but unacknowledged, or changed meanwhile: only an ending counts as done.
          if ((await read(planId))?.plan.ending) return;
          throw new RequestError(409, 'もう一度お試しください。');
        }
        await deliver(planId, { plan: next, raw: JSON.stringify(next) }, lease);
      });
    },

    /** The scheduled job, every five minutes. */
    async run() {
      const started = now();
      const locked = await withCronLock(store(), 'return-alerts', CRON_LOCK_SECONDS, async () => {
        const counts = {
          reminded: 0,
          alerted: 0,
          retried: 0,
          ended: 0,
          busy: 0,
          errors: 0,
          deferred: 0,
          invalid: 0,
        };
        // Batch after batch while there is time to start plans. Plans already taken in this run are
        // left out: one with devices there was no time for is due again at once.
        const taken = new Set<string>();
        while (now() - started <= START_BY_MS) {
          // '-inf' is Redis's own bound: JSON has no infinity, and a null bound is an invalid command.
          // Lowest score first: the longest overdue, including those an earlier check had no time for.
          const rows = await store().zRangeWithScores(DUE_KEY, '-inf', now(), DUE_BATCH + taken.size);
          const due = rows.filter((row) => !taken.has(row.member)).slice(0, DUE_BATCH);
          if (due.length === 0) break;
          for (const row of due) taken.add(row.member);
          await eachLimited(due, DUE_BATCH, (row) => checkOne(row.member));
        }
        return counts;

        async function checkOne(planId: string) {
          if (now() - started > START_BY_MS) {
            // Left due, so the next check takes them first.
            counts.deferred += 1;
            return;
          }
          try {
            // A plan a person is changing right now is left for the next check.
            const done = await withPlanLock(planId, false, async (lease) => {
              await process(planId, lease, counts);
              return true;
            });
            if (!done) counts.busy += 1;
          } catch (error) {
            // One plan that cannot be processed must not stop the others, nor stay at the head of
            // the queue: it is looked at again on a later check. A plan stored in a format this
            // version does not read is counted separately, so it shows in the job's result.
            if (error instanceof InvalidPlanError) counts.invalid += 1;
            else counts.errors += 1;
            await store()
              .zAdd(DUE_KEY, now() + 5 * 60_000, planId)
              .catch(() => undefined);
          }
        }
      });
      return locked.ran ? locked.result : 'locked';
    },
  };
}
