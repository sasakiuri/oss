import { findAll } from 'highlight-words-core';

/** Normalize before computing offsets: NFKC can change the number of characters. */
export function SearchHighlight({ text, query }: { text: string; query: string }) {
  const normalized = text.normalize('NFKC');
  const words = query.normalize('NFKC').trim().split(/\s+/).filter(Boolean);
  const chunks = findAll({ textToHighlight: normalized, searchWords: words, autoEscape: true });
  return (
    <>
      {chunks.map(({ start, end, highlight }) =>
        highlight ? (
          <mark key={start} className="rounded-sm bg-amber-200 text-slate-950">
            {normalized.slice(start, end)}
          </mark>
        ) : (
          normalized.slice(start, end)
        ),
      )}
    </>
  );
}
