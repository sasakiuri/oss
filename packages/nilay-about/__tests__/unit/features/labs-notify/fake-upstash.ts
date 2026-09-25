import { AsyncLocalStorage } from 'node:async_hooks';

import { vi } from 'vitest';

import { createUpstashStore, SCRIPTS, type LabsStore } from '@/lib/server/store';

export const FAKE_UPSTASH_URL = 'https://fake-labs.upstash.io';

type Entry =
  | { kind: 'string'; value: string }
  | { kind: 'zset'; value: Map<string, number> }
  | { kind: 'hash'; value: Map<string, string> };

class RedisError extends Error {}

/** Marks the requests a test hook makes, so they do not trigger the hook again. */
const insideHook = new AsyncLocalStorage<boolean>();

/**
 * An Upstash REST endpoint in memory. The Labs code talks to it through the real
 * `@upstash/redis` client (only `fetch` is replaced), so request bodies, base64 response encoding
 * and reply shapes (HGETALL as a flat list, ZRANGE WITHSCORES as member-score pairs) are the SDK's
 * own. Commands are interpreted with Redis semantics; each Lua script the store sends is recognised
 * by its text and run as the equivalent single step.
 */
export function createFakeUpstash(now: () => number) {
  const data = new Map<string, { entry: Entry; expiresAt: number | null }>();
  const commands: unknown[][] = [];
  let failing = false;
  /** How many members the emulated scripts had to look at, as Redis would inside the script. */
  const work = { examined: 0 };
  let beforeCommand: ((command: unknown[]) => Promise<void>) | null = null;
  let rejectWhen: ((command: unknown[]) => boolean) | null = null;
  let loseReplyWhen: ((command: unknown[]) => boolean) | null = null;

  const live = (key: string) => {
    const item = data.get(key);
    if (item && item.expiresAt !== null && item.expiresAt <= now()) {
      data.delete(key);
      return undefined;
    }
    return item;
  };
  const typed = <K extends Entry['kind']>(key: string, kind: K, create: boolean) => {
    let item = live(key);
    if (!item) {
      if (!create) return undefined;
      item = { entry: { kind, value: kind === 'string' ? '' : new Map() } as Entry, expiresAt: null };
      data.set(key, item);
    }
    if (item.entry.kind !== kind)
      throw new RedisError('WRONGTYPE Operation against a key holding the wrong kind of value');
    return item.entry.value as Extract<Entry, { kind: K }>['value'];
  };
  const dropEmpty = (key: string) => {
    const item = live(key);
    if (item && item.entry.kind !== 'string' && item.entry.value.size === 0) data.delete(key);
  };
  const getString = (key: string) => (typed(key, 'string', false) as string | undefined) ?? null;
  const setString = (key: string, value: string, ttlSeconds: number | null) =>
    data.set(key, {
      entry: { kind: 'string', value },
      expiresAt: ttlSeconds === null ? null : now() + ttlSeconds * 1000,
    });
  const expire = (key: string, seconds: number) => {
    const item = live(key);
    if (!item) return 0;
    item.expiresAt = now() + seconds * 1000;
    return 1;
  };
  const bound = (value: unknown, low: boolean) => {
    const text = String(value);
    if (text === '-inf') return { value: -Infinity, open: false };
    if (text === '+inf' || text === 'inf') return { value: Infinity, open: false };
    const open = text.startsWith('(');
    const number = Number(open ? text.slice(1) : text);
    if (value === null || Number.isNaN(number))
      throw new RedisError(`ERR min or max is not a float (${low ? 'min' : 'max'})`);
    return { value: number, open };
  };
  const zSorted = (key: string) =>
    [...((typed(key, 'zset', false) as Map<string, number> | undefined) ?? new Map())].sort(
      (a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
    );
  const zRemoveRange = (key: string, max: number) => {
    const set = typed(key, 'zset', false) as Map<string, number> | undefined;
    if (!set) return 0;
    let removed = 0;
    for (const [member, score] of [...set]) {
      if (score <= max) {
        set.delete(member);
        removed += 1;
      }
    }
    dropEmpty(key);
    return removed;
  };

  function script(source: string, keys: string[], args: string[]): unknown {
    const [k1 = ''] = keys;
    const [a1 = '', a2 = '', a3 = '', a4 = ''] = args;
    switch (source) {
      case SCRIPTS.putIndexed: {
        const [, index = ''] = keys;
        const [member = '', value = '', score = '', max = '', prune = '', ttl = '', condition = '', expected = ''] =
          args;
        if (condition !== '') {
          const current = getString(k1);
          if (condition === '0' ? current !== null : current !== expected) return -1;
        }
        zRemoveRange(index, Number(prune));
        const set = typed(index, 'zset', true) as Map<string, number>;
        if (!set.has(member) && set.size >= Number(max)) {
          dropEmpty(index);
          return 0;
        }
        set.set(member, Number(score));
        setString(k1, value, Number(ttl));
        return 1;
      }
      case SCRIPTS.deleteIndexed: {
        const [, index = ''] = keys;
        if (a2 !== '' && getString(k1) !== a2) return 0;
        data.delete(k1);
        (typed(index, 'zset', false) as Map<string, number> | undefined)?.delete(a1);
        dropEmpty(index);
        return 1;
      }
      case SCRIPTS.compareAndSetRenewing: {
        if (getString(k1) !== a1) return 0;
        setString(k1, a2, Number(a3));
        const [, index = '', ...bodies] = keys;
        bodies.forEach((body, i) => {
          if (!live(body)) return;
          expire(body, Number(a3));
          (typed(index, 'zset', true) as Map<string, number>).set(args[3 + i * 2] ?? '', Number(args[4 + i * 2]));
        });
        return 1;
      }
      case SCRIPTS.expireMany:
        for (const key of keys) expire(key, Number(a1));
        return keys.length;
      case SCRIPTS.compareAndSet:
        if (getString(k1) !== a1) return 0;
        setString(k1, a2, Number(a3));
        return 1;
      case SCRIPTS.deleteIfEquals:
        if (getString(k1) !== a1) return 0;
        data.delete(k1);
        return 1;
      case SCRIPTS.increment: {
        const next = Number(getString(k1) ?? 0) + 1;
        const item = live(k1);
        if (item && item.entry.kind === 'string') item.entry.value = String(next);
        else setString(k1, String(next), null);
        if (next === 1) expire(k1, Number(a1));
        return next;
      }
      case SCRIPTS.zAddCapped: {
        zRemoveRange(k1, Number(a4));
        const set = typed(k1, 'zset', true) as Map<string, number>;
        if (!set.has(a2) && set.size >= Number(a3)) {
          dropEmpty(k1);
          return 0;
        }
        set.set(a2, Number(a1));
        return 1;
      }
      case SCRIPTS.hSetUntil: {
        (typed(k1, 'hash', true) as Map<string, string>).set(a1, a2);
        const item = live(k1);
        if (item) item.expiresAt = Number(a3);
        return 1;
      }
      case SCRIPTS.hSetCapped: {
        const hash = typed(k1, 'hash', true) as Map<string, string>;
        if (!hash.has(a1) && hash.size >= Number(a4)) {
          dropEmpty(k1);
          return 0;
        }
        hash.set(a1, a2);
        const item = live(k1);
        if (item) item.expiresAt = Number(a3);
        return 1;
      }
      case SCRIPTS.pageAfter: {
        // By rank after the cursor's place; the script reads only the page (and a rank lookup).
        const [score = '', member = '', count = ''] = args;
        const limit = Number(count);
        const rows = zSorted(k1);
        const start =
          score === ''
            ? 0
            : rows.findIndex(([m, sc]) => sc > Number(score) || (sc === Number(score) && m > member)) === -1
              ? rows.length
              : rows.findIndex(([m, sc]) => sc > Number(score) || (sc === Number(score) && m > member));
        const page = rows.slice(start, start + limit);
        work.examined += page.length + 1;
        return page.flatMap(([m, sc]) => [m, String(sc)]);
      }
      case SCRIPTS.writeScheduled: {
        const [, schedule = '', heldKey = '', ownerKey = ''] = keys;
        const [
          mustExist = '',
          expected = '',
          next = '',
          ttl = '',
          member = '',
          score = '',
          max = '',
          nowMs = '',
          expiresAt = '',
          ownerMax = '',
          active = '',
        ] = args;
        const current = getString(k1);
        if (mustExist === '0') {
          if (current !== null) return 0;
          zRemoveRange(heldKey, Number(nowMs));
          const held = typed(heldKey, 'zset', false) as Map<string, number> | undefined;
          if ((held?.size ?? 0) >= Number(max)) return -1;
        } else if (current !== expected) return 0;
        if (active === '1') {
          zRemoveRange(ownerKey, Number(nowMs));
          const listed = typed(ownerKey, 'zset', false) as Map<string, number> | undefined;
          if (!listed?.has(member) && (listed?.size ?? 0) >= Number(ownerMax)) return -2;
        }
        setString(k1, next, Number(ttl));
        const set = typed(schedule, 'zset', true) as Map<string, number>;
        if (score === '') set.delete(member);
        else set.set(member, Number(score));
        dropEmpty(schedule);
        (typed(heldKey, 'zset', true) as Map<string, number>).set(member, Number(expiresAt));
        const owners = typed(ownerKey, 'zset', true) as Map<string, number>;
        if (active === '1') owners.set(member, Number(expiresAt));
        else owners.delete(member);
        dropEmpty(ownerKey);
        const last = Math.max(...owners.values());
        const listedItem = data.get(ownerKey);
        if (listedItem && owners.size > 0) listedItem.expiresAt = last;
        return 1;
      }
      default:
        throw new RedisError('NOSCRIPT unknown script in the test double');
    }
  }

  function execute(command: unknown[]): unknown {
    const [name, ...rest] = command;
    const args = rest.map((value) => (value === null ? null : String(value)));
    const [a0 = '', a1 = '', a2 = ''] = args as string[];
    switch (String(name).toLowerCase()) {
      case 'get':
        return getString(a0);
      case 'set': {
        const flags = (args.slice(2) as string[]).map((flag) => flag.toLowerCase());
        const ex = flags.includes('ex') ? Number(args[2 + flags.indexOf('ex') + 1]) : null;
        if (flags.includes('nx') && live(a0)) return null;
        if (flags.includes('xx') && !live(a0)) return null;
        setString(a0, a1, ex);
        return 'OK';
      }
      case 'del': {
        let removed = 0;
        for (const key of args as string[]) if (data.delete(key)) removed += 1;
        return removed;
      }
      case 'expire':
        return expire(a0, Number(a1));
      case 'ttl': {
        const item = live(a0);
        if (!item) return -2;
        return item.expiresAt === null ? -1 : Math.ceil((item.expiresAt - now()) / 1000);
      }
      case 'zadd': {
        // ZADD answers the number of members added, not updated.
        const set = typed(a0, 'zset', true) as Map<string, number>;
        const added = set.has(a2) ? 0 : 1;
        set.set(a2, Number(a1));
        return added;
      }
      case 'zrem': {
        const set = typed(a0, 'zset', false) as Map<string, number> | undefined;
        const removed = set?.delete(a1) ? 1 : 0;
        dropEmpty(a0);
        return removed;
      }
      case 'zremrangebyscore':
        return zRemoveRange(a0, bound(args[2], false).value);
      case 'zrange': {
        const flags = (args.slice(3) as string[]).map((flag) => String(flag).toLowerCase());
        if (!flags.includes('byscore')) throw new RedisError('ERR only BYSCORE is emulated');
        const min = bound(args[1], true);
        const max = bound(args[2], false);
        const limit = flags.indexOf('limit');
        const offset = limit >= 0 ? Number(args[3 + limit + 1]) : 0;
        const count = limit >= 0 ? Number(args[3 + limit + 2]) : Infinity;
        const rows = zSorted(a0)
          .filter(
            ([, score]) =>
              (min.open ? score > min.value : score >= min.value) &&
              (max.open ? score < max.value : score <= max.value),
          )
          .slice(offset, offset + count);
        return flags.includes('withscores')
          ? rows.flatMap(([member, score]) => [member, String(score)])
          : rows.map(([m]) => m);
      }
      case 'hdel': {
        const hash = typed(a0, 'hash', false) as Map<string, string> | undefined;
        const removed = hash?.delete(a1) ? 1 : 0;
        dropEmpty(a0);
        return removed;
      }
      case 'hgetall':
        return [...((typed(a0, 'hash', false) as Map<string, string> | undefined) ?? new Map())].flat();
      case 'eval': {
        const keyCount = Number(args[1]);
        return script(a0, args.slice(2, 2 + keyCount) as string[], args.slice(2 + keyCount) as string[]);
      }
      default:
        throw new RedisError(`ERR unknown command '${String(name)}'`);
    }
  }

  // Upstash leaves the status reply "OK" as it is and base64-encodes every other string.
  const encode = (value: unknown): unknown =>
    value === 'OK'
      ? value
      : typeof value === 'string'
        ? Buffer.from(value).toString('base64')
        : Array.isArray(value)
          ? value.map(encode)
          : value;

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(FAKE_UPSTASH_URL)) throw new Error(`Unexpected request to ${url}`);
    const command = JSON.parse(String(init?.body)) as unknown[];
    // A test can run its own requests before this command, to interleave them with it.
    const hook = beforeCommand;
    if (hook) await hook(command);
    if (failing || rejectWhen?.(command)) throw new TypeError('fetch failed');
    commands.push(command);
    const headers = new Headers(init?.headers);
    try {
      const result = execute(command);
      // Applied, but the reply never reaches the client.
      if (loseReplyWhen?.(command)) throw new TypeError('fetch failed');
      const body = headers.get('upstash-encoding') === 'base64' ? encode(result) : result;
      return new Response(JSON.stringify({ result: body }), { status: 200 });
    } catch (error) {
      if (error instanceof TypeError) throw error;
      return new Response(JSON.stringify({ error: (error as Error).message }), { status: 400 });
    }
  });

  return {
    fetch,
    commands,
    work,
    /** The real adapter over the real SDK, pointed at this endpoint. */
    store: (options: { retry?: boolean } = {}): LabsStore =>
      createUpstashStore({ url: FAKE_UPSTASH_URL, token: 'test-token' }, options.retry ? {} : { retry: false }),
    /** Applies the requests `predicate` picks but loses their replies, so the client may retry them. */
    loseReplyWhen: (predicate: ((command: unknown[]) => boolean) | null) => {
      loseReplyWhen = predicate;
    },
    keys: () => [...data.keys()].filter((key) => live(key) !== undefined),
    ttlOf: (key: string) => {
      const item = live(key);
      return item?.expiresAt == null ? null : (item.expiresAt - now()) / 1000;
    },
    /** Reads a value directly, for assertions. */
    raw: (key: string) => live(key)?.entry,
    /** Fills a sorted set directly, for tests of the limits (as many members as a busy service would hold). */
    seedSortedSet: (key: string, count: number, score: number) => {
      const set = typed(key, 'zset', true) as Map<string, number>;
      for (let index = 0; index < count; index += 1) set.set(`seed-${index}`, score);
    },
    /**
     * Runs `hook` before each command is executed, and removes it when it returns true. It stays in
     * place for other requests while it runs; only the requests the hook itself makes skip it.
     */
    beforeCommand: (hook: ((command: unknown[]) => Promise<boolean | void>) | null) => {
      if (!hook) {
        beforeCommand = null;
        return;
      }
      const installed = async (command: unknown[]) => {
        if (insideHook.getStore()) return;
        const done = await insideHook.run(true, () => hook(command));
        if (done && beforeCommand === installed) beforeCommand = null;
      };
      beforeCommand = installed;
    },
    /** Makes the requests `predicate` picks fail at the network, as a lost connection would. */
    rejectWhen: (predicate: ((command: unknown[]) => boolean) | null) => {
      rejectWhen = predicate;
    },
    /** Makes every later request fail, as an unreachable Upstash would. */
    fail: (value: boolean) => {
      failing = value;
    },
  };
}

/**
 * Routes Upstash requests to the fake and leaves every other global fetch an error, so no test can
 * reach a real service.
 */
export function installFakeUpstash(fake: ReturnType<typeof createFakeUpstash>) {
  vi.stubGlobal('fetch', fake.fetch);
}
