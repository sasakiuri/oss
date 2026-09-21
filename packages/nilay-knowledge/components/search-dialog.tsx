'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { ArrowRight, ArrowUpRight, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { Suspense, useCallback, useDeferredValue, useEffect, useId, useRef, useState } from 'react';

import { SearchHighlight } from '@/components/search-highlight';
import { focusContent } from '@/lib/focus-content';
import { createSearchClient } from '@/lib/search-client';
import { searchScopes, type SearchResults } from '@/lib/search-protocol';

// The home button can hydrate before the header's search boundary is ready.
let searchRequested = false;

export function HomeSearchButton({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label="記事・ニュースを検索"
      onClick={() => {
        searchRequested = true;
        window.dispatchEvent(new Event('knowledge:search'));
      }}
      className={`flex min-h-12 items-center gap-3 rounded-sm border border-line-strong bg-surface px-4 py-3 text-sm text-subtle transition-colors hover:border-brand hover:text-brand ${compact ? 'w-full sm:w-auto' : 'mt-6 w-full max-w-md'}`}
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>記事・ニュースを検索</span>
      <ArrowRight className="ml-auto size-4 shrink-0" aria-hidden="true" />
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
          className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-sm px-3 text-sm text-white"
        >
          <Search className="h-5 w-5" aria-hidden="true" />
          <span className="hidden sm:inline">検索</span>
          <kbd aria-hidden="true" className="hidden rounded-sm border border-white/30 px-1 text-xs xl:inline">
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
    const onSearch = () => {
      searchRequested = false;
      changeOpen(true);
    };
    window.addEventListener('knowledge:search', onSearch);
    if (searchRequested) onSearch();
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
          className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-sm px-3 text-sm text-white hover:bg-white/10"
        >
          <Search className="h-5 w-5" aria-hidden="true" />
          <span className="hidden sm:inline">検索</span>{' '}
          <kbd aria-hidden="true" className="hidden rounded-sm border border-white/30 px-1 text-xs xl:inline">
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
          className="fixed left-1/2 top-[3dvh] z-[60] max-h-[94dvh] w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 overflow-y-auto overscroll-contain rounded-sm border border-line bg-surface p-4 shadow-xl sm:top-[8dvh] sm:max-h-[84dvh] sm:p-7 print:hidden"
        >
          <Dialog.Title className="pr-10 text-lg font-semibold text-ink">記事・ニュースを検索</Dialog.Title>
          <Dialog.Description className="mt-2 pr-3 text-xs leading-6 text-subtle">
            記事の本文・見出しや、添付されたPDF資料から探せます。
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
            <div className="relative mt-5">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-4 size-5 text-subtle" />
              <Command.Input
                ref={inputRef}
                aria-describedby={statusId}
                value={query}
                onValueChange={(q) => void setSearchParams({ q })}
                placeholder="キーワードを入力"
                className="min-h-13 w-full rounded-sm border border-line-strong bg-surface pr-12 pl-11 text-base text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand"
              />
              {query && (
                <button
                  type="button"
                  aria-label="検索キーワードを消去"
                  onKeyDown={(event) => {
                    if (['Enter', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) event.stopPropagation();
                  }}
                  onClick={() => {
                    void setSearchParams({ q: '' });
                    inputRef.current?.focus();
                  }}
                  className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-sm text-subtle hover:bg-muted"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <label className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
              検索対象
              <select
                aria-label="検索対象"
                onKeyDown={(event) => {
                  if (['Enter', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) event.stopPropagation();
                }}
                value={scope}
                onChange={(event) => void setSearchParams({ type: event.target.value as typeof scope })}
                className="min-h-11 min-w-0 max-w-full rounded-sm border border-line bg-surface px-3 text-sm text-body"
              >
                <option value="all">記事・ニュース</option>
                <option value="articles">記事</option>
                <option value="news">ニュース</option>
                <option value="pdf">PDF資料</option>
              </select>
            </label>
            {scope === 'pdf' && (
              <p className="mt-2 text-xs leading-6 text-subtle">
                PDF内の文字を検索します。画像として保存された文字は対象外です。
              </p>
            )}
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
                        ? scope === 'pdf'
                          ? '一致するPDF資料が見つかりません。'
                          : '一致する記事・ニュースが見つかりません。'
                        : `${results.total} 件の検索結果${results.total > 20 ? '（上位20件を表示）' : ''}`}
            </p>

            <Command.List label="検索結果" aria-busy={(!ready || pending) && !error} className="border-t border-line">
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
                        className="flex items-start gap-3 border-b border-l-2 border-transparent border-b-line px-3 py-4 hover:bg-muted data-[selected=true]:border-l-brand data-[selected=true]:bg-selected focus-visible:outline-2 focus-visible:outline-brand"
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
          {!error && !query.trim() && (
            <div className="py-4">
              <p className="text-xs text-subtle">キーワードの例</p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                {['所持許可', '申請書', '狩猟免許'].map((keyword) => (
                  <button
                    key={keyword}
                    type="button"
                    onClick={() => {
                      void setSearchParams({ q: keyword });
                      inputRef.current?.focus();
                    }}
                    className="min-h-11 text-sm text-brand underline decoration-line-strong underline-offset-4 hover:decoration-brand"
                  >
                    {keyword}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!error && ready && query.trim() && !pending && query === deferredQuery && results.total === 0 && (
            <p className="py-4 text-sm leading-7 text-subtle">
              短いキーワードに変えるか、検索対象を変えてお試しください。
            </p>
          )}
          <p className="mt-4 hidden border-t border-line pt-3 text-xs text-subtle sm:block">
            ↑ ↓ で選択 · Enter で開く · Esc で閉じる
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
