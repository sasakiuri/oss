import 'server-only';

import { z } from 'zod';

import type { LabsStore } from '@/lib/server/store';

import { eachLimited } from './cron-lock';
import { safeJson } from './push';
import type { WatchIndex } from './watch-index';

/** What one device's send came to. `skip` means the device had nothing to be told. */
export type DeviceOutcome = 'sent' | 'failed' | 'gone' | 'skip';

const progressSchema = z.object({
  cursor: z.object({ score: z.string(), member: z.string() }).nullable(),
  scanned: z.boolean(),
  /** Devices to try again, with the attempts made so far. */
  retry: z.record(z.string(), z.number()),
});
type Progress = z.infer<typeof progressSchema>;

const PROGRESS_TTL_SECONDS = 3 * 24 * 60 * 60;
const MAX_ATTEMPTS = 3;
const SEND_CONCURRENCY = 8;

/**
 * Sends one batch (a set of new sightings, a set of changed pages) to every device in an index,
 * across as many runs as it takes. The run's progress is saved in Redis after every page: the
 * cursor in the index, and the devices to try again (those a send failed for, or the run had no
 * time left for). The next run tries those first and then carries on from the cursor, so no run
 * starts over, and a device is sent to once per batch unless a run stops mid-page (then at least
 * once). Returns whether the batch is finished.
 */
export async function fanOut<T>(options: {
  store: LabsStore;
  index: WatchIndex<T>;
  /** One key per batch; a new batch starts from the beginning. */
  progressKey: string;
  now: () => number;
  /** The run stops starting new sends at this time. */
  deadline: number;
  send: (id: string, value: T) => Promise<DeviceOutcome>;
}): Promise<{ complete: boolean; sent: number }> {
  const { store, index, progressKey, now, deadline, send } = options;
  const raw = await store.get(progressKey);
  const parsed = raw === null ? null : progressSchema.safeParse(safeJson(raw));
  const progress: Progress = parsed?.success ? parsed.data : { cursor: null, scanned: false, retry: {} };
  let sent = 0;
  const save = () => store.set(progressKey, JSON.stringify(progress), { ttlSeconds: PROGRESS_TTL_SECONDS });

  // A device that registers again during the scan moves further on in the index and is met a second
  // time; this per-batch mark (set only after a send) keeps it from being told twice.
  const sentKey = (id: string) => `${progressKey}:sent:${id}`;

  const handle = async (id: string, value: T | null, attempts: number) => {
    if (now() > deadline) {
      progress.retry[id] = attempts;
      return;
    }
    if ((await store.get(sentKey(id))) !== null) {
      delete progress.retry[id];
      return;
    }
    const outcome = value === null ? 'gone' : await send(id, value);
    if (outcome === 'sent') {
      sent += 1;
      await store.set(sentKey(id), '1', { ttlSeconds: PROGRESS_TTL_SECONDS });
    }
    if (outcome === 'failed' && attempts + 1 < MAX_ATTEMPTS) progress.retry[id] = attempts + 1;
    else delete progress.retry[id];
  };

  // Devices left over from earlier runs come first.
  const waiting = Object.entries(progress.retry);
  await eachLimited(waiting, SEND_CONCURRENCY, async ([id, attempts]) => {
    await handle(id, now() > deadline ? null : await index.read(store, id), attempts);
  });
  await save();

  if (!progress.scanned && now() <= deadline) {
    for await (const page of index.pages(store, now(), progress.cursor)) {
      await eachLimited(page.records, SEND_CONCURRENCY, ({ id, value }) => handle(id, value, 0));
      progress.cursor = page.cursor;
      await save();
      if (now() > deadline) break;
    }
    if (now() <= deadline) progress.scanned = true;
  }

  // Kept after the batch is done too, so a run that repeats a finished batch (the job stopped before
  // recording it) sends nothing again.
  await save();
  return { complete: progress.scanned && Object.keys(progress.retry).length === 0, sent };
}
