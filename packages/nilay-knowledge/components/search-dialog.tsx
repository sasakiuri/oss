'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { ArrowUpRight, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { Suspense, useCallback, useDeferredValue, useEffect, useId, useRef, useState } from 'react';

import { SearchHighlight } from '@/components/search-highlight';
import { focusContent } from '@/lib/focus-content';
import { createSearchClient } from '@/lib/search-client';
import { searchScopes, type SearchResults } from '@/lib/search-protocol';

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
  return (
    <Suspense
      fallback={
        <button
          type="button"
          disabled
          aria-label="記事・ニュースを検索 Ctrl / ⌘ K"
          className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-3 text-sm text-white"
        >
          <Search className="h-5 w-5" aria-hidden="true" />
          <span className="hidden sm:inline">検索</span>
          <kbd aria-hidden="true" className="hidden rounded border border-slate-400 px-1 text-xs lg:inline">
            Ctrl / ⌘ K
          </kbd>
        </button>
      }
    >
      <SearchDialogContent />
    </Suspense>
  );
}

function SearchDialogContent() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [{ q: query, type: scope }, setSearchParams] = useQueryStates(
    {
      q: parseAsString.withDefault(''),
      type: parseAsStringLiteral(searchScopes).withDefault('all'),
    },
    { history: 'replace', shallow: true, scroll: false },
  );
  const previousSearch = useRef<{ q: string; type: typeof scope } | null>(null);
  const initialSearch = useRef(Boolean(query.trim()) || scope !== 'all');
  const [pending, setPending] = useState(false);
  const [selectedResult, setSelectedResult] = useState('');
  const [ready, setReady] = useState(false);
  const [results, setResults] = useState<SearchResults>({ total: 0, hits: [] });
  const clientRef = useRef<ReturnType<typeof createSearchClient> | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [destination, setDestination] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const restoreOpenerRef = useRef(true);
  const changeOpen = useCallback(
    (next: boolean) => {
      if (next) {
        if (!query && scope === 'all' && previousSearch.current) void setSearchParams(previousSearch.current);
        openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        restoreOpenerRef.current = true;
        setDestination(null);
      }
      setOpen(next);
      if (next) setError(false);
    },
    [query, scope, setSearchParams],
  );

  useEffect(() => {
    if (open) previousSearch.current = { q: query, type: scope };
  }, [open, query, scope]);

  useEffect(() => {
    if (initialSearch.current) {
      initialSearch.current = false;
      changeOpen(true);
    }
  }, [changeOpen]);

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
    if (!open || !ready || !client) return;
    let current = true;
    setPending(true);
    void client.search(deferredQuery, scope).then(
      (results) => {
        if (current) {
          setResults(results);
          setPending(false);
        }
      },
      () => {
        if (!current || clientRef.current !== client) return;
        client.dispose();
        clientRef.current = null;
        setReady(false);
        setResults({ total: 0, hits: [] });
        setPending(false);
        setError(true);
      },
    );
    return () => {
      current = false;
    };
  }, [open, ready, deferredQuery, scope]);

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
            記事・ニュースや添付PDFを検索します。上下キーで結果を選び、Enterで開きます。Escで閉じます。検索条件はURLに保存されます。
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
          <label className="mt-4 block text-sm font-medium text-ink">
            検索対象
            <select
              aria-label="検索対象"
              value={scope}
              onChange={(event) => void setSearchParams({ type: event.target.value as typeof scope })}
              className="mt-2 min-h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-base"
            >
              <option value="all">記事・ニュース</option>
              <option value="articles">記事</option>
              <option value="news">ニュース</option>
              <option value="pdf">PDF資料</option>
            </select>
          </label>
          {scope === 'pdf' && (
            <p className="mt-2 text-sm text-subtle">PDF内の文字を検索します。画像として保存された文字は対象外です。</p>
          )}
          <Command
            label="検索キーワード"
            shouldFilter={false}
            value={selectedResult}
            onValueChange={setSelectedResult}
            vimBindings={false}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (
                event.target instanceof HTMLAnchorElement &&
                ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
              )
                inputRef.current?.focus();
              if (event.key !== 'Enter' || event.target !== inputRef.current) return;
              const link = event.currentTarget.querySelector<HTMLAnchorElement>('a[cmdk-item][data-selected="true"]');
              if (link) {
                event.preventDefault();
                if (event.ctrlKey || event.metaKey || event.shiftKey) {
                  // Use the keyboard event's user activation; synthetic modifier clicks vary by browser.
                  window.open(link.href, '_blank', 'noopener');
                } else {
                  link.click();
                }
              }
            }}
          >
            <p aria-hidden="true" className="mt-4 text-sm font-medium text-ink">
              検索キーワード
            </p>
            <Command.Input
              ref={inputRef}
              aria-describedby={statusId}
              value={query}
              onValueChange={(q) => void setSearchParams({ q })}
              placeholder="キーワードを入力"
              className="mt-2 min-h-12 w-full rounded-lg border border-line-strong px-4 text-base text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand"
            />
            <p id={statusId} role="status" aria-atomic="true" className="my-3 text-sm text-subtle">
              {error
                ? '検索データを読み込めませんでした。'
                : !ready
                  ? '検索を準備しています…'
                  : !query.trim()
                    ? 'キーワードを入力してください。'
                    : pending || query !== deferredQuery
                      ? '検索しています…'
                      : results.total === 0
                        ? '一致する記事・ニュースが見つかりません。'
                        : `${results.total} 件の検索結果${results.total > 20 ? '（上位20件を表示）' : ''}`}
            </p>

            <Command.List label="検索結果" aria-busy={(!ready || pending) && !error} className="space-y-2 p-1">
              {!error &&
                !pending &&
                query === deferredQuery &&
                results.hits.map((result) => {
                  const ResultLink = result.type === 'pdf' ? 'a' : Link;
                  return (
                    <Command.Item key={result.id} value={result.id} asChild>
                      <ResultLink
                        onFocus={() => setSelectedResult(result.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.stopPropagation();
                        }}
                        href={String(result.id)}
                        {...(result.type === 'pdf' ? {} : { prefetch: false })}
                        onClick={(event) => {
                          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                            return;
                          restoreOpenerRef.current = false;
                          setDestination(String(result.id));
                          changeOpen(false);
                        }}
                        className="flex items-start gap-3 rounded-lg border border-line p-4 hover:bg-muted data-[selected=true]:bg-muted data-[selected=true]:ring-2 data-[selected=true]:ring-brand focus-visible:outline-2 focus-visible:outline-brand"
                      >
                        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                          <span className="text-xs text-subtle">
                            {result.type === 'articles' ? '記事' : result.type === 'pdf' ? 'PDF' : 'ニュース'}
                          </span>
                          <p className="mt-1 text-sm font-semibold text-brand">
                            <SearchHighlight text={result.title} query={query} />
                          </p>
                          {result.section && (
                            <p className="mt-1 text-sm font-medium text-body">
                              <SearchHighlight text={result.section} query={query} />
                            </p>
                          )}
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-subtle">
                            <SearchHighlight text={result.excerpt} query={query} />
                          </p>
                        </div>
                        <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
                      </ResultLink>
                    </Command.Item>
                  );
                })}
            </Command.List>
          </Command>
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
