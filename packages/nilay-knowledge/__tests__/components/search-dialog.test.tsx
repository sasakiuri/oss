import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomeSearchButton, SearchDialog } from '@/components/search-dialog';
import { SnsShare } from '@/components/sns-share';
import { createSearchClient } from '@/lib/search-client';
import type { SearchResults } from '@/lib/search-protocol';

const route = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('@/lib/search-client', () => ({ createSearchClient: vi.fn() }));

vi.mock('next/link', () => ({
  default: ({ href, children, onClick }: ComponentProps<'a'>) => (
    <a
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
  hits: [
    {
      id: '/articles/example/#print',
      type: 'articles',
      title: '文書ガイド',
      section: '印刷の準備',
      excerpt: '印刷する前に設定を確認します。',
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
    search: vi.fn(async (query: string) => (query.includes('印刷') ? value : { total: 0, hits: [] })),
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
  it('focuses main content when a selected result has no section fragment', async () => {
    mockClient({ total: 1, hits: [{ ...results.hits[0]!, id: '/articles/example/' }] });
    route.pathname = '/articles/example/';
    render(
      <>
        <SearchDialog />
        <main id="main-content" tabIndex={-1}>
          本文
        </main>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: '記事・ニュースを検索' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '印刷' } });
    fireEvent.click(await screen.findByRole('link', { name: /文書ガイド/ }));
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
    fireEvent.click(screen.getByRole('button', { name: '記事・ニュースを検索' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '印刷' } });
    fireEvent.click(await screen.findByRole('link', { name: /文書ガイド/ }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '印刷の準備' })).toHaveFocus());
  });

  it('keeps the dialog open for modified result clicks', async () => {
    mockClient();
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole('button', { name: '記事・ニュースを検索' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '印刷' } });
    fireEvent.click(await screen.findByRole('link', { name: /文書ガイド/ }), { ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('loads on demand, searches, restores focus and reuses data when reopened', async () => {
    const client = mockClient();
    render(<SearchDialog />);
    expect(createSearchClient).not.toHaveBeenCalled();
    const trigger = screen.getByRole('button', { name: '記事・ニュースを検索' });
    trigger.focus();
    fireEvent.click(trigger);
    const input = screen.getByRole('searchbox', { name: '検索キーワード' });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '印刷' } });
    expect(await screen.findByRole('link', { name: /文書ガイド/ })).toHaveAttribute('href', '/articles/example/#print');
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(await screen.findByRole('link', { name: /文書ガイド/ })).toBeInTheDocument();
    expect(createSearchClient).toHaveBeenCalledTimes(1);
    expect(client.load).toHaveBeenCalledTimes(1);
    expect(client.dispose).not.toHaveBeenCalled();
  });

  it.each(['ctrlKey', 'metaKey'])('opens with %s+K and closes after choosing a result', async (modifier) => {
    mockClient();
    render(<SearchDialog />);
    fireEvent.keyDown(window, { key: 'k', [modifier]: true });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '印刷' } });
    fireEvent.click(await screen.findByRole('link', { name: /文書ガイド/ }));
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
      const input = await screen.findByRole('searchbox');
      expect(input).toHaveFocus();
      await waitFor(() => expect(opener).not.toBeInTheDocument());
      fireEvent.keyDown(input, { key: 'Escape' });
      await waitFor(() => expect(screen.getByRole('button', { name: '記事・ニュースを検索' })).toHaveFocus());
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
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
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
    const home = screen.getAllByRole('button', { name: '記事・ニュースを検索' })[1]!;
    home.focus();
    fireEvent.click(home);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    await waitFor(() => expect(home).toHaveFocus());
  });

  it('announces no results and supports retry after a failed download', async () => {
    const failed = mockClient();
    failed.load.mockRejectedValueOnce(new Error('Search unavailable'));
    const recovered = mockClient();
    vi.mocked(createSearchClient).mockReturnValueOnce(failed);
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole('button', { name: '記事・ニュースを検索' }));
    expect(await screen.findByText('検索データを読み込めませんでした。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(await screen.findByText('キーワードを入力してください。')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '該当なし' } });
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
    fireEvent.click(screen.getByRole('button', { name: '記事・ニュースを検索' }));
    expect(await screen.findByText('検索データを読み込めませんでした。')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(await screen.findByText('キーワードを入力してください。')).toBeInTheDocument();
  });

  it('keeps initialization in progress across close and reopen without creating another worker', async () => {
    const client = mockClient();
    const loading = deferred<void>();
    client.load.mockReturnValueOnce(loading.promise);
    render(<SearchDialog />);
    const trigger = screen.getByRole('button', { name: '記事・ニュースを検索' });
    fireEvent.click(trigger);
    expect(screen.getByText('検索を準備しています…')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.dispose).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    expect(screen.getByText('検索を準備しています…')).toBeInTheDocument();
    await act(async () => loading.resolve());
    expect(await screen.findByText('キーワードを入力してください。')).toBeInTheDocument();
    expect(createSearchClient).toHaveBeenCalledOnce();
    expect(client.load).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '印刷' } });
    expect(await screen.findByRole('link', { name: /文書ガイド/ })).toBeInTheDocument();
  });

  it('ignores responses and failures from older queries', async () => {
    const client = mockClient();
    const oldResponse = deferred<SearchResults>();
    const oldFailure = deferred<SearchResults>();
    client.search.mockImplementation(async (query) => {
      if (query === '古い検索') return oldResponse.promise;
      if (query === '失敗する検索') return oldFailure.promise;
      return query === '印刷' ? results : { total: 0, hits: [] };
    });
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole('button', { name: '記事・ニュースを検索' }));
    await screen.findByText('キーワードを入力してください。');
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: '古い検索' } });
    await waitFor(() => expect(client.search).toHaveBeenCalledWith('古い検索'));
    fireEvent.change(input, { target: { value: '失敗する検索' } });
    await waitFor(() => expect(client.search).toHaveBeenCalledWith('失敗する検索'));
    fireEvent.change(input, { target: { value: '印刷' } });
    expect(await screen.findByRole('link', { name: /文書ガイド/ })).toBeInTheDocument();
    await act(async () => {
      oldResponse.resolve({ total: 0, hits: [] });
      oldFailure.reject(new Error('Old request failed'));
    });
    expect(screen.getByRole('link', { name: /文書ガイド/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 件の検索結果');
    expect(client.dispose).not.toHaveBeenCalled();
  });

  it('creates a fresh worker and restores the current query after a search failure', async () => {
    const failed = mockClient();
    failed.search.mockImplementation(async (query) => {
      if (query) throw new Error('Worker stopped');
      return { total: 0, hits: [] };
    });
    const recovered = mockClient();
    vi.mocked(createSearchClient).mockReturnValueOnce(failed);
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole('button', { name: '記事・ニュースを検索' }));
    await screen.findByText('キーワードを入力してください。');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '印刷' } });
    expect(await screen.findByText('検索データを読み込めませんでした。')).toBeInTheDocument();
    expect(failed.dispose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(await screen.findByRole('link', { name: /文書ガイド/ })).toBeInTheDocument();
    expect(recovered.search).toHaveBeenCalledWith('印刷');
    expect(createSearchClient).toHaveBeenCalledTimes(2);
  });

  it.each(['initializing', 'ready'] as const)('disposes a %s worker when unmounted', async (state) => {
    const client = mockClient();
    const loading = deferred<void>();
    if (state === 'initializing') client.load.mockReturnValueOnce(loading.promise);
    const { unmount } = render(<SearchDialog />);
    fireEvent.click(screen.getByRole('button', { name: '記事・ニュースを検索' }));
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
