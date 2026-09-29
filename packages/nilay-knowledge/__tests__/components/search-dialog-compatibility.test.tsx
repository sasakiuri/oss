import { fireEvent, render, screen } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchDialog } from '@/components/search-dialog';
import { createSearchClient } from '@/lib/search-client';
import { SearchIndexCompatibilityError } from '@/lib/search-errors';
import { refreshSearchPage } from '@/lib/search-index-format';
import type { SearchResults, SearchScope } from '@/lib/search-protocol';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/lib/search-client', () => ({ createSearchClient: vi.fn() }));
vi.mock('@/lib/search-index-format', () => ({ refreshSearchPage: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) => (
    <a {...props} href={href}>
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
      matches: [{ id: '/articles/example/#print', section: '印刷の準備', excerpt: '印刷します。' }],
    },
  ],
};

beforeEach(() => {
  vi.mocked(createSearchClient).mockReset();
  vi.mocked(refreshSearchPage).mockClear();
});

function client() {
  const value = {
    load: vi.fn().mockResolvedValue(undefined),
    search: vi.fn(async (_query: string, _scope?: SearchScope, _offset?: number) => results),
    dispose: vi.fn(),
  };
  vi.mocked(createSearchClient).mockReturnValue(value);
  return value;
}

describe('incompatible search data recovery', () => {
  it('offers explicit refresh rather than retrying incompatible initialization', async () => {
    const value = client();
    value.load.mockRejectedValue(new SearchIndexCompatibilityError());
    render(<SearchDialog />, { wrapper: withNuqsTestingAdapter({ searchParams: '?q=印刷', hasMemory: true }) });
    const refresh = await screen.findByRole('button', { name: 'ページを更新' });
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('検索データの形式が変更されました。');
    expect(value.load).toHaveBeenCalledOnce();
    expect(value.dispose).not.toHaveBeenCalled();
    expect(refreshSearchPage).not.toHaveBeenCalled();
    fireEvent.click(refresh);
    expect(refreshSearchPage).toHaveBeenCalledExactlyOnceWith('印刷', 'all');
  });

  it('preserves a healthy target and passes the latest query and PDF target to refresh', async () => {
    const value = client();
    const transferred = Object.assign(new Error('Incompatible'), { name: 'SearchIndexCompatibilityError' });
    value.search.mockImplementation(async (_query, scope) => {
      if (scope === 'pdf') throw transferred;
      return results;
    });
    render(<SearchDialog />, {
      wrapper: withNuqsTestingAdapter({ searchParams: '?q=印刷&type=pdf', hasMemory: true }),
    });
    await screen.findByRole('button', { name: 'ページを更新' });
    const target = screen.getByRole('combobox', { name: '検索対象' });
    fireEvent.change(target, { target: { value: 'all' } });
    await screen.findByRole('option', { name: /文書ガイド/ });
    expect(screen.queryByRole('button', { name: 'ページを更新' })).not.toBeInTheDocument();
    fireEvent.change(target, { target: { value: 'pdf' } });
    await screen.findByRole('button', { name: 'ページを更新' });
    fireEvent.change(screen.getByRole('combobox', { name: '検索キーワード' }), {
      target: { value: '印刷 確認' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'ページを更新' }));
    expect(refreshSearchPage).toHaveBeenCalledExactlyOnceWith('印刷 確認', 'pdf');
    expect(value.dispose).not.toHaveBeenCalled();
    expect(createSearchClient).toHaveBeenCalledOnce();
  });

  it('normalizes non-Error failures as ordinary retryable errors', async () => {
    const value = client();
    value.load.mockRejectedValue('Unexpected transport failure');
    render(<SearchDialog />, { wrapper: withNuqsTestingAdapter({ searchParams: '?q=印刷', hasMemory: true }) });
    expect(await screen.findByRole('button', { name: '再試行' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ページを更新' })).not.toBeInTheDocument();
    expect(value.dispose).toHaveBeenCalledOnce();
    expect(refreshSearchPage).not.toHaveBeenCalled();
  });
});
