import 'server-only';

import { createToken } from '@/lib/server/secrets';
import type { LabsStore } from '@/lib/server/store';

/**
 * Vercel may start a scheduled job twice or while the last run is still going. A lock that expires
 * on its own keeps two runs from sending the same alerts; a crashed run frees it after `ttlSeconds`.
 */
export async function withCronLock<T>(
  store: LabsStore,
  name: string,
  ttlSeconds: number,
  run: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false }> {
  const key = `labs:lock:${name}`;
  const owner = createToken(16);
  if (!(await store.set(key, owner, { ttlSeconds, onlyIfAbsent: true }))) return { ran: false };
  try {
    return { ran: true, result: await run() };
  } finally {
    // Compare and delete in one step: a slow run whose lock expired must not free the next run's lock.
    await store.deleteIfEquals(key, owner);
  }
}

/**
 * Runs `work` over `items` with at most `limit` at a time. After a failure no new item is started,
 * and it returns (raising the first error) only when every started item has finished, so nothing is
 * still sending after the caller releases its lock.
 */
export async function eachLimited<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  let failed = false;
  let firstError: unknown;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && !failed) {
      const item = items[next];
      next += 1;
      if (item === undefined) continue;
      try {
        await work(item);
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
  });
  await Promise.allSettled(workers);
  if (failed) throw firstError;
}
