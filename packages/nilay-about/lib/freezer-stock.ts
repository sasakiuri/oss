import type { FreezerItem } from './schemas/freezer-stock';

export type { FreezerItem, FreezerSpecies } from './schemas/freezer-stock';

export const FREEZER_SOURCES_CHECKED_ON = '2026-09-24';

export const FREEZER_SOURCES = {
  guideline: {
    title: '野生鳥獣肉の衛生管理に関する指針（ガイドライン）第 5（5）',
    note: '厚生労働省、最終改正 令和 5 年 6 月 26 日',
    quote:
      '野生鳥獣肉は、摂氏10度以下で保存すること。ただし、細切りした野生鳥獣肉を凍結したものであって容器包装に入れられたものにあっては、摂氏−15度以下で保存すること。また、家畜の食肉と区別して保管すること。',
    url: 'https://www.mhlw.go.jp/content/001455712.pdf',
  },
  home: {
    title: '家庭でできる食中毒予防の６つのポイント',
    note: '厚生労働省',
    quote:
      '冷蔵庫は10℃以下、冷凍庫は-15℃以下に維持することがめやすです。細菌の多くは、10℃では増殖がゆっくりとなり、-15℃では増殖が停止しています。しかし、細菌が死ぬわけではありません。早めに使いきるようにしましょう。',
    url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/shokuhin/syokuchu/01_00006.html',
  },
} as const;

/** Midnight of a `YYYY-MM-DD` date in local time, or `null` for a date that does not exist. */
export function parseDate(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** Whole calendar days from `from` to `to` (both local dates), counted by date rather than by hours. */
export function daysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end - start) / 86_400_000);
}

export type UseByStatus =
  { kind: 'none' } | { kind: 'ahead'; days: number } | { kind: 'today' } | { kind: 'past'; days: number };

/** How the reader's own use-by date stands on `today`. */
export function checkUseBy(item: Pick<FreezerItem, 'useBy'>, today: Date): UseByStatus {
  const date = parseDate(item.useBy);
  if (!date) return { kind: 'none' };
  const days = daysBetween(today, date);
  if (days > 0) return { kind: 'ahead', days };
  return days === 0 ? { kind: 'today' } : { kind: 'past', days: -days };
}

/** Days since the item was frozen, or `null` without a date (or with one in the future). */
export function daysFrozen(item: Pick<FreezerItem, 'frozenOn'>, today: Date): number | null {
  const date = parseDate(item.frozenOn);
  if (!date) return null;
  const days = daysBetween(date, today);
  return days >= 0 ? days : null;
}

/**
 * The oldest first, so the first line is the one to take out next: by the day frozen, with the lines
 * that have no date after the rest, and emptied lines at the end.
 */
export function sortFreezerItems(items: readonly FreezerItem[]): FreezerItem[] {
  const key = (item: FreezerItem) => parseDate(item.frozenOn)?.getTime() ?? Infinity;
  return [...items].sort((a, b) => {
    if ((a.packs === 0) !== (b.packs === 0)) return a.packs === 0 ? 1 : -1;
    const [left, right] = [key(a), key(b)];
    return left === right ? 0 : left < right ? -1 : 1;
  });
}

export interface FreezerTotals {
  packs: number;
  /** Grams of the lines that give a weight per pack. */
  grams: number;
  /** Packs in lines without a weight, left out of `grams`. */
  unweighedPacks: number;
}

export function freezerTotals(items: readonly FreezerItem[]): FreezerTotals {
  return items.reduce<FreezerTotals>(
    (totals, item) => ({
      packs: totals.packs + item.packs,
      grams: totals.grams + (item.gramsPerPack ?? 0) * item.packs,
      unweighedPacks: totals.unweighedPacks + (item.gramsPerPack === null ? item.packs : 0),
    }),
    { packs: 0, grams: 0, unweighedPacks: 0 },
  );
}

/** Today's date as `<input type="date">` wants it. */
export function isoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
