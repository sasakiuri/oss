import 'server-only';

import type { z } from 'zod';

import { RequestError } from '@/lib/server/http';
import { indexScore, type LabsStore } from '@/lib/server/store';

import { eachLimited } from './cron-lock';
import { safeJson } from './push';

export type WatchIndex<T> = ReturnType<typeof createWatchIndex<T>>;

const PAGE_SIZE = 100;
const READ_CONCURRENCY = 20;

/**
 * Records keyed by a device's subscription id, listed in a sorted set scored by when each record
 * expires. Record and index entry are written and deleted together, the set is pruned of expired
 * members before it is read, and it holds at most `max` members.
 *
 * Jobs read it with an exact cursor on (score, member), so members sharing a score are neither read
 * twice nor skipped, and a member removed during the run cannot shift unread members past the
 * cursor. The cursor can be saved and a later run resumes after it (see fan-out.ts).
 */
export function createWatchIndex<T>(name: string, schema: z.ZodType<T>, ttlSeconds: number, max: number) {
  const indexKey = `labs:${name}:watchers`;
  const recordKey = (id: string) => `labs:${name}:watch:${id}`;
  const entry = (id: string, nowMs: number) => ({
    key: recordKey(id),
    indexKey,
    member: id,
    score: indexScore(nowMs + ttlSeconds * 1000, id),
  });
  return {
    async put(store: LabsStore, id: string, value: T, nowMs: number) {
      const stored = await store.putIndexed({
        ...entry(id, nowMs),
        value: JSON.stringify(value),
        ttlSeconds,
        max,
        pruneUpTo: nowMs,
      });
      if (stored !== 'written') throw new RequestError(503, '登録数が上限に達しています。');
    },
    remove: (store: LabsStore, id: string) => store.deleteIndexed(entry(id, 0)),
    /** One device's record, or null when it has gone. */
    async read(store: LabsStore, id: string): Promise<T | null> {
      const raw = await store.get(recordKey(id));
      const parsed = raw === null ? null : schema.safeParse(safeJson(raw));
      return parsed?.success ? parsed.data : null;
    },
    /**
     * The live records a page at a time, starting after `from` (the cursor a previous run saved), each
     * page with the cursor to resume after it.
     */
    async *pages(
      store: LabsStore,
      nowMs: number,
      from: { score: string; member: string } | null,
    ): AsyncGenerator<{ records: { id: string; value: T }[]; cursor: { score: string; member: string } }> {
      await store.zRemoveUpTo(indexKey, nowMs);
      let cursor = from;
      for (;;) {
        const rows = await store.zPageAfter(indexKey, cursor, PAGE_SIZE);
        const last = rows[rows.length - 1];
        if (last) {
          const records: ({ id: string; value: T } | null)[] = [];
          await eachLimited(rows, READ_CONCURRENCY, async ({ member }) => {
            const raw = await store.get(recordKey(member));
            const parsed = raw === null ? null : schema.safeParse(safeJson(raw));
            records.push(parsed?.success ? { id: member, value: parsed.data } : null);
          });
          cursor = { score: last.score, member: last.member };
          yield {
            records: records.filter((record): record is { id: string; value: T } => record !== null),
            cursor,
          };
        }
        if (rows.length < PAGE_SIZE) return;
      }
    },
  };
}
