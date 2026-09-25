import 'server-only';

import { z } from 'zod';

import type { ResultsContent, ResultsView } from '@/lib/schemas/event-results';
import { RequestError } from '@/lib/server/http';
import { createToken, hashPassphrase, hashToken, verifyPassphrase } from '@/lib/server/secrets';
import { indexScore, withinLimit, type LabsStore } from '@/lib/server/store';

import { safeJson } from './push';

const storedSchema = z.object({
  passphraseHash: z.string(),
  title: z.string(),
  note: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  updatedAt: z.number(),
  expiresAt: z.number(),
});
type Stored = z.infer<typeof storedSchema>;

const resultsKey = (id: string) => `labs:results:${id}`;
const ACTIVE_KEY = 'labs:results:active';

/**
 * Limits. Together they bound what anonymous pages can hold: 300 pages of at most 128 KiB, about
 * 38 MiB. Passphrase tries are counted per page and address and per page in all, in Redis itself,
 * so they fail closed.
 */
export const RESULTS_LIMITS = {
  storedBytes: 128 * 1024,
  activePages: 300,
  pagesPerDay: { max: 200, windowSeconds: 86_400 },
  editPerAddress: { max: 5, windowSeconds: 60 },
  editPerPage: { max: 30, windowSeconds: 60 },
} as const;

export function createEventResults(dependencies: { store: () => LabsStore; now?: () => number }) {
  const now = dependencies.now ?? Date.now;
  const store = () => dependencies.store();

  const notFound = () => new RequestError(404, 'リザルトが見つかりません。公開期限が過ぎたか、削除されました。');

  async function read(id: string): Promise<{ stored: Stored; raw: string }> {
    const raw = await store().get(resultsKey(id));
    const parsed = raw === null ? null : storedSchema.safeParse(safeJson(raw));
    if (raw === null || !parsed?.success || parsed.data.expiresAt <= now()) throw notFound();
    return { stored: parsed.data, raw };
  }

  const load = async (id: string) => (await read(id)).stored;

  /** The page and its place in the page count, which are always written and deleted together. */
  const entry = (id: string, expiresAt: number) => ({
    key: resultsKey(id),
    indexKey: ACTIVE_KEY,
    member: id,
    score: indexScore(expiresAt, id),
  });
  const ttlFor = (stored: Stored) => Math.max(1, Math.ceil((stored.expiresAt - now()) / 1000));

  async function authorize(id: string, passphrase: string, clientIp: string) {
    const perAddress = await withinLimit(
      store(),
      `results-edit:${id}:${hashToken(clientIp)}`,
      RESULTS_LIMITS.editPerAddress,
      now(),
    );
    const perPage = perAddress && (await withinLimit(store(), `results-edit:${id}`, RESULTS_LIMITS.editPerPage, now()));
    if (!perAddress || !perPage) throw new RequestError(429, '試行が多すぎます。しばらくしてからお試しください。');
    const found = await read(id);
    if (!(await verifyPassphrase(passphrase, found.stored.passphraseHash))) {
      throw new RequestError(403, '合言葉が違います。');
    }
    return found;
  }

  const checkSize = (stored: Stored) => {
    if (Buffer.byteLength(JSON.stringify(stored)) > RESULTS_LIMITS.storedBytes) {
      throw new RequestError(413, 'リザルトが大きすぎます。');
    }
  };

  const view = (stored: Stored): ResultsView => ({
    title: stored.title,
    note: stored.note,
    columns: stored.columns,
    rows: stored.rows,
    updatedAt: new Date(stored.updatedAt).toISOString(),
    expiresAt: new Date(stored.expiresAt).toISOString(),
  });

  return {
    async create(passphrase: string, days: number, content: ResultsContent) {
      if (!(await withinLimit(store(), 'create:results', RESULTS_LIMITS.pagesPerDay, now()))) {
        throw new RequestError(429, '本日の公開数の上限に達しました。明日お試しください。');
      }
      const id = createToken(12);
      const expiresAt = now() + days * 24 * 60 * 60 * 1000;
      const stored = { passphraseHash: await hashPassphrase(passphrase), ...content, updatedAt: now(), expiresAt };
      checkSize(stored);
      // The page, its place in the count and the limit check are one step.
      const created = await store().putIndexed({
        ...entry(id, expiresAt),
        value: JSON.stringify(stored),
        ttlSeconds: ttlFor(stored),
        max: RESULTS_LIMITS.activePages,
        pruneUpTo: now(),
      });
      if (created !== 'written') throw new RequestError(503, 'ただいま公開できるページ数の上限に達しています。');
      return { id, expiresAt: new Date(expiresAt).toISOString() };
    },
    async get(id: string) {
      return view(await load(id));
    },
    /** Replaces the content; the page keeps its original expiry. */
    async update(id: string, passphrase: string, content: ResultsContent, clientIp: string) {
      const { stored, raw } = await authorize(id, passphrase, clientIp);
      const next = { ...stored, ...content, updatedAt: now() };
      checkSize(next);
      // Written only over the version that was checked: a page deleted meanwhile stays deleted.
      if (!(await store().compareAndSet(resultsKey(id), raw, JSON.stringify(next), ttlFor(next)))) {
        throw (await store().get(resultsKey(id))) === null
          ? notFound()
          : new RequestError(409, 'リザルトが同時に更新されました。もう一度お試しください。');
      }
      return view(next);
    },
    async remove(id: string, passphrase: string, clientIp: string) {
      const { stored, raw } = await authorize(id, passphrase, clientIp);
      if (!(await store().deleteIndexed({ ...entry(id, stored.expiresAt), expected: raw }))) {
        throw new RequestError(409, 'リザルトが同時に更新されました。もう一度お試しください。');
      }
    },
  };
}
