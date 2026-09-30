import { act, fireEvent, render as testingRender, screen, waitFor } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchDialog } from '@/components/search-dialog';
import { createSearchClient } from '@/lib/search-client';
import { SearchIndexError } from '@/lib/search-errors';
import type { SearchResults, SearchScope } from '@/lib/search-protocol';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/lib/search-client', () => ({ createSearchClient: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) => (
    <a {...props} href={href}>
      {children}
    </a>
  ),
}));

const articles: SearchResults = {
  generation: 1,
  total: 1,
  totalMatches: 1,
  nextOffset: null,
  groups: [
    {
      id: '/articles/example/',
      type: 'articles',
      title: '文書ガイド',
      totalMatches: 1,
      nextMatchOffset: null,
      matches: [{ id: '/articles/example/#print', section: '印刷の準備', excerpt: '印刷します。' }],
    },
  ],
};
const pdf: SearchResults = {
  ...articles,
  groups: [
    {
      id: '/content/articles/example/file.pdf',
      type: 'pdf',
      title: 'PDF資料ガイド',
      totalMatches: 1,
      nextMatchOffset: null,
      matches: [{ id: '/content/articles/example/file.pdf#page=2', section: '2 ページ', excerpt: '印刷します。' }],
    },
  ],
};

beforeEach(() => vi.mocked(createSearchClient).mockReset());

function mockClient() {
  const client = {
    load: vi.fn().mockResolvedValue(undefined),
    search: vi.fn(async (query: string, scope?: SearchScope, _offset?: number): Promise<SearchResults> => {
      if (!query.trim()) return { generation: 1, total: 0, totalMatches: 0, groups: [], nextOffset: null };
      return scope === 'pdf' ? pdf : articles;
    }),
    matches: vi.fn(async () => ({ generation: 1, id: '/articles/example/', total: 1, matches: [], nextOffset: null })),
    dispose: vi.fn(),
  };
  vi.mocked(createSearchClient).mockReturnValue(client);
  return client;
}

function render(searchParams = '?q=印刷') {
  return testingRender(<SearchDialog />, { wrapper: withNuqsTestingAdapter({ searchParams, hasMemory: true }) });
}

function changeTarget(type: SearchScope) {
  fireEvent.change(screen.getByRole('combobox', { name: '検索対象' }), { target: { value: type } });
}

describe('target-isolated search dialog recovery', () => {
  it('starts directly in PDF search without initializing the article index', async () => {
    const client = mockClient();
    client.load.mockRejectedValue(new SearchIndexError('Article unavailable'));
    render('?q=印刷&type=pdf');
    expect(await screen.findByRole('option', { name: /PDF資料ガイド/ })).toHaveAttribute(
      'href',
      '/content/articles/example/file.pdf#page=2',
    );
    expect(client.load).not.toHaveBeenCalled();
    expect(client.search).toHaveBeenCalledWith('印刷', 'pdf');
    expect(client.dispose).not.toHaveBeenCalled();
  });

  it('switches away from failed article initialization without recreating the worker', async () => {
    const client = mockClient();
    client.load.mockRejectedValueOnce(new SearchIndexError('Article unavailable'));
    render();
    await screen.findByText('検索データを読み込めませんでした。');
    changeTarget('pdf');
    expect(await screen.findByRole('option', { name: /PDF資料ガイド/ })).toBeInTheDocument();
    expect(createSearchClient).toHaveBeenCalledOnce();
    expect(client.dispose).not.toHaveBeenCalled();
  });

  it('retries article initialization in the same worker and returns focus to the input', async () => {
    const client = mockClient();
    client.load.mockRejectedValueOnce(new SearchIndexError('Article unavailable'));
    render();
    fireEvent.click(await screen.findByRole('button', { name: '再試行' }));
    expect(await screen.findByRole('option', { name: /文書ガイド/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '検索キーワード' })).toHaveFocus();
    expect(client.load).toHaveBeenCalledTimes(2);
    expect(createSearchClient).toHaveBeenCalledOnce();
    expect(client.dispose).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)('ignores stale article initialization: %s', async (completion) => {
    const client = mockClient();
    const pending = Promise.withResolvers<void>();
    client.load.mockReturnValueOnce(pending.promise);
    render();
    await waitFor(() => expect(client.load).toHaveBeenCalledOnce());
    changeTarget('pdf');
    await screen.findByRole('option', { name: /PDF資料ガイド/ });
    await act(async () => {
      if (completion === 'resolve') pending.resolve();
      else pending.reject(new SearchIndexError('Old article failure'));
    });
    expect(screen.getByRole('option', { name: /PDF資料ガイド/ })).toBeInTheDocument();
    expect(screen.queryByText('検索データを読み込めませんでした。')).not.toBeInTheDocument();
    expect(client.dispose).not.toHaveBeenCalled();
  });

  it('preserves a healthy target across PDF failure and retries with query and focus intact', async () => {
    const client = mockClient();
    let failPdf = true;
    client.search.mockImplementation(async (_query, scope) => {
      if (scope === 'pdf' && failPdf) throw new SearchIndexError('PDF unavailable');
      return scope === 'pdf' ? pdf : articles;
    });
    render();
    await screen.findByRole('option', { name: /文書ガイド/ });
    changeTarget('pdf');
    await screen.findByText('検索データを読み込めませんでした。');
    changeTarget('all');
    await screen.findByRole('option', { name: /文書ガイド/ });
    changeTarget('pdf');
    const retry = await screen.findByRole('button', { name: '再試行' });
    failPdf = false;
    fireEvent.click(retry);
    await screen.findByRole('option', { name: /PDF資料ガイド/ });
    expect(screen.getByRole('combobox', { name: '検索キーワード' })).toHaveValue('印刷');
    expect(screen.getByRole('combobox', { name: '検索キーワード' })).toHaveFocus();
    expect(screen.getByRole('combobox', { name: '検索対象' })).toHaveValue('pdf');
    expect(createSearchClient).toHaveBeenCalledOnce();
    expect(client.load).toHaveBeenCalledOnce();
    expect(client.dispose).not.toHaveBeenCalled();
  });

  it('ignores an old PDF search failure after a healthy target has returned', async () => {
    const client = mockClient();
    const pending = Promise.withResolvers<SearchResults>();
    client.search.mockImplementation(async (_query, scope) => (scope === 'pdf' ? pending.promise : articles));
    render('?q=印刷&type=pdf');
    await waitFor(() => expect(client.search).toHaveBeenCalledWith('印刷', 'pdf'));
    changeTarget('all');
    await screen.findByRole('option', { name: /文書ガイド/ });
    await act(async () => pending.reject(new SearchIndexError('Old PDF failure')));
    expect(screen.getByRole('option', { name: /文書ガイド/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
    expect(client.dispose).not.toHaveBeenCalled();
  });

  it('retains the worker after a recoverable pagination error', async () => {
    const client = mockClient();
    client.search.mockImplementation(async (_query, scope, offset) => {
      if (offset) throw new SearchIndexError('Temporary index failure');
      return scope === 'pdf' ? pdf : { ...articles, nextOffset: 1 };
    });
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'もっと見る' }));
    await screen.findByText('検索データを読み込めませんでした。');
    changeTarget('pdf');
    await screen.findByRole('option', { name: /PDF資料ガイド/ });
    expect(createSearchClient).toHaveBeenCalledOnce();
    expect(client.dispose).not.toHaveBeenCalled();
  });
});
