import 'server-only';

import { errors, Redis } from '@upstash/redis';

import { RequestError } from './http';

/** A sorted-set score bound. Infinite bounds are Redis's strings: JSON has no infinity. */
export type ScoreBound = number | '-inf' | '+inf';

/**
 * The Redis operations the Labs server features use. Values are strings: every reader parses and
 * validates what it gets back. Every key expires; indexes are sorted sets scored by expiry and
 * pruned before they are read. Operations that must not interleave are single Lua scripts.
 */
export interface LabsStore {
  get(key: string): Promise<string | null>;
  /** Returns false when `onlyIfAbsent` is set and the key already exists. */
  set(key: string, value: string, options: { ttlSeconds: number; onlyIfAbsent?: boolean }): Promise<boolean>;
  /**
   * Stores a record and lists it in an index scored by expiry, in one step: expired members are
   * pruned first, and a new member is refused ('full') when the index already holds `max`. With
   * `expected`, the record is written only if it still holds that value (null: only if it does not
   * exist), and otherwise left alone ('changed').
   */
  putIndexed(
    record: IndexedRecord & {
      value: string;
      ttlSeconds: number;
      max: number;
      pruneUpTo: number;
      expected?: string | null;
    },
  ): Promise<'written' | 'full' | 'changed'>;
  /** Deletes a record and its index entry in one step; with `expected`, only if the record still holds it. */
  deleteIndexed(record: IndexedRecord & { expected?: string }): Promise<boolean>;
  /**
   * Compare and set that also renews other indexed records in the same step: each of
   * `renew.members` whose record still exists gets `ttlSeconds` again and its index score updated.
   */
  compareAndSetRenewing(
    key: string,
    expected: string,
    next: string,
    ttlSeconds: number,
    renew: { indexKey: string; members: readonly { key: string; member: string; score: number }[] },
  ): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  /** Seconds until the key expires: -2 when it does not exist, -1 when it has no expiry. */
  ttlSeconds(key: string): Promise<number>;
  /** Renews several keys in one step; missing keys are left missing. */
  expireMany(keys: readonly string[], ttlSeconds: number): Promise<void>;
  /**
   * Writes a record, its entry in a schedule and its entry in a count of held records in one step:
   * only if the record still holds `expected` (null: only if it does not exist), then sets the
   * member's schedule score, or removes it when `score` is null, and scores it in `held` by when
   * the record expires (`now` plus its lifetime). A new record is refused ('full') when `held`
   * already counts `max` records that have not expired by `now`. The record is also listed, scored
   * the same way, in `owner` while `active`, and taken out of it otherwise; becoming active is
   * refused ('ownerFull') when `owner` already lists `max` live records. The record, its schedule
   * and its counts can then never disagree, whatever stops in between.
   */
  writeScheduled(
    key: string,
    expected: string | null,
    next: string,
    ttlSeconds: number,
    entries: {
      member: string;
      schedule: { key: string; score: number | null };
      held: { key: string; max: number; now: number };
      owner: { key: string; max: number; active: boolean };
    },
  ): Promise<'written' | 'changed' | 'full' | 'ownerFull'>;
  /** Replaces the value only if it is still `expected`, in one step. */
  compareAndSet(key: string, expected: string, next: string, ttlSeconds: number): Promise<boolean>;
  /** Deletes the key only if it still holds `value`, in one step. */
  deleteIfEquals(key: string, value: string): Promise<boolean>;
  /** Increments a counter, setting its expiry when it is created. Returns the new count. */
  increment(key: string, ttlSeconds: number): Promise<number>;
  zAdd(key: string, score: number, member: string): Promise<void>;
  /**
   * Removes members scored at or below `pruneUpTo`, then adds or updates `member` unless that would
   * take the set past `max` members. One step, so concurrent callers cannot overshoot the limit.
   */
  zAddCapped(key: string, score: number, member: string, max: number, pruneUpTo: number): Promise<boolean>;
  zRem(key: string, member: string): Promise<void>;
  /** Up to `count` members with `min <= score <= max`, lowest first, with their scores. */
  zRangeWithScores(
    key: string,
    min: ScoreBound,
    max: ScoreBound,
    count: number,
  ): Promise<{ member: string; score: number }[]>;
  zRemoveUpTo(key: string, max: number): Promise<void>;
  /**
   * Up to `count` members after the cursor (score, member) in Redis's own order (score, then member),
   * with their scores as Redis writes them; from the start when `after` is null. The script finds the
   * cursor's rank (placing the cursor member there for the moment if it has moved or gone) and reads
   * by rank, so it is exact and costs the same however many members share a score.
   */
  zPageAfter(
    key: string,
    after: { score: string; member: string } | null,
    count: number,
  ): Promise<{ member: string; score: string }[]>;
  /** Sets a hash field and the hash's absolute expiry together. */
  hSetUntil(key: string, field: string, value: string, expireAtMs: number): Promise<void>;
  /** As `hSetUntil`, but only while the hash has fewer than `max` fields (or already has this one). */
  hSetCapped(key: string, field: string, value: string, max: number, expireAtMs: number): Promise<boolean>;
  hDel(key: string, field: string): Promise<void>;
  hGetAll(key: string): Promise<Record<string, string>>;
}

interface StoreEnvironment {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}

/** A record and its entry in an index sorted by expiry. */
export interface IndexedRecord {
  key: string;
  indexKey: string;
  member: string;
  score: number;
}

/**
 * A score for an expiry index that is, in practice, unique: the expiry in milliseconds plus a
 * fraction from the member. Readers page by score, and ties would make them read members again.
 */
export function indexScore(expiresAtMs: number, member: string): number {
  let hash = 0;
  for (const character of member) hash = (hash * 31 + character.charCodeAt(0)) % 1000;
  return Math.floor(expiresAtMs) + hash / 1000;
}

/** How long one Upstash request may take before it is abandoned. */
export const REQUEST_TIMEOUT_MS = 5_000;
/** Tries after the first, for a request that timed out or never reached Upstash. */
const REQUEST_RETRIES = 2;
/** The wait before retry `count` (0 for the first retry). */
const retryBackoff = (count: number) => 100 * 2 ** count;
/**
 * The longest one store call can take: every try running to its timeout, with the waits between.
 * Callers with a deadline (the return check) plan with this.
 */
export const STORE_CALL_WORST_MS =
  REQUEST_TIMEOUT_MS * (REQUEST_RETRIES + 1) +
  Array.from({ length: REQUEST_RETRIES }, (_, count) => retryBackoff(count)).reduce((a, b) => a + b, 0);

/**
 * How each operation is tried again when a try times out or cannot reach Upstash, so that its
 * answer is lost although Redis may have run it. An answer from Redis, even an error, is final.
 *
 * - `retry`: run again. Reads, and writes that leave the same state however often they run.
 * - `verify`: read the key back once. If the write is already there it is reported as done; if the
 *   state is still the one it was written over, it is run once more; otherwise it lost to another
 *   writer. Conditional writes (locks, compare and set, the scripts that check a value first). A
 *   write that would leave its record as it was (the same value, or no condition at all) cannot be
 *   told from one that never ran, and is run again instead, which leaves the same state.
 * - `once`: never run again. A counter would count the call twice.
 *
 * Every operation makes at most three requests, so one takes at most `STORE_CALL_WORST_MS`.
 */
export const STORE_RETRY_POLICY = {
  get: 'retry',
  ttlSeconds: 'retry',
  zRangeWithScores: 'retry',
  // Its script puts the cursor in the set and takes it out again: running it twice changes nothing.
  zPageAfter: 'retry',
  hGetAll: 'retry',
  del: 'retry',
  expireMany: 'retry',
  zAdd: 'retry',
  zRem: 'retry',
  zRemoveUpTo: 'retry',
  hDel: 'retry',
  hSetUntil: 'retry',
  // Run again, they find their own member already counted and write the same value.
  hSetCapped: 'retry',
  zAddCapped: 'retry',
  set: 'verify',
  putIndexed: 'verify',
  deleteIndexed: 'verify',
  compareAndSet: 'verify',
  compareAndSetRenewing: 'verify',
  deleteIfEquals: 'verify',
  writeScheduled: 'verify',
  increment: 'once',
} as const satisfies Record<keyof LabsStore, 'retry' | 'verify' | 'once'>;

/** A failure after which Redis may or may not have run the command: a timeout or a lost connection. */
const answerLost = (error: unknown) => !(error instanceof errors.UpstashError);
const pause = (count: number) => new Promise((resolve) => setTimeout(resolve, retryBackoff(count)));

/** What reading a conditional write's key back says about it: done (with its result), or run it again. */
type Settled<T> = { done: T } | 'again';

/** The Lua scripts, exported so the test double can recognise and emulate each one. */
export const SCRIPTS = {
  putIndexed: `if ARGV[7] ~= '' then
  local current = redis.call('GET', KEYS[1])
  if ARGV[7] == '0' then
    if current then return -1 end
  elseif current ~= ARGV[8] then
    return -1
  end
end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[5])
if redis.call('ZSCORE', KEYS[2], ARGV[1]) == false and redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[4]) then return 0 end
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[1])
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[6])
return 1`,
  deleteIndexed: `if ARGV[2] ~= '' and redis.call('GET', KEYS[1]) ~= ARGV[2] then return 0 end
redis.call('DEL', KEYS[1]) redis.call('ZREM', KEYS[2], ARGV[1]) return 1`,
  compareAndSetRenewing: `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
for i = 3, #KEYS do
  if redis.call('EXISTS', KEYS[i]) == 1 then
    redis.call('EXPIRE', KEYS[i], ARGV[3])
    redis.call('ZADD', KEYS[2], ARGV[4 + (i - 3) * 2 + 1], ARGV[4 + (i - 3) * 2])
  end
end
return 1`,
  expireMany: `for i = 1, #KEYS do redis.call('EXPIRE', KEYS[i], ARGV[1]) end return #KEYS`,
  compareAndSet: `if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]) return 1 end return 0`,
  deleteIfEquals: `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`,
  increment: `local n = redis.call('INCR', KEYS[1]) if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end return n`,
  zAddCapped: `redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[4])
if redis.call('ZSCORE', KEYS[1], ARGV[2]) == false and redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2]) return 1`,
  writeScheduled: `local current = redis.call('GET', KEYS[1])
if ARGV[1] == '0' then
  if current then return 0 end
  redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', ARGV[8])
  if redis.call('ZCARD', KEYS[3]) >= tonumber(ARGV[7]) then return -1 end
elseif current ~= ARGV[2] then
  return 0
end
if ARGV[11] == '1' then
  redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', ARGV[8])
  if redis.call('ZSCORE', KEYS[4], ARGV[5]) == false and redis.call('ZCARD', KEYS[4]) >= tonumber(ARGV[10]) then return -2 end
end
redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4])
if ARGV[6] == '' then redis.call('ZREM', KEYS[2], ARGV[5]) else redis.call('ZADD', KEYS[2], ARGV[6], ARGV[5]) end
redis.call('ZADD', KEYS[3], ARGV[9], ARGV[5])
if ARGV[11] == '1' then redis.call('ZADD', KEYS[4], ARGV[9], ARGV[5]) else redis.call('ZREM', KEYS[4], ARGV[5]) end
local last = redis.call('ZRANGE', KEYS[4], -1, -1, 'WITHSCORES')
if last[2] then redis.call('PEXPIREAT', KEYS[4], last[2]) end
return 1`,
  pageAfter: `local limit = tonumber(ARGV[3])
local start = 0
if ARGV[1] ~= '' then
  local current = redis.call('ZSCORE', KEYS[1], ARGV[2])
  redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
  local rank = redis.call('ZRANK', KEYS[1], ARGV[2])
  if current then redis.call('ZADD', KEYS[1], current, ARGV[2]) else redis.call('ZREM', KEYS[1], ARGV[2]) end
  if current and tonumber(current) <= tonumber(ARGV[1]) then start = rank + 1 else start = rank end
end
return redis.call('ZRANGE', KEYS[1], start, start + limit - 1, 'WITHSCORES')`,
  hSetUntil: `redis.call('HSET', KEYS[1], ARGV[1], ARGV[2]) redis.call('PEXPIREAT', KEYS[1], ARGV[3]) return 1`,
  hSetCapped: `if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 and redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[4]) then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2]) redis.call('PEXPIREAT', KEYS[1], ARGV[3]) return 1`,
} as const;

/** HGETALL without deserialisation answers a flat `[field, value, field, value, …]` list. */
export function pairsToRecord(value: unknown): Record<string, string> {
  if (value === null || value === undefined) return {};
  if (!Array.isArray(value) || value.length % 2 !== 0) throw new Error('Unexpected HGETALL reply');
  const record: Record<string, string> = {};
  for (let index = 0; index < value.length; index += 2) record[String(value[index])] = String(value[index + 1]);
  return record;
}

export function createUpstashStore(
  credentials: { url: string; token: string },
  /** Tests turn the retries off, or shorten the time limit of each try. */
  options: { retry?: false; requestTimeoutMs?: number } = {},
): LabsStore {
  // Strings in, strings out: the client would otherwise turn stored JSON into objects unchecked.
  // Automatic pipelining is off so each call is one request, as the scripts and tests assume.
  const redis = new Redis({
    ...credentials,
    automaticDeserialization: false,
    enableTelemetry: false,
    enableAutoPipelining: false,
    // Each try gives up after 5 s. The SDK does not try again on its own (`retries: 0`; `false`
    // would still make it try twice): the adapter decides, per operation (`STORE_RETRY_POLICY`).
    signal: () => AbortSignal.timeout(options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS),
    retry: { retries: 0, backoff: () => 0 },
  });
  const retries = options.retry === false ? 0 : REQUEST_RETRIES;
  const run = async (script: string, keys: readonly string[], args: (string | number)[]) =>
    Number(await redis.eval(script, [...keys], args.map(String)));

  /** A new SDK call for each try, so each gets its own time limit. */
  async function again<T>(call: () => Promise<T>): Promise<T> {
    for (let count = 0; ; count += 1) {
      try {
        return await call();
      } catch (error) {
        if (!answerLost(error) || count >= retries) throw error;
        await pause(count);
      }
    }
  }

  /**
   * A conditional write: after a lost answer, `key` is read back once to settle whether it ran. The
   * record tells only when the write changes it; a write that leaves it as it was (`rerunnable`:
   * the same value again, to renew its lifetime or its index entries) cannot be told from one that
   * never ran, but running it again leaves the same state, so it is simply run again.
   */
  async function verified<T>(
    key: string,
    rerunnable: boolean,
    call: () => Promise<T>,
    settle: (current: string | null) => Settled<T>,
  ) {
    if (rerunnable) return again(call);
    try {
      return await call();
    } catch (error) {
      if (!answerLost(error) || retries === 0) throw error;
    }
    await pause(0);
    const settled = settle(await redis.get<string>(key));
    if (settled !== 'again') return settled.done;
    await pause(1);
    return call();
  }

  /** Each operation tried once; `STORE_RETRY_POLICY` says which of them may run again. */
  const once: Omit<LabsStore, keyof typeof conditional> = {
    get: (key) => redis.get<string>(key),
    del: async (...keys) => {
      if (keys.length > 0) await redis.del(...keys);
    },
    ttlSeconds: (key) => redis.ttl(key),
    expireMany: async (keys, ttlSeconds) => {
      if (keys.length > 0) await run(SCRIPTS.expireMany, keys, [ttlSeconds]);
    },
    increment: (key, ttlSeconds) => run(SCRIPTS.increment, [key], [ttlSeconds]),
    zAdd: async (key, score, member) => {
      await redis.zadd(key, { score, member });
    },
    zAddCapped: async (key, score, member, max, pruneUpTo) =>
      (await run(SCRIPTS.zAddCapped, [key], [score, member, max, pruneUpTo])) === 1,
    zRem: async (key, member) => {
      await redis.zrem(key, member);
    },
    zRangeWithScores: async (key, min, max, count) => {
      const flat = await redis.zrange<string[]>(key, min, max, { byScore: true, offset: 0, count, withScores: true });
      const rows: { member: string; score: number }[] = [];
      for (let index = 0; index + 1 < flat.length; index += 2) {
        rows.push({ member: String(flat[index]), score: Number(flat[index + 1]) });
      }
      return rows;
    },
    zPageAfter: async (key, after, count) => {
      const flat = (await redis.eval(
        SCRIPTS.pageAfter,
        [key],
        [after?.score ?? '', after?.member ?? '', String(count)],
      )) as string[] | null;
      const rows: { member: string; score: string }[] = [];
      for (let index = 0; flat && index + 1 < flat.length; index += 2) {
        rows.push({ member: String(flat[index]), score: String(flat[index + 1]) });
      }
      return rows;
    },
    zRemoveUpTo: async (key, max) => {
      await redis.zremrangebyscore(key, '-inf', max);
    },
    hSetUntil: async (key, field, value, expireAtMs) => {
      await run(SCRIPTS.hSetUntil, [key], [field, value, Math.ceil(expireAtMs)]);
    },
    hSetCapped: async (key, field, value, max, expireAtMs) =>
      (await run(SCRIPTS.hSetCapped, [key], [field, value, Math.ceil(expireAtMs), max])) === 1,
    hDel: async (key, field) => {
      await redis.hdel(key, field);
    },
    hGetAll: async (key) => pairsToRecord(await redis.hgetall(key)),
  };

  /** The conditional writes, each with how to tell from its key whether a lost try ran. */
  const conditional: Pick<
    LabsStore,
    | 'set'
    | 'putIndexed'
    | 'deleteIndexed'
    | 'compareAndSet'
    | 'compareAndSetRenewing'
    | 'deleteIfEquals'
    | 'writeScheduled'
  > = {
    set: (key, value, { ttlSeconds, onlyIfAbsent }) =>
      verified(
        key,
        // Only a lock is conditional; a plain write of a value may run any number of times.
        !onlyIfAbsent,
        async () =>
          (onlyIfAbsent
            ? await redis.set(key, value, { ex: ttlSeconds, nx: true })
            : await redis.set(key, value, { ex: ttlSeconds })) !== null,
        // A lock holds a value only its taker has, so finding it means this try took it.
        (current) =>
          current === value ? { done: true } : current !== null && onlyIfAbsent ? { done: false } : 'again',
      ),
    putIndexed: ({ key, indexKey, member, score, value, ttlSeconds, max, pruneUpTo, expected }) => {
      const condition = expected === undefined ? '' : expected === null ? '0' : '1';
      return verified(
        key,
        expected === undefined || expected === value,
        async () => {
          const written = await run(
            SCRIPTS.putIndexed,
            [key, indexKey],
            [member, value, score, max, pruneUpTo, ttlSeconds, condition, expected ?? ''],
          );
          return written === 1 ? ('written' as const) : written === -1 ? ('changed' as const) : ('full' as const);
        },
        (current) =>
          current === value
            ? { done: 'written' }
            : expected === undefined || current === expected
              ? 'again'
              : { done: 'changed' },
      );
    },
    deleteIndexed: ({ key, indexKey, member, expected }) =>
      verified(
        key,
        // A record already gone says nothing of its index entry; without a condition, delete again.
        expected === undefined,
        async () => (await run(SCRIPTS.deleteIndexed, [key, indexKey], [member, expected ?? ''])) === 1,
        (current) =>
          current === null
            ? { done: true }
            : expected === undefined || current === expected
              ? 'again'
              : { done: false },
      ),
    compareAndSetRenewing: (key, expected, next, ttlSeconds, renew) =>
      verified(
        key,
        expected === next,
        async () =>
          (await run(
            SCRIPTS.compareAndSetRenewing,
            [key, renew.indexKey, ...renew.members.map((item) => item.key)],
            [expected, next, ttlSeconds, ...renew.members.flatMap((item) => [item.member, item.score])],
          )) === 1,
        (current) => (current === next ? { done: true } : current === expected ? 'again' : { done: false }),
      ),
    writeScheduled: (key, expected, next, ttlSeconds, { member, schedule, held, owner }) =>
      verified(
        key,
        expected === next,
        async () => {
          const written = await run(
            SCRIPTS.writeScheduled,
            [key, schedule.key, held.key, owner.key],
            [
              expected === null ? '0' : '1',
              expected ?? '',
              next,
              ttlSeconds,
              member,
              schedule.score ?? '',
              held.max,
              held.now,
              // Scored by when the record itself expires, so the count follows every change of its life.
              held.now + ttlSeconds * 1000,
              owner.max,
              owner.active ? '1' : '0',
            ],
          );
          return written === 1
            ? ('written' as const)
            : written === -1
              ? ('full' as const)
              : written === -2
                ? ('ownerFull' as const)
                : ('changed' as const);
        },
        // The script writes the record, its schedule and its count together: the record tells for all.
        (current) => (current === next ? { done: 'written' } : current === expected ? 'again' : { done: 'changed' }),
      ),
    compareAndSet: (key, expected, next, ttlSeconds) =>
      verified(
        key,
        expected === next,
        async () => (await run(SCRIPTS.compareAndSet, [key], [expected, next, ttlSeconds])) === 1,
        (current) => (current === next ? { done: true } : current === expected ? 'again' : { done: false }),
      ),
    deleteIfEquals: (key, value) =>
      verified(
        key,
        false,
        async () => (await run(SCRIPTS.deleteIfEquals, [key], [value])) === 1,
        (current) => (current === value ? 'again' : { done: current === null }),
      ),
  };

  const store = { ...conditional } as Record<string, unknown>;
  for (const [name, operation] of Object.entries(once) as [string, (...args: unknown[]) => Promise<unknown>][]) {
    const policy = STORE_RETRY_POLICY[name as keyof typeof STORE_RETRY_POLICY];
    store[name] = policy === 'retry' ? (...args: unknown[]) => again(() => operation(...args)) : operation;
  }
  return store as unknown as LabsStore;
}

/**
 * The store for a request. Unlike rate limiting, these features cannot work without Redis, so a
 * missing configuration is an explicit 503 rather than a quiet in-memory stand-in.
 */
export function createStoreProvider(
  environment: () => StoreEnvironment = () => ({
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  }),
  create: (credentials: { url: string; token: string }) => LabsStore = createUpstashStore,
) {
  let store: LabsStore | undefined;
  return (): LabsStore => {
    if (store) return store;
    const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = environment();
    if (!url || !token) throw new RequestError(503, 'この機能は現在利用できません。');
    store = create({ url, token });
    return store;
  };
}

export const getLabsStore = createStoreProvider();

/**
 * Counts attempts in a fixed window with the store itself, so that when Redis cannot be reached
 * the attempt fails (closed) instead of being let through as the general rate limiter does.
 */
export async function withinLimit(
  store: LabsStore,
  key: string,
  limit: { max: number; windowSeconds: number },
  nowMs: number,
) {
  const { max, windowSeconds } = limit;
  const bucket = Math.floor(nowMs / 1000 / windowSeconds);
  return (await store.increment(`labs:limit:${key}:${bucket}`, windowSeconds * 2)) <= max;
}
