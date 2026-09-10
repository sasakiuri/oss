// SPDX-License-Identifier: MIT
'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Search } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';

import { withBasePath } from '@/shared/config/site';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';

import { createSearchIndex } from './search-index';

const searchSchema = z.array(z.object({ id: z.string(), title: z.string(), section: z.string(), text: z.string() }));

export function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['document-search'],
    enabled: open,
    queryFn: async ({ signal }) => {
      const response = await fetch(withBasePath('/search-index.json'), { signal });
      if (!response.ok) throw new Error('Search index unavailable');
      return searchSchema.parse(await response.json());
    },
  });
  const index = useMemo(() => (data ? createSearchIndex(data) : undefined), [data]);
  const results = useMemo(() => index?.search(deferredQuery).slice(0, 20) ?? [], [index, deferredQuery]);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="文書を検索"
      description="キーワードでマニュアルと技術資料を検索します。Tab キーで結果を選べます。"
      trigger={
        <Button
          variant="outline"
          className="text-subtle min-h-9 gap-2 px-2.5 sm:h-9 sm:w-52 sm:justify-start"
          aria-label="文書を検索"
        >
          <Search size={15} strokeWidth={1.5} aria-hidden="true" />
          <span className="hidden text-[13px] sm:inline">文書を検索</span>
          <kbd className="border-line ml-auto hidden rounded border px-1 text-[10px] sm:inline">Ctrl K</kbd>
        </Button>
      }
    >
      <label className="sr-only" htmlFor="document-search">
        検索キーワード
      </label>
      <input
        id="document-search"
        type="search"
        placeholder="例：射座、MQTT、印刷"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="border-line bg-muted mb-4 h-12 w-full rounded-lg border px-4 text-base"
        autoComplete="off"
      />
      <div role="status" className="text-subtle mb-3 text-sm">
        {isPending
          ? '検索を準備しています…'
          : isError
            ? '検索データを読み込めませんでした。'
            : query
              ? `${results.length} 件の検索結果`
              : 'キーワードを入力してください。'}
      </div>
      {isError && <Button onClick={() => void refetch()}>再試行</Button>}
      <ul aria-label="検索結果" className="space-y-2">
        {results.map((result) => (
          <li key={result.id as string}>
            <Link
              href={result.id as string}
              onClick={() => setOpen(false)}
              className="border-line hover:bg-muted flex items-start justify-between gap-3 rounded-xl border p-4"
            >
              <div>
                <div className="text-brand text-sm font-semibold">{result.title as string}</div>
                {result.section && <p className="mt-1 text-sm">{result.section as string}</p>}
                <p className="text-subtle mt-1 line-clamp-2 text-xs">{(result.text as string).slice(0, 160)}</p>
              </div>
              <ArrowUpRight className="text-subtle mt-1 shrink-0" size={16} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
