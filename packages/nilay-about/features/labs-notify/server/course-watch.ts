import 'server-only';

import { createHash } from 'node:crypto';

import { z } from 'zod';

import { extractContentText, WATCHED_PAGE_IDS, WATCHED_PAGES, type WatchedPage } from '@/lib/course-watch';
import type { PushSubscriptionData } from '@/lib/schemas/push';
import { RequestError } from '@/lib/server/http';
import type { LabsStore } from '@/lib/server/store';

import { withCronLock } from './cron-lock';
import { fanOut } from './fan-out';
import { fetchPublicText } from './fetch-source';
import { safeJson, SUBSCRIPTION_TTL_SECONDS, type Language, type PushService } from './push';
import { createWatchIndex } from './watch-index';

const watchSchema = z.object({ pages: z.array(z.enum(WATCHED_PAGE_IDS)).min(1) });
/** Devices watching course pages, in all. */
export const COURSE_WATCHERS_MAX = 20_000;
export const courseWatches = createWatchIndex('course', watchSchema, SUBSCRIPTION_TTL_SECONDS, COURSE_WATCHERS_MAX);

// Only a hash of the text and when it last changed are kept; the page's text is not stored.
/**
 * `revision` counts the changes recorded for the page. A batch is named by it as well as by the new
 * text's hash, so a page that returns to earlier text (A → B → C → B) makes a new batch.
 */
const pageStateSchema = z.object({ hash: z.string(), changedAt: z.number(), revision: z.number().int().nonnegative() });
const pageStateKey = (id: string) => `labs:course:page:${id}`;
const PAGE_STATE_TTL_SECONDS = 400 * 24 * 60 * 60;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const RUN_BUDGET_MS = 40_000;

export function courseMessage(page: WatchedPage) {
  return (language: Language) =>
    language === 'ja'
      ? {
          title: `講習会のページが更新されました（${page.prefecture.ja}）`,
          body: `${page.publisher.ja}「${page.title.ja}」の内容が変わりました。日程は元のページで確認してください。`,
          url: `/labs/course-watch#${page.id}`,
          tag: `course-${page.id}`,
        }
      : {
          title: `A course page changed (${page.prefecture.en})`,
          body: `“${page.title.en}” on the ${page.publisher.en} changed. Check the dates on the page itself.`,
          url: `/labs/course-watch#${page.id}`,
          tag: `course-${page.id}`,
        };
}

export function createCourseWatch(dependencies: {
  store: () => LabsStore;
  push: PushService;
  fetch?: typeof fetch;
  now?: () => number;
}) {
  const now = dependencies.now ?? Date.now;
  return {
    async register(subscription: PushSubscriptionData, language: Language, pages: string[]) {
      const { id, expiresAt } = await dependencies.push.save(subscription, language);
      await courseWatches.put(dependencies.store(), id, watchSchema.parse({ pages: [...new Set(pages)] }), now());
      return { expiresAt };
    },

    /** Drops the device's record once its subscription has been checked. */
    forget: (id: string) => courseWatches.remove(dependencies.store(), id),

    async unregister(subscription: PushSubscriptionData) {
      const id = await dependencies.push.owner(subscription);
      if (!id) throw new RequestError(404, '登録が見つかりません。');
      await courseWatches.remove(dependencies.store(), id);
    },

    /** When each page last changed, for the tool's list. Null until the first run has read it. */
    async pageStates() {
      const store = dependencies.store();
      return Promise.all(
        WATCHED_PAGES.map(async (page) => {
          const raw = await store.get(pageStateKey(page.id));
          const parsed = raw === null ? null : pageStateSchema.safeParse(safeJson(raw));
          return { id: page.id, changedAt: parsed?.success ? new Date(parsed.data.changedAt).toISOString() : null };
        }),
      );
    },

    async run() {
      const store = dependencies.store();
      const started = now();
      const locked = await withCronLock(store, 'course-watch', 10 * 60, async () => {
        const summary: Record<string, 'baseline' | 'unchanged' | 'changed' | 'error' | boolean> = {};
        const changed: WatchedPage[] = [];
        const updates: { id: string; hash: string; revision: number }[] = [];
        for (const page of WATCHED_PAGES) {
          try {
            const fetched = await fetchPublicText(
              page.url,
              {},
              { fetch: dependencies.fetch, maxBytes: MAX_PAGE_BYTES, mediaTypes: ['text/html'] },
            );
            if (fetched.status === 'unchanged') throw new Error('Unexpected 304');
            const text = extractContentText(fetched.text, page.contentStart);
            if (text === null) throw new Error('Content element not found');
            const hash = createHash('sha256').update(text).digest('base64url');
            const raw = await store.get(pageStateKey(page.id));
            const parsed = raw === null ? null : pageStateSchema.safeParse(safeJson(raw));
            const previous = parsed?.success ? parsed.data : null;
            if (previous?.hash === hash) {
              summary[page.id] = 'unchanged';
              // Refresh the expiry so a page that never changes keeps its state.
              await store.expireMany([pageStateKey(page.id)], PAGE_STATE_TTL_SECONDS);
              continue;
            }
            summary[page.id] = previous ? 'changed' : 'baseline';
            if (previous) changed.push(page);
            updates.push({ id: page.id, hash, revision: (previous?.revision ?? 0) + 1 });
          } catch {
            // One unreachable site must not hold back the others.
            summary[page.id] = 'error';
          }
        }
        let complete = true;
        if (changed.length > 0) {
          // One batch per set of changes, resumable across runs.
          const batch = createHash('sha256')
            .update(
              changed
                .map((page) => {
                  const update = updates.find((item) => item.id === page.id);
                  return `${page.id}:${update?.revision ?? 0}:${update?.hash ?? ''}`;
                })
                .join(','),
            )
            .digest('base64url');
          const outcome = await fanOut({
            store,
            index: courseWatches,
            progressKey: `labs:course:progress:${batch}`,
            now,
            deadline: started + RUN_BUDGET_MS,
            send: async (id, value) => {
              const pages = changed.filter((item) => value.pages.includes(item.id));
              if (pages.length === 0) return 'skip';
              let failed = false;
              for (const page of pages) {
                // Marked per page and revision after it is sent, so a retry for another page that
                // failed does not tell the device about this one again.
                const revision = updates.find((item) => item.id === page.id)?.revision ?? 0;
                const told = `labs:course:told:${page.id}:${revision}:${id}`;
                if ((await store.get(told)) !== null) continue;
                const result = await dependencies.push.notify([id], courseMessage(page), {
                  ttlSeconds: 3 * 24 * 60 * 60,
                  urgency: 'normal',
                });
                if (result.gone > 0) {
                  await courseWatches.remove(store, id);
                  return 'gone';
                }
                if (result.failed > 0) failed = true;
                else await store.set(told, '1', { ttlSeconds: 3 * 24 * 60 * 60 });
              }
              return failed ? 'failed' : 'sent';
            },
          });
          complete = outcome.complete;
        }
        // An unfinished run keeps the old hashes, so the next run sees the same change and carries on.
        if (!complete) return { ...summary, complete };
        // Written after sending: a run that fails part-way sends again rather than never.
        for (const update of updates) {
          await store.set(
            pageStateKey(update.id),
            JSON.stringify({ hash: update.hash, changedAt: now(), revision: update.revision }),
            {
              ttlSeconds: PAGE_STATE_TTL_SECONDS,
            },
          );
        }
        return { ...summary, complete };
      });
      return locked.ran ? locked.result : 'locked';
    },
  };
}
