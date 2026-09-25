import { Redis } from '@upstash/redis';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createUpstashStore,
  pairsToRecord,
  REQUEST_TIMEOUT_MS,
  SCRIPTS,
  STORE_CALL_WORST_MS,
  STORE_RETRY_POLICY,
  type LabsStore,
} from '@/lib/server/store';

import { createFakeUpstash, FAKE_UPSTASH_URL, installFakeUpstash } from '../../features/labs-notify/fake-upstash';

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The store is the real `@upstash/redis` client with only `fetch` replaced. These tests pin what it
 * sends over REST and the shapes the SDK hands back with `automaticDeserialization: false`.
 */
function recording(answers: unknown[]) {
  const bodies: unknown[] = [];
  const headers: Headers[] = [];
  const encode = (value: unknown): unknown =>
    typeof value === 'string'
      ? Buffer.from(value).toString('base64')
      : Array.isArray(value)
        ? value.map(encode)
        : value;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      headers.push(new Headers(init.headers));
      return new Response(JSON.stringify({ result: encode(answers.shift()) }), { status: 200 });
    }),
  );
  return { bodies, headers, store: createUpstashStore({ url: FAKE_UPSTASH_URL, token: 'token' }) };
}

describe('the Upstash adapter over the real SDK', () => {
  it('sends infinite score bounds as Redis strings, never as JSON null (regression)', async () => {
    const { bodies, store } = recording([['plan-a', '1700000000000']]);
    expect(await store.zRangeWithScores('labs:return:due', '-inf', 1_800_000_000_000, 200)).toEqual([
      { member: 'plan-a', score: 1_700_000_000_000 },
    ]);
    expect(bodies[0]).toEqual([
      'zrange',
      'labs:return:due',
      '-inf',
      1_800_000_000_000,
      'byscore',
      'limit',
      0,
      200,
      'withscores',
    ]);
    // A number that JSON cannot carry turns into null, which Redis refuses.
    expect(JSON.stringify([Number.NEGATIVE_INFINITY])).toBe('[null]');
  });

  it('turns the flat HGETALL reply into a record, and an empty hash into an empty record', async () => {
    const { store } = recording([['member-1', '{"name":"A"}', 'member-2', '{"name":"B"}'], []]);
    expect(await store.hGetAll('labs:room:x:members')).toEqual({
      'member-1': '{"name":"A"}',
      'member-2': '{"name":"B"}',
    });
    expect(await store.hGetAll('labs:room:y:members')).toEqual({});
    expect(() => pairsToRecord(['odd'])).toThrow();
  });

  it('asks for base64 replies and decodes them, and sends one request per call', async () => {
    const { headers, bodies, store } = recording(['{"a":1}', 'OK', null]);
    expect(await store.get('k')).toBe('{"a":1}');
    expect(await store.set('k', 'v', { ttlSeconds: 5 })).toBe(true);
    expect(await store.set('k', 'v', { ttlSeconds: 5, onlyIfAbsent: true })).toBe(false);
    expect(headers[0]?.get('upstash-encoding')).toBe('base64');
    expect(bodies).toEqual([
      ['get', 'k'],
      ['set', 'k', 'v', 'ex', 5],
      ['set', 'k', 'v', 'nx', 'ex', 5],
    ]);
  });

  it('sends each script with its keys and arguments as strings', async () => {
    const { bodies, store } = recording([1, 0]);
    const renew = { indexKey: 'labs:push:subs', members: [{ key: 'labs:push:sub:a', member: 'a', score: 9.5 }] };
    expect(await store.compareAndSetRenewing('labs:hook:h', 'old', 'new', 60, renew)).toBe(true);
    expect(await store.zAddCapped('labs:rooms:active', 5, 'room', 200, 4)).toBe(false);
    expect(bodies).toEqual([
      [
        'eval',
        SCRIPTS.compareAndSetRenewing,
        3,
        'labs:hook:h',
        'labs:push:subs',
        'labs:push:sub:a',
        'old',
        'new',
        '60',
        'a',
        '9.5',
      ],
      ['eval', SCRIPTS.zAddCapped, 1, 'labs:rooms:active', '5', 'room', '200', '4'],
    ]);
  });
});

describe('scheduled writes', () => {
  it('writes a record, its schedule entry and its place in the count in one script', async () => {
    const { bodies, store } = recording([1, 1, 0, -1]);
    const entries = (score: number | null, member = 'p') => ({
      member,
      schedule: { key: 'due', score },
      held: { key: 'held', max: 3, now: 1_000 },
      owner: { key: 'owner', max: 2, active: true },
    });
    expect(await store.writeScheduled('p', null, 'v1', 60, entries(5))).toBe('written');
    expect(await store.writeScheduled('p', 'v1', 'v2', 60, entries(null))).toBe('written');
    expect(await store.writeScheduled('p', 'v0', 'v2', 60, entries(null))).toBe('changed');
    expect(await store.writeScheduled('q', null, 'v1', 60, entries(5, 'q'))).toBe('full');
    // The place in the count is scored by the record's own expiry: now plus its lifetime.
    expect(bodies).toEqual([
      [
        'eval',
        SCRIPTS.writeScheduled,
        4,
        'p',
        'due',
        'held',
        'owner',
        '0',
        '',
        'v1',
        '60',
        'p',
        '5',
        '3',
        '1000',
        '61000',
        '2',
        '1',
      ],
      [
        'eval',
        SCRIPTS.writeScheduled,
        4,
        'p',
        'due',
        'held',
        'owner',
        '1',
        'v1',
        'v2',
        '60',
        'p',
        '',
        '3',
        '1000',
        '61000',
        '2',
        '1',
      ],
      [
        'eval',
        SCRIPTS.writeScheduled,
        4,
        'p',
        'due',
        'held',
        'owner',
        '1',
        'v0',
        'v2',
        '60',
        'p',
        '',
        '3',
        '1000',
        '61000',
        '2',
        '1',
      ],
      [
        'eval',
        SCRIPTS.writeScheduled,
        4,
        'q',
        'due',
        'held',
        'owner',
        '0',
        '',
        'v1',
        '60',
        'q',
        '5',
        '3',
        '1000',
        '61000',
        '2',
        '1',
      ],
    ]);
  });
});

describe('retrying requests through the real SDK (R15)', () => {
  /** A fetch that answers each try as `answers` says: 'hang' until its signal aborts, or a response. */
  function answering(answers: ('hang' | Response)[]) {
    const signals: (AbortSignal | null | undefined)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        signals.push(init.signal);
        const answer = answers.shift() ?? 'hang';
        if (answer !== 'hang') return answer;
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        });
      }),
    );
    return signals;
  }
  const ok = (value: string) =>
    new Response(JSON.stringify({ result: Buffer.from(value).toString('base64') }), { status: 200 });

  it('tries a request that times out three times, each try with its own time limit', { timeout: 20_000 }, async () => {
    const signals = answering([]);
    const store = createUpstashStore({ url: FAKE_UPSTASH_URL, token: 'token' }, { requestTimeoutMs: 20 });
    await expect(store.get('k')).rejects.toThrow();
    expect(signals).toHaveLength(3);
    expect(new Set(signals).size).toBe(3);
  });

  it('answers from a later try when an earlier one timed out', { timeout: 20_000 }, async () => {
    const signals = answering(['hang', ok('v')]);
    const store = createUpstashStore({ url: FAKE_UPSTASH_URL, token: 'token' }, { requestTimeoutMs: 20 });
    expect(await store.get('k')).toBe('v');
    expect(signals).toHaveLength(2);
  });

  it('tries again a request that never reached Upstash', async () => {
    let tries = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        tries += 1;
        if (tries < 3) throw new TypeError('fetch failed');
        return ok('v');
      }),
    );
    const store = createUpstashStore({ url: FAKE_UPSTASH_URL, token: 'token' });
    expect(await store.get('k')).toBe('v');
    expect(tries).toBe(3);
  });

  it('does not repeat a request that Redis answered with an error', async () => {
    const signals = answering([new Response(JSON.stringify({ error: 'ERR wrong' }), { status: 400 })]);
    const store = createUpstashStore({ url: FAKE_UPSTASH_URL, token: 'token' }, { requestTimeoutMs: 20 });
    await expect(store.get('k')).rejects.toThrow('ERR wrong');
    expect(signals).toHaveLength(1);
  });

  it('plans deadlines with exactly the tries and waits it makes', () => {
    expect(STORE_CALL_WORST_MS).toBe(3 * REQUEST_TIMEOUT_MS + 100 + 200);
  });
});

describe('writes whose first try ran but whose answer was lost (R16)', () => {
  /** A store over the test double whose first request matching `pick` is applied but not answered. */
  function losingFirst(pick: (command: unknown[]) => boolean) {
    const fake = createFakeUpstash(() => 1_000_000);
    installFakeUpstash(fake);
    let lost = false;
    fake.loseReplyWhen((command) => {
      if (lost || !pick(command)) return false;
      lost = true;
      return true;
    });
    return { fake, store: fake.store({ retry: true }) };
  }
  const script = (source: string) => (command: unknown[]) => command[0] === 'eval' && command[1] === source;

  it('takes a lock it did get', async () => {
    const { store } = losingFirst((command) => command[0] === 'set');
    expect(await store.set('lock', 'me', { ttlSeconds: 60, onlyIfAbsent: true })).toBe(true);
    expect(await store.get('lock')).toBe('me');
  });

  it('reports a compare and set that went through as done', async () => {
    const { fake, store } = losingFirst(script(SCRIPTS.compareAndSet));
    await fake.store().set('k', 'old', { ttlSeconds: 60 });
    expect(await store.compareAndSet('k', 'old', 'new', 60)).toBe(true);
  });

  it('reports a renewing compare and set that went through as done', async () => {
    const { fake, store } = losingFirst(script(SCRIPTS.compareAndSetRenewing));
    await fake.store().set('k', 'old', { ttlSeconds: 60 });
    expect(await store.compareAndSetRenewing('k', 'old', 'new', 60, { indexKey: 'i', members: [] })).toBe(true);
  });

  it('reports a delete of its own value that went through as done', async () => {
    const { fake, store } = losingFirst(script(SCRIPTS.deleteIfEquals));
    await fake.store().set('lock', 'me', { ttlSeconds: 60 });
    expect(await store.deleteIfEquals('lock', 'me')).toBe(true);
  });

  it('reports a scheduled write that went through as written', async () => {
    const { store } = losingFirst(script(SCRIPTS.writeScheduled));
    const entries = {
      member: 'p',
      schedule: { key: 'due', score: 5 },
      held: { key: 'held', max: 10, now: 0 },
      owner: { key: 'owner', max: 3, active: false },
    };
    expect(await store.writeScheduled('p', null, 'v1', 60, entries)).toBe('written');
  });

  it('reports a conditional indexed write that went through as written', async () => {
    const { store } = losingFirst(script(SCRIPTS.putIndexed));
    const record = { key: 'r', indexKey: 'i', member: 'm', score: 9, value: 'v', ttlSeconds: 60, max: 2, pruneUpTo: 1 };
    expect(await store.putIndexed({ ...record, expected: null })).toBe('written');
  });

  it('reports a conditional indexed delete that went through as done', async () => {
    const { fake, store } = losingFirst(script(SCRIPTS.deleteIndexed));
    await fake.store().set('r', 'v', { ttlSeconds: 60 });
    expect(await store.deleteIndexed({ key: 'r', indexKey: 'i', member: 'm', score: 9, expected: 'v' })).toBe(true);
  });

  it('never counts a call twice: a counter whose answer was lost is not tried again', async () => {
    const { fake, store } = losingFirst(script(SCRIPTS.increment));
    await expect(store.increment('count', 60)).rejects.toThrow();
    expect(await fake.store().get('count')).toBe('1');
  });

  it('makes exactly one request per try, without the SDK retrying on its own', async () => {
    let tries = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        tries += 1;
        throw new TypeError('fetch failed');
      }),
    );
    const store = createUpstashStore({ url: FAKE_UPSTASH_URL, token: 'token' }, { retry: false });
    await expect(store.get('k')).rejects.toThrow();
    expect(tries).toBe(1);
  });

  it('lists how each operation is tried again after a lost answer', () => {
    expect(STORE_RETRY_POLICY).toEqual({
      get: 'retry',
      ttlSeconds: 'retry',
      zRangeWithScores: 'retry',
      zPageAfter: 'retry',
      hGetAll: 'retry',
      del: 'retry',
      expireMany: 'retry',
      zAdd: 'retry',
      zRem: 'retry',
      zRemoveUpTo: 'retry',
      hDel: 'retry',
      hSetUntil: 'retry',
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
    });
  });
});

describe('writes that leave the record as it was, after a lost try (R17)', () => {
  const NOW = 1_000_000;
  /**
   * A store over the test double whose first request matching `pick` is lost: `before` it runs (the
   * connection failed on the way) or `after` it ran (the answer failed on the way back).
   */
  function losingFirst(pick: (command: unknown[]) => boolean, when: 'before' | 'after') {
    const fake = createFakeUpstash(() => NOW);
    installFakeUpstash(fake);
    const direct = fake.store();
    let lost = false;
    const once = (command: unknown[]) => {
      if (lost || !pick(command)) return false;
      lost = true;
      return true;
    };
    // Called once the records are in place, so only the write under test is lost.
    const lose = () => (when === 'before' ? fake.rejectWhen(once) : fake.loseReplyWhen(once));
    return { fake, direct, lose, store: fake.store({ retry: true }) };
  }
  const script = (source: string) => (command: unknown[]) => command[0] === 'eval' && command[1] === source;
  const scoreOf = async (store: LabsStore, key: string, member: string) =>
    (await store.zRangeWithScores(key, '-inf', '+inf', 100)).find((row) => row.member === member)?.score;

  for (const when of ['before', 'after'] as const) {
    it(`renews a record written again with the same value and its index entry (${when})`, async () => {
      const { fake, direct, lose, store } = losingFirst(script(SCRIPTS.putIndexed), when);
      const record = { key: 'r', indexKey: 'i', member: 'm', value: 'v', max: 10, pruneUpTo: 0 };
      await direct.putIndexed({ ...record, score: 1, ttlSeconds: 60 });
      lose();
      expect(await store.putIndexed({ ...record, score: 2, ttlSeconds: 600, expected: 'v' })).toBe('written');
      expect(fake.ttlOf('r')).toBe(600);
      expect(await scoreOf(direct, 'i', 'm')).toBe(2);
    });

    it(`renews an unconditional indexed write of the same value (${when})`, async () => {
      const { fake, direct, lose, store } = losingFirst(script(SCRIPTS.putIndexed), when);
      const record = { key: 'r', indexKey: 'i', member: 'm', value: 'v', max: 10, pruneUpTo: 0 };
      await direct.putIndexed({ ...record, score: 1, ttlSeconds: 60 });
      lose();
      expect(await store.putIndexed({ ...record, score: 2, ttlSeconds: 600 })).toBe('written');
      expect(fake.ttlOf('r')).toBe(600);
      expect(await scoreOf(direct, 'i', 'm')).toBe(2);
    });

    it(`renews the other records of a compare and set that keeps its value (${when})`, async () => {
      const { fake, direct, lose, store } = losingFirst(script(SCRIPTS.compareAndSetRenewing), when);
      await direct.set('k', 'same', { ttlSeconds: 60 });
      await direct.putIndexed({
        key: 'sub',
        indexKey: 'subs',
        member: 's',
        score: 1,
        value: 'x',
        ttlSeconds: 60,
        max: 10,
        pruneUpTo: 0,
      });
      const renew = { indexKey: 'subs', members: [{ key: 'sub', member: 's', score: 2 }] };
      lose();
      expect(await store.compareAndSetRenewing('k', 'same', 'same', 600, renew)).toBe(true);
      expect(fake.ttlOf('k')).toBe(600);
      expect(fake.ttlOf('sub')).toBe(600);
      expect(await scoreOf(direct, 'subs', 's')).toBe(2);
    });

    it(`moves the schedule of a scheduled write that keeps its value (${when})`, async () => {
      const { fake, direct, lose, store } = losingFirst(script(SCRIPTS.writeScheduled), when);
      const entries = (score: number) => ({
        member: 'p',
        schedule: { key: 'due', score },
        held: { key: 'held', max: 10, now: NOW },
        owner: { key: 'owner', max: 3, active: true },
      });
      expect(await direct.writeScheduled('p', null, 'v', 60, entries(1))).toBe('written');
      lose();
      expect(await store.writeScheduled('p', 'v', 'v', 600, entries(2))).toBe('written');
      expect(fake.ttlOf('p')).toBe(600);
      expect(await scoreOf(direct, 'due', 'p')).toBe(2);
      expect(await scoreOf(direct, 'held', 'p')).toBe(NOW + 600_000);
    });

    it(`renews a compare and set that keeps its value (${when})`, async () => {
      const { fake, direct, lose, store } = losingFirst(script(SCRIPTS.compareAndSet), when);
      await direct.set('k', 'same', { ttlSeconds: 60 });
      lose();
      expect(await store.compareAndSet('k', 'same', 'same', 600)).toBe(true);
      expect(fake.ttlOf('k')).toBe(600);
    });

    it(`renews a plain write of the same value (${when})`, async () => {
      const { fake, direct, lose, store } = losingFirst((command) => command[0] === 'set', when);
      await direct.set('k', 'same', { ttlSeconds: 60 });
      lose();
      expect(await store.set('k', 'same', { ttlSeconds: 600 })).toBe(true);
      expect(fake.ttlOf('k')).toBe(600);
    });

    it(`removes the index entry of a record that has already gone (${when})`, async () => {
      const { direct, lose, store } = losingFirst(script(SCRIPTS.deleteIndexed), when);
      await direct.zAdd('i', 1, 'm');
      lose();
      expect(await store.deleteIndexed({ key: 'r', indexKey: 'i', member: 'm', score: 1 })).toBe(true);
      expect(await scoreOf(direct, 'i', 'm')).toBeUndefined();
    });
  }
});

describe('indexed writes', () => {
  it('writes unconditionally, only if absent, or only over the value read, and tells which failed', async () => {
    const { bodies, store } = recording([1, -1, 0]);
    const record = { key: 'r', indexKey: 'i', member: 'm', score: 9, value: 'v', ttlSeconds: 60, max: 2, pruneUpTo: 1 };
    expect(await store.putIndexed(record)).toBe('written');
    expect(await store.putIndexed({ ...record, expected: null })).toBe('changed');
    expect(await store.putIndexed({ ...record, expected: 'old' })).toBe('full');
    expect(bodies).toEqual([
      ['eval', SCRIPTS.putIndexed, 2, 'r', 'i', 'm', 'v', '9', '2', '1', '60', '', ''],
      ['eval', SCRIPTS.putIndexed, 2, 'r', 'i', 'm', 'v', '9', '2', '1', '60', '0', ''],
      ['eval', SCRIPTS.putIndexed, 2, 'r', 'i', 'm', 'v', '9', '2', '1', '60', '1', 'old'],
    ]);
  });
});

describe('paging and request limits', () => {
  it('pages with an exact (score, member) cursor through one script', async () => {
    const { bodies, store } = recording([
      ['a', '5', 'b', '5'],
      ['c', '5'],
    ]);
    expect(await store.zPageAfter('labs:bear:watchers', null, 2)).toEqual([
      { member: 'a', score: '5' },
      { member: 'b', score: '5' },
    ]);
    expect(await store.zPageAfter('labs:bear:watchers', { score: '5', member: 'b' }, 2)).toEqual([
      { member: 'c', score: '5' },
    ]);
    expect(bodies).toEqual([
      ['eval', SCRIPTS.pageAfter, 1, 'labs:bear:watchers', '', '', '2'],
      ['eval', SCRIPTS.pageAfter, 1, 'labs:bear:watchers', '5', 'b', '2'],
    ]);
  });

  it('gives every request its own abort signal, so a stalled request ends', async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        signals.push(init.signal);
        return new Response(JSON.stringify({ result: null }), { status: 200 });
      }),
    );
    const store = createUpstashStore({ url: FAKE_UPSTASH_URL, token: 'token' });
    await store.get('a');
    await store.get('b');
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[1]).not.toBe(signals[0]);
  });
});

describe('the test double', () => {
  it('refuses a null score bound as Redis does', async () => {
    const fake = createFakeUpstash(() => 0);
    installFakeUpstash(fake);
    const redis = new Redis({
      url: FAKE_UPSTASH_URL,
      token: 'token',
      automaticDeserialization: false,
      enableAutoPipelining: false,
    });
    await expect(
      redis.zrange('z', Number.NEGATIVE_INFINITY, 5, { byScore: true, offset: 0, count: 1 }),
    ).rejects.toThrow('not a float');
  });

  it('keeps a hash it was given, and answers HGETALL through the SDK as the adapter expects', async () => {
    const fake = createFakeUpstash(() => 0);
    installFakeUpstash(fake);
    const store = fake.store();
    await store.hSetUntil('h', 'f1', 'v1', 60_000);
    expect(await store.hSetCapped('h', 'f2', 'v2', 2, 60_000)).toBe(true);
    expect(await store.hSetCapped('h', 'f3', 'v3', 2, 60_000)).toBe(false);
    expect(await store.hGetAll('h')).toEqual({ f1: 'v1', f2: 'v2' });
    expect(await store.compareAndSetRenewing('missing', 'x', 'v', 60, { indexKey: 'i', members: [] })).toBe(false);
    // Upstash leaves the status reply "OK" unencoded, and ZADD counts only new members.
    expect(await store.set('k', 'v', { ttlSeconds: 60 })).toBe(true);
    expect(fake.commands.at(-1)).toEqual(['set', 'k', 'v', 'ex', 60]);
    expect(await store.ttlSeconds('h')).toBe(60);
  });
});
