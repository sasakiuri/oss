import 'server-only';

import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  BEAR_SOURCES,
  newRecentSightings,
  normalizeAkita,
  sightingsNear,
  type BearSighting,
  type BearSource,
} from '@/lib/bear-alerts';
import { bearPlaceSchema, BEAR_PLACES_MAX, type BearPlace } from '@/lib/schemas/bear-alerts';
import type { PushSubscriptionData } from '@/lib/schemas/push';
import { RequestError } from '@/lib/server/http';
import type { LabsStore } from '@/lib/server/store';

import { withCronLock } from './cron-lock';
import { fanOut } from './fan-out';
import { fetchPublicText, type ConditionalState } from './fetch-source';
import { safeJson, SUBSCRIPTION_TTL_SECONDS, type Language, type PushService } from './push';
import { createWatchIndex } from './watch-index';

const watchSchema = z.object({ places: z.array(bearPlaceSchema).min(1).max(BEAR_PLACES_MAX) });
/** Devices watching places, in all. */
export const BEAR_WATCHERS_MAX = 20_000;
export const bearWatches = createWatchIndex('bear', watchSchema, SUBSCRIPTION_TTL_SECONDS, BEAR_WATCHERS_MAX);

const sourceStateSchema = z.object({
  etag: z.string().optional(),
  lastModified: z.string().optional(),
  recentIds: z.array(z.string()),
  /**
   * Counts the runs that completed. A batch is named by it as well as by its sightings, so a run that
   * repeats an unfinished batch resumes it, while the same sightings appearing again later (taken
   * down and published again) make a new batch that is sent.
   */
  revision: z.number().int().nonnegative(),
});
const sourceStateKey = (id: BearSource['id']) => `labs:bear:source:${id}`;
const SOURCE_STATE_TTL_SECONDS = 400 * 24 * 60 * 60;
/** Vercel stops the function at 60 s; the run stops taking new pages well before that. */
export const RUN_BUDGET_MS = 40_000;
// Akita's file is about 6 MB in September 2026.
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

export interface BearAlertDependencies {
  store: () => LabsStore;
  push: PushService;
  fetch?: typeof fetch;
  now?: () => number;
}

const formatJst = (ms: number) =>
  new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ms);

/** One notification per device, however many sightings fell within its places. */
export function bearMessage(
  matches: [{ sighting: BearSighting; distanceKm: number }, ...{ sighting: BearSighting; distanceKm: number }[]],
  source: BearSource,
) {
  const [nearest] = matches;
  return (language: Language) => {
    const when = nearest.sighting.observedAt === null ? '' : formatJst(nearest.sighting.observedAt);
    const km = nearest.distanceKm.toFixed(1);
    return language === 'ja'
      ? {
          title: `クマの出没情報 ${matches.length} 件（${source.name.ja}）`,
          body: `最も近いもの：${nearest.sighting.municipality}で${nearest.sighting.kind}、登録地点から約 ${km} km（${when}）。出典：${source.name.ja}のオープンデータ`,
          url: '/labs/bear-alerts',
          tag: 'bear-alerts',
        }
      : {
          title: `${matches.length} bear report(s) near you (${source.name.en})`,
          body: `Nearest: ${nearest.sighting.kind} in ${nearest.sighting.municipality}, about ${km} km from your place (${when} JST). Source: ${source.name.en} open data`,
          url: '/labs/bear-alerts',
          tag: 'bear-alerts',
        };
  };
}

/** A sighting inside two places counts once, at its nearest distance; nearest first. */
function nearestMatches(places: BearPlace[], fresh: BearSighting[]) {
  const nearest = new Map<string, { sighting: BearSighting; distanceKm: number }>();
  for (const match of places.flatMap((place) => sightingsNear(place, fresh))) {
    const known = nearest.get(match.sighting.id);
    if (!known || match.distanceKm < known.distanceKm) nearest.set(match.sighting.id, match);
  }
  return [...nearest.values()].sort((a, b) => a.distanceKm - b.distanceKm);
}

export function createBearAlerts(dependencies: BearAlertDependencies) {
  const now = dependencies.now ?? Date.now;

  return {
    async register(subscription: PushSubscriptionData, language: Language, places: BearPlace[]) {
      const { id, expiresAt } = await dependencies.push.save(subscription, language);
      await bearWatches.put(dependencies.store(), id, { places }, now());
      return { expiresAt };
    },

    /** Drops the device's record once its subscription has been checked. */
    forget: (id: string) => bearWatches.remove(dependencies.store(), id),

    async unregister(subscription: PushSubscriptionData) {
      const id = await dependencies.push.owner(subscription);
      if (!id) throw new RequestError(404, '登録が見つかりません。');
      await bearWatches.remove(dependencies.store(), id);
    },

    /**
     * The scheduled job. The first run of a source only records what is already there. Watchers
     * are read a page at a time and sent to a few at a time; each device is marked once per batch
     * of new sightings, so a run cut short by the time budget can be repeated without sending twice.
     */
    async run() {
      const store = dependencies.store();
      const started = now();
      const locked = await withCronLock(store, 'bear-alerts', 15 * 60, async () => {
        const summary: Record<
          string,
          { fresh: number; notified: number; complete: boolean } | 'unchanged' | 'baseline'
        > = {};
        for (const source of BEAR_SOURCES) {
          const raw = await store.get(sourceStateKey(source.id));
          const parsedState = raw === null ? null : sourceStateSchema.safeParse(safeJson(raw));
          const previous = parsedState?.success ? parsedState.data : null;
          const conditional: ConditionalState = previous
            ? { etag: previous.etag, lastModified: previous.lastModified }
            : {};
          const fetched = await fetchPublicText(source.dataUrl, conditional, {
            fetch: dependencies.fetch,
            maxBytes: MAX_SOURCE_BYTES,
            mediaTypes: ['text/csv'],
          });
          if (fetched.status === 'unchanged') {
            summary[source.id] = 'unchanged';
            continue;
          }
          const sightings = normalizeAkita(fetched.text);
          const { fresh, recentIds } = newRecentSightings(sightings, new Set(previous?.recentIds ?? []), now());
          if (!previous) {
            summary[source.id] = 'baseline';
          } else {
            const batch = createHash('sha256')
              .update(
                `${source.id}:${previous.revision}:${fresh
                  .map((item) => item.id)
                  .sort()
                  .join(',')}`,
              )
              .digest('base64url');
            let notified = 0;
            let complete = true;
            if (fresh.length > 0) {
              // Resumable across runs: a run that runs out of time leaves its place in the index.
              const outcome = await fanOut({
                store,
                index: bearWatches,
                progressKey: `labs:bear:progress:${batch}`,
                now,
                deadline: started + RUN_BUDGET_MS,
                send: async (id, value) => {
                  const [first, ...rest] = nearestMatches(value.places, fresh);
                  if (!first) return 'skip';
                  const result = await dependencies.push.notify([id], bearMessage([first, ...rest], source), {
                    ttlSeconds: 24 * 60 * 60,
                    urgency: 'normal',
                  });
                  if (result.gone > 0) {
                    await bearWatches.remove(store, id);
                    return 'gone';
                  }
                  return result.failed > 0 ? 'failed' : 'sent';
                },
              });
              notified = outcome.sent;
              complete = outcome.complete;
            }
            summary[source.id] = { fresh: fresh.length, notified, complete };
            // An unfinished run leaves the state, so the next run finds the same batch and carries on.
            if (!complete) continue;
          }
          await store.set(
            sourceStateKey(source.id),
            JSON.stringify({ ...fetched.state, recentIds, revision: (previous?.revision ?? 0) + 1 }),
            {
              ttlSeconds: SOURCE_STATE_TTL_SECONDS,
            },
          );
        }
        return summary;
      });
      return locked.ran ? locked.result : 'locked';
    },
  };
}
