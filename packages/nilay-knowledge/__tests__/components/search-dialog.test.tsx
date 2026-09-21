import { act, fireEvent, render as testingRender, screen, waitFor, within } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ComponentProps, ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomeSearchButton, SearchDialog } from '@/components/search-dialog';
import { SnsShare } from '@/components/sns-share';
import { createSearchClient } from '@/lib/search-client';
import type { SearchResults } from '@/lib/search-protocol';

function render(ui: ReactElement, searchParams = '') {
  return testingRender(ui, { wrapper: withNuqsTestingAdapter({ searchParams, hasMemory: true }) });
}

const route = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('@/lib/search-client', () => ({ createSearchClient: vi.fn() }));

vi.mock('next/link', () => ({
  default: ({ href, children, onClick, ...props }: ComponentProps<'a'>) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

const results: SearchResults = {
  total: 1,
  totalMatches: 1,
  nextOffset: null,
  groups: [
    {
      id: '/articles/example/',
      type: 'articles',
      title: '文書ガイド',
      matches: [{ id: '/articles/example/#print', section: '印刷の準備', excerpt: '印刷する前に設定を確認します。' }],
    },
  ],
};

beforeEach(() => vi.mocked(createSearchClient).mockReset());

afterEach(() => {
  vi.unstubAllGlobals();
  route.pathname = '/';
});

function mockClient(value = results) {
  const client = {
    load: vi.fn().mockResolvedValue(undefined),
    search: vi.fn(async (query: string) =>
      query.includes('印刷') ? value : { total: 0, totalMatches: 0, groups: [], nextOffset: null },
    ),
    dispose: vi.fn(),
  };
  vi.mocked(createSearchClient).mockReturnValue(client);
  return client;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('site search dialog', () => {
  it('shows each article title once and expands its additional matching sections', async () => {
    mockClient({
      ...results,
      totalMatches: 2,
      groups: [
        {
          ...results.groups[0]!,
          matches: [
            ...results.groups[0]!.matches,
            { id: '/articles/example/#paper', section: '用紙の選び方', excerpt: '印刷用紙を選びます。' },
          ],
        },
      ],
    });
    render(<SearchDialog />, '?q=印刷');
    const toggle = await screen.findByRole('option', { name: '「文書ガイド」のほか 1 件の一致箇所を表示' });
    expect(screen.queryByRole('option', { name: /用紙の選び方/ })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(await screen.findByRole('option', { name: /用紙の選び方/ })).toHaveAttribute(
      'href',
      '/articles/example/#paper',
    );
    expect(screen.getAllByText('文書ガイド')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('1 件の検索結果（2 箇所が一致・1 件を表示）');
    fireEvent.click(screen.getByRole('option', { name: '「文書ガイド」のほか 1 件の一致箇所を閉じる' }));
    expect(screen.queryByRole('option', { name: /用紙の選び方/ })).not.toBeInTheDocument();
  });

  it('appends more pages, selects the first new match, and preserves existing groups', async () => {
    const firstPage = { ...results, total: 2, totalMatches: 2, nextOffset: 1 };
    const nextGroup = {
      ...results.groups[0]!,
      id: '/articles/next/',
      title: '追加ガイド',
      matches: [{ id: '/articles/next/#print', section: '印刷の手順', excerpt: '次の手順です。' }],
    };
    const client = mockClient(firstPage);
    const nextPage = deferred<SearchResults>();
    client.search.mockImplementation(async (query: string, _scope?: unknown, offset?: number) => {
      if (offset) return nextPage.promise;
      return query === '印刷' ? firstPage : { total: 0, totalMatches: 0, groups: [], nextOffset: null };
    });
    render(<SearchDialog />, '?q=印刷');
    fireEvent.click(await screen.findByRole('button', { name: 'もっと見る' }));
    expect(client.search).toHaveBeenLastCalledWith('印刷', 'all', 1);
    expect(screen.getByRole('option', { name: /文書ガイド/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '検索キーワード' })).toHaveFocus();
    await act(async () => nextPage.resolve({ ...firstPage, nextOffset: null, groups: [nextGroup] }));
    const appended = await screen.findByRole('option', { name: /追加ガイド/ });
    expect(appended).toHaveAttribute('aria-selected', 'true');
    expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.contexts).toContain(appended);
    expect(screen.getByRole('option', { name: /文書ガイド/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 件を表示');
    expect(screen.queryByRole('button', { name: 'もっと見る' })).not.toBeInTheDocument();
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores a stale pagination %s after changing the query',
    async (completion) => {
      const firstPage = { ...results, total: 2, totalMatches: 2, nextOffset: 1 };
      const client = mockClient(firstPage);
      const nextPage = deferred<SearchResults>();
      client.search.mockImplementation(async (query: string, _scope?: unknown, offset?: number) => {
        if (offset) return nextPage.promise;
        return query === '印刷' ? firstPage : { total: 0, totalMatches: 0, groups: [], nextOffset: null };
      });
      render(<SearchDialog />, '?q=印刷');
      fireEvent.click(await screen.findByRole('button', { name: 'もっと見る' }));
      fireEvent.change(screen.getByRole('combobox', { name: '検索キーワード' }), { target: { value: '別の検索' } });
      await screen.findByText('一致する記事・ニュースが見つかりません。');
      vi.mocked(HTMLElement.prototype.scrollIntoView).mockClear();
      await act(async () => {
        if (completion === 'resolve') nextPage.resolve(results);
        else nextPage.reject(new Error('Old pagination failed'));
      });
      expect(within(screen.getByRole('listbox')).queryByRole('option')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('一致する記事・ニュースが見つかりません。');
      expect(client.dispose).not.toHaveBeenCalled();
      expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    },
  );

  it('focuses main content when a selected result has no section fragment', async () => {
    mockClient({
      ...results,
      groups: [{ ...results.groups[0]!, matches: [{ ...results.groups[0]!.matches[0]!, id: '/articles/example/' }] }],
    });
    route.pathname = '/articles/example/';
    render(
      <>
        <SearchDialog />
        <main id="main-content" tabIndex={-1}>
          本文
        </main>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /記事・ニュースを検索/ }));
    fireEvent.change(screen.getByRole('combobox', { name: '検索キーワード' }), { target: { value: '印刷' } });
    fireEvent.click(await screen.findByRole('option', { name: /文書ガイド/ }));
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  });

  it('focuses a selected section instead of returning to the opener', async () => {
    mockClient();
    route.pathname = '/articles/example/';
    render(
      <>
        <SearchDialog />
        <main id="main-content" tabIndex={-1}>
          <h2 id="print" tabIndex={-1}>
            印刷の準備
          </h2>
        </main>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /記事・ニュースを検索/ }));
    fireEvent.change(screen.getByRole('combobox', { name: '検索キーワード' }), { target: { value: '印刷' } });
    fireEvent.click(await screen.findByRole('option', { name: /文書ガイド/ }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '印刷の準備' })).toHaveFocus());
  });

  it('keeps the dialog open for modified result clicks', async () => {
    mockClient();
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole('button', { name: /記事・ニュースを検索/ }));
    fireEvent.change(screen.getByRole('combobox', { name: '検索キーワード' }), { target: { value: '印刷' } });
    fireEvent.click(await screen.findByRole('option', { name: /文書ガイド/ }), { ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it.each(['ctrlKey', 'metaKey', 'shiftKey'])(
    'opens the selected result separately with %s+Enter',
    async (modifier) => {
      mockClient();
      const open = vi.fn();
      vi.stubGlobal('open', open);
      render(<SearchDialog />, '?q=印刷');
      const result = await screen.findByRole('option', { name: /文書ガイド/ });
      await waitFor(() => expect(result).toHaveAttribute('aria-selected', 'true'));
      const input = screen.getByRole('combobox', { name: '検索キーワード' });
      fireEvent.keyDown(input, { key: 'Enter', [modifier]: true, isComposing: true, keyCode: 229 });
      expect(open).not.toHaveBeenCalled();
      fireEvent.keyDown(input, { key: 'Enter', [modifier]: true });
      expect(open).toHaveBeenCalledExactlyOnceWith((result as HTMLAnchorElement).href, '_blank', 'noopener');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    },
  );

  it('loads on demand, searches, restores focus and reuses data when reopened', async () => {
    const client = mockClient();
    render(<SearchDialog />);
    expect(createSearchClient).not.toHaveBeenCalled();
    const trigger = screen.getByRole('button', { name: /記事・ニュースを検索/ });
    trigger.focus();
    fireEvent.click(trigger);
    const input = screen.getByRole('combobox', { name: '検索キーワード' });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '印刷' } });
    expect(await screen.findByRole('option', { name: /文書ガイド/ })).toHaveAttribute(
      'href',
      '/articles/example/#print',
    );
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(await screen.findByRole('option', { name: /文書ガイド/ })).toBeInTheDocument();
    expect(createSearchClient).toHaveBeenCalledTimes(1);
    expect(client.load).toHaveBeenCalledTimes(1);
    expect(client.dispose).not.toHaveBeenCalled();
  });

  it.each(['ctrlKey', 'metaKey'])('opens with %s+K and closes after choosing a result', async (modifier) => {
    mockClient();
    render(<SearchDialog />);
    fireEvent.keyDown(window, { key: 'k', [modifier]: true });
    fireEvent.change(screen.getByRole('combobox', { name: '検索キーワード' }), { target: { value: '印刷' } });
    fireEvent.click(await screen.findByRole('option', { name: /文書ガイド/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it.each(['ctrlKey', 'metaKey'])(
    'opens with %s+K from sharing and restores focus after its opener unmounts',
    async (modifier) => {
      mockClient();
      render(
        <>
          <SearchDialog />
          <SnsShare />
        </>,
      );
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'SNSで共有' })));
      const opener = screen.getByRole('link', { name: /^LINE/ });
      opener.focus();
      fireEvent.keyDown(opener, { key: 'k', [modifier]: true });
      const input = await screen.findByRole('combobox', { name: '検索キーワード' });
      expect(input).toHaveFocus();
      await waitFor(() => expect(opener).not.toBeInTheDocument());
      fireEvent.keyDown(input, { key: 'Escape' });
      await waitFor(() => expect(screen.getByRole('button', { name: /記事・ニュースを検索/ })).toHaveFocus());
    },
  );

  it('does not open another modal over an existing dialog', () => {
    mockClient();
    render(
      <>
        <SearchDialog />
        <div role="dialog" aria-label="ナビゲーションメニュー" />
      </>,
    );
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.queryByRole('combobox', { name: '検索キーワード' })).not.toBeInTheDocument();
    expect(createSearchClient).not.toHaveBeenCalled();
  });

  it('opens the shared dialog from the home button and restores that button on Escape', async () => {
    mockClient();
    render(
      <>
        <SearchDialog />
        <HomeSearchButton />
      </>,
    );
    const home = screen.getAllByRole('button', { name: /記事・ニュースを検索/ })[1]!;
    home.focus();
    fireEvent.click(home);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox', { name: '検索キーワード' }), { key: 'Escape' });
    await waitFor(() => expect(home).toHaveFocus());
  });

  it('keeps a home search request made before the shared dialog mounts', async () => {
    mockClient();
    render(<HomeSearchButton />);
    const home = screen.getByRole('button', { name: '記事・ニュースを検索' });
    home.focus();
    fireEvent.click(home);
    render(<SearchDialog />);
    const input = await screen.findByRole('combobox', { name: '検索キーワード' });
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(home).toHaveFocus());
  });

  it('announces no results and supports retry after a failed download', async () => {
    const failed = mockClient();
    failed.load.mockRejectedValueOnce(new Error('Search unavailable'));
    const recovered = mockClient();
    vi.mocked(createSearchClient).mockReturnValueOnce(failed);
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole('button', { name: /記事・ニュースを検索/ }));
    expect(await screen.findByText('検索データを読み込めませんでした。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(await screen.findByText('キーワードを入力してください。')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '検索キーワード' }), { target: { value: '該当なし' } });
    expect(await screen.findByText('一致する記事・ニュースが見つかりません。')).toBeInTheDocument();
    expect(createSearchClient).toHaveBeenCalledTimes(2);
    expect(failed.dispose).toHaveBeenCalledOnce();
    expect(recovered.load).toHaveBeenCalledOnce();
  });

  it('shows a recoverable error if the worker cannot be created', async () => {
    mockClient();
    vi.mocked(createSearchClient).mockImplementationOnce(() => {
      throw new Error('Worker blocked');
    });
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole('button', { name: /記事・ニュースを検索/ }));
    expect(await screen.findByText('検索データを読み込めませんでした。')).toBeInTheDocument();
    expect(within(screen.getByRole('listbox')).queryByRole('option')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(await screen.findByText('キーワードを入力してください。')).toBeInTheDocument();
  });

  it('keeps initialization in progress across close and reopen without creating another worker', async () => {
    const client = mockClient();
    const loading = deferred<void>();
    client.load.mockReturnValueOnce(loading.promise);
    render(<SearchDialog />);
    const trigger = screen.getByRole('button', { name: /記事・ニュースを検索/ });
    fireEvent.click(trigger);
    expect(screen.getByText('検索を準備しています…')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox', { name: '検索キーワード' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.dispose).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    expect(screen.getByText('検索を準備しています…')).toBeInTheDocument();
    await act(async () => loading.resolve());
    expect(await screen.findByText('キーワードを入力してください。')).toBeInTheDocument();
    expect(createSearchClient).toHaveBeenCalledOnce();
    expect(client.load).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByRole('combobox', { name: '検索キーワード' }), { target: { value: '印刷' } });
    expect(await screen.findByRole('option', { name: /文書ガイド/ })).toBeInTheDocument();
  });

  it('ignores responses and failures from older queries', async () => {
    const client = mockClient();
    const oldResponse = deferred<SearchResults>();
    const oldFailure = deferred<SearchResults>();
    client.search.mockImplementation(async (query) => {
      if (query === '古い検索') return oldResponse.promise;
      if (query === '失敗する検索') return oldFailure.promise;
      return query === '印刷' ? results : { total: 0, totalMatches: 0, groups: [], nextOffset: null };
    });
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole('button', { name: /記事・ニュースを検索/ }));
    await screen.findByText('キーワードを入力してください。');
    const input = screen.getByRole('combobox', { name: '検索キーワード' });
    fireEvent.change(input, { target: { value: '古い検索' } });
    await waitFor(() => expect(client.search).toHaveBeenCalledWith('古い検索', 'all'));
    fireEvent.change(input, { target: { value: '失敗する検索' } });
    await waitFor(() => expect(client.search).toHaveBeenCalledWith('失敗する検索', 'all'));
    fireEvent.change(input, { target: { value: '印刷' } });
    expect(await screen.findByRole('option', { name: /文書ガイド/ })).toBeInTheDocument();
    await act(async () => {
      oldResponse.resolve({ total: 0, totalMatches: 0, groups: [], nextOffset: null });
      oldFailure.reject(new Error('Old request failed'));
    });
    expect(screen.getByRole('option', { name: /文書ガイド/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 件の検索結果');
    expect(client.dispose).not.toHaveBeenCalled();
  });

  it('creates a fresh worker and restores the current query after a search failure', async () => {
    const failed = mockClient();
    failed.search.mockImplementation(async (query) => {
      if (query) throw new Error('Worker stopped');
      return { total: 0, totalMatches: 0, groups: [], nextOffset: null };
    });
    const recovered = mockClient();
    vi.mocked(createSearchClient).mockReturnValueOnce(failed);
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole('button', { name: /記事・ニュースを検索/ }));
    await screen.findByText('キーワードを入力してください。');
    fireEvent.change(screen.getByRole('combobox', { name: '検索キーワード' }), { target: { value: '印刷' } });
    expect(await screen.findByText('検索データを読み込めませんでした。')).toBeInTheDocument();
    expect(failed.dispose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(await screen.findByRole('option', { name: /文書ガイド/ })).toBeInTheDocument();
    expect(recovered.search).toHaveBeenCalledWith('印刷', 'all');
    expect(createSearchClient).toHaveBeenCalledTimes(2);
  });

  it.each(['initializing', 'ready'] as const)('disposes a %s worker when unmounted', async (state) => {
    const client = mockClient();
    const loading = deferred<void>();
    if (state === 'initializing') client.load.mockReturnValueOnce(loading.promise);
    const { unmount } = render(<SearchDialog />);
    fireEvent.click(screen.getByRole('button', { name: /記事・ニュースを検索/ }));
    if (state === 'ready') await screen.findByText('キーワードを入力してください。');
    unmount();
    expect(client.dispose).toHaveBeenCalledOnce();
    if (state === 'initializing') {
      await act(async () => loading.reject(new Error('Search worker stopped')));
    }
    expect(client.dispose).toHaveBeenCalledOnce();
    expect(client.search).toHaveBeenCalledTimes(state === 'initializing' ? 0 : 1);
  });
});
