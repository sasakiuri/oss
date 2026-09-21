'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useDeferredValue, useEffect, useId, useRef, useState } from 'react';

import { focusContent } from '@/lib/focus-content';
import { createSearchClient } from '@/lib/search-client';
import type { SearchResults } from '@/lib/search-protocol';

export function HomeSearchButton() {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => window.dispatchEvent(new Event('knowledge:search'))}
      className="mt-4 flex min-h-11 w-full max-w-md items-center justify-center gap-3 rounded-full bg-surface/80 px-4 text-body hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <Search className="h-5 w-5" aria-hidden="true" />
      記事・ニュースを検索
    </button>
  );
}

export function SearchDialog() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [ready, setReady] = useState(false);
  const [results, setResults] = useState<SearchResults>({ total: 0, hits: [] });
  const clientRef = useRef<ReturnType<typeof createSearchClient> | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [destination, setDestination] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const inputId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const restoreOpenerRef = useRef(true);
  const changeOpen = useCallback((next: boolean) => {
    if (next) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      restoreOpenerRef.current = true;
      setDestination(null);
    }
    setOpen(next);
    if (next) setError(false);
  }, []);

  useEffect(() => {
    if (open || !destination) return;
    const target = new URL(destination, window.location.href);
    if (target.pathname.replace(/\/$/, '') !== (pathname ?? window.location.pathname).replace(/\/$/, '')) return;
    // Run after the destination route commits and Radix releases its focus scope.
    const frame = requestAnimationFrame(() => {
      focusContent(target.hash);
      setDestination(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [destination, open, pathname]);

  useEffect(() => {
    const onSearch = () => changeOpen(true);
    window.addEventListener('knowledge:search', onSearch);
    return () => window.removeEventListener('knowledge:search', onSearch);
  }, [changeOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      // Do not open another modal over the mobile navigation or image viewer.
      if (!open && document.querySelector('[role="dialog"]:not([aria-modal="false"])')) return;
      event.preventDefault();
      changeOpen(!open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, changeOpen]);

  useEffect(() => {
    if (!open || clientRef.current) return;
    let mounted = true;
    async function load() {
      let client: ReturnType<typeof createSearchClient> | null = null;
      try {
        client = createSearchClient();
        clientRef.current = client;
        await client.load();
        if (clientRef.current === client) setReady(true);
      } catch {
        if (!client) {
          if (mounted) setError(true);
          return;
        }
        if (clientRef.current !== client) return;
        client.dispose();
        clientRef.current = null;
        setReady(false);
        setError(true);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [open, attempt]);

  useEffect(() => {
    return () => {
      const client = clientRef.current;
      clientRef.current = null;
      client?.dispose();
    };
  }, []);

  useEffect(() => {
    const client = clientRef.current;
    if (!ready || !client) return;
    let current = true;
    void client.search(deferredQuery).then(
      (results) => {
        if (current) setResults(results);
      },
      () => {
        if (!current || clientRef.current !== client) return;
        client.dispose();
        clientRef.current = null;
        setReady(false);
        setResults({ total: 0, hits: [] });
        setError(true);
      },
    );
    return () => {
      current = false;
    };
  }, [ready, deferredQuery]);

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label="記事・ニュースを検索 Ctrl / ⌘ K"
          aria-keyshortcuts="Control+k Meta+k"
          className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-3 text-sm text-white hover:bg-slate-600 focus-visible:outline-2 focus-visible:outline-white"
        >
          <Search className="h-5 w-5" aria-hidden="true" />
          <span className="hidden sm:inline">検索</span>{' '}
          <kbd aria-hidden="true" className="hidden rounded border border-slate-400 px-1 text-xs lg:inline">
            Ctrl / ⌘ K
          </kbd>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50 print:hidden" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (restoreOpenerRef.current) {
              // A non-modal opener, such as a share link, can unmount when search takes focus.
              const opener = openerRef.current?.isConnected ? openerRef.current : triggerRef.current;
              opener?.focus();
            }
          }}
          className="fixed left-1/2 top-[5dvh] z-[60] max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 overflow-y-auto overscroll-contain rounded-xl bg-surface p-5 shadow-xl sm:p-6 print:hidden"
        >
          <Dialog.Title className="pr-10 text-lg font-bold text-ink">記事・ニュースを検索</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-subtle">
            タイトル・見出し・本文・タグを検索します。Tab キーで結果を選び、Esc キーで閉じます。
          </Dialog.Description>
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="検索を閉じる"
              className="absolute right-2 top-2 rounded-md p-3 text-subtle hover:bg-muted-strong focus-visible:outline-2 focus-visible:outline-brand"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </Dialog.Close>
          <label htmlFor={inputId} className="mt-4 block text-sm font-medium text-ink">
            検索キーワード
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            aria-describedby={statusId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="キーワードを入力"
            autoComplete="off"
            className="mt-2 min-h-12 w-full rounded-lg border border-line-strong px-4 text-base text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand"
          />
          <p id={statusId} role="status" aria-atomic="true" className="my-3 text-sm text-subtle">
            {error
              ? '検索データを読み込めませんでした。'
              : !ready
                ? '検索を準備しています…'
                : !query.trim()
                  ? 'キーワードを入力してください。'
                  : results.total === 0
                    ? '一致する記事・ニュースが見つかりません。'
                    : `${results.total} 件の検索結果${results.total > 20 ? '（上位20件を表示）' : ''}`}
          </p>
          {error && (
            <button
              type="button"
              onClick={() => {
                inputRef.current?.focus();
                setError(false);
                setAttempt((current) => current + 1);
              }}
              className="self-start rounded-md border border-line-strong px-4 py-2 text-sm text-ink hover:bg-muted-strong"
            >
              再試行
            </button>
          )}
          <ul aria-label="検索結果" aria-busy={!ready && !error} className="space-y-2 p-1">
            {results.hits.map((result) => (
              <li key={String(result.id)}>
                <Link
                  href={String(result.id)}
                  prefetch={false}
                  onClick={(event) => {
                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    restoreOpenerRef.current = false;
                    setDestination(String(result.id));
                    changeOpen(false);
                  }}
                  className="flex items-start gap-3 rounded-lg border border-line p-4 hover:bg-muted focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <span className="text-xs text-subtle">{result.type === 'articles' ? '記事' : 'ニュース'}</span>
                    <p className="mt-1 text-sm font-semibold text-brand">{String(result.title)}</p>
                    {result.section && <p className="mt-1 text-sm font-medium text-body">{String(result.section)}</p>}
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-subtle">{result.excerpt}</p>
                  </div>
                  <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
