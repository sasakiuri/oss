// SPDX-License-Identifier: MIT
/** Lexical retrieval for relationship checks; it never decides the relationship. */
import type { Article } from "../domain.ts";

import { ROUTING_POLICY } from "./decisions.ts";
import { modelEvidence } from "./evidence.ts";

/** `difflib.SequenceMatcher(None, a, b).ratio()`, including its automatic junk heuristic. */
function similarity(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1;
  const positions = new Map<string, number[]>();
  b.forEach((char, index) => {
    const list = positions.get(char);
    if (list) list.push(index);
    else positions.set(char, [index]);
  });
  if (b.length >= 200) {
    const popular = Math.floor(b.length / 100) + 1;
    for (const [char, list] of positions)
      if (list.length > popular) positions.delete(char);
  }
  const longest = (
    alo: number,
    ahi: number,
    blo: number,
    bhi: number,
  ): [number, number, number] => {
    let [i0, j0, size] = [alo, blo, 0];
    let lengths = new Map<number, number>();
    for (let i = alo; i < ahi; i += 1) {
      const next = new Map<number, number>();
      for (const j of positions.get(a[i] ?? "") ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (lengths.get(j - 1) ?? 0) + 1;
        next.set(j, k);
        if (k > size) [i0, j0, size] = [i - k + 1, j - k + 1, k];
      }
      lengths = next;
    }
    while (i0 > alo && j0 > blo && a[i0 - 1] === b[j0 - 1])
      [i0, j0, size] = [i0 - 1, j0 - 1, size + 1];
    while (i0 + size < ahi && j0 + size < bhi && a[i0 + size] === b[j0 + size])
      size += 1;
    return [i0, j0, size];
  };
  let matches = 0;
  const queue: [number, number, number, number][] = [
    [0, a.length, 0, b.length],
  ];
  for (let item = queue.pop(); item; item = queue.pop()) {
    const [alo, ahi, blo, bhi] = item;
    const [i, j, k] = longest(alo, ahi, blo, bhi);
    if (!k) continue;
    matches += k;
    if (alo < i && blo < j) queue.push([alo, i, blo, j]);
    if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
  }
  return (2 * matches) / (a.length + b.length);
}

type RelatedArticle = Pick<Article, "id" | "title"> & Partial<Article>;

/** Lexical shortlist only; Jev makes the actual duplicate/follow-up judgment. */
export function relatedCandidates<T extends RelatedArticle>(
  article: RelatedArticle,
  others: readonly T[],
): T[] {
  const normalized = (title: string) => [
    ...title
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ""),
  ];
  const bigrams = (chars: string[]) =>
    new Set(
      chars.slice(1).map((char, index) => `${chars[index] ?? ""}${char}`),
    );
  const signature = (item: RelatedArticle) => {
    const content = modelEvidence(item);
    const title = normalized(item.title);
    // Search snippets and stale bodies are already excluded from model evidence.
    const lead = (content.excerpt || content.body || "").slice(0, 600);
    return {
      title,
      grams: bigrams(title),
      context: bigrams(normalized(`${item.title} ${lead}`)),
    };
  };
  const overlap = (left: Set<string>, right: Set<string>) => {
    const shared = [...left].filter((gram) => right.has(gram)).length;
    return (2 * shared) / Math.max(1, left.size + right.size);
  };
  const target = signature(article);
  const ranked: [number, T][] = [];
  for (const other of others) {
    if (other.id === article.id) continue;
    const candidate = signature(other);
    const score = Math.max(
      overlap(target.grams, candidate.grams),
      overlap(target.context, candidate.context),
    );
    if (score >= ROUTING_POLICY.comparisonOverlap)
      ranked.push([score + similarity(target.title, candidate.title), other]);
  }
  ranked.sort((x, y) => y[0] - x[0]);
  const selected = ranked
    .slice(0, ROUTING_POLICY.comparisonLimit)
    .map(([, other]) => other);
  // Always check the closest posted match, even when pending copies rank higher.
  const posted = ranked.find(
    ([, other]) => other.reviewStatus === "posted",
  )?.[1];
  if (posted && !selected.includes(posted))
    selected[selected.length - 1] = posted;
  return selected;
}
