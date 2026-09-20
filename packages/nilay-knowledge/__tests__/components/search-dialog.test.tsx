import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HomeSearchButton, SearchDialog } from '@/components/search-dialog';
import type { SearchDocument } from '@/lib/content/types';

const route = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

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

const documents: SearchDocument[] = [
  {
    id: '/articles/example/#print',
    type: 'articles',
    title: '文書ガイド',
    section: '印刷の準備',
    tags: ['資料'],
    text: '印刷する前に設定を確認します。',
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  route.pathname = '/';
});

function mockFetch() {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => documents });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('site search dialog', () => {
  it('focuses main content when a selected result has no section fragment', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => [{ ...documents[0], id: '/articles/example/' }],
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
    fireEvent.click(screen.getByRole('button', { name: '記事・ニュースを検索' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '印刷' } });
    fireEvent.click(await screen.findByRole('link', { name: /文書ガイド/ }));
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  });

  it('focuses a selected section instead of returning to the opener', async () => {
    mockFetch();
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
    mockFetch();
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole('button', { name: '記事・ニュースを検索' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '印刷' } });
    fireEvent.click(await screen.findByRole('link', { name: /文書ガイド/ }), { ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('loads on demand, searches, restores focus and reuses data when reopened', async () => {
    const fetch = mockFetch();
    render(<SearchDialog />);
    expect(fetch).not.toHaveBeenCalled();
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
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['ctrlKey', 'metaKey'])('opens with %s+K and closes after choosing a result', async (modifier) => {
    mockFetch();
    render(<SearchDialog />);
    fireEvent.keyDown(window, { key: 'k', [modifier]: true });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '印刷' } });
    fireEvent.click(await screen.findByRole('link', { name: /文書ガイド/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens the shared dialog from the home button and restores that button on Escape', async () => {
    mockFetch();
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
    const fetch = mockFetch();
    fetch.mockResolvedValueOnce({ ok: false });
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole('button', { name: '記事・ニュースを検索' }));
    expect(await screen.findByText('検索データを読み込めませんでした。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(await screen.findByText('キーワードを入力してください。')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '該当なし' } });
    expect(await screen.findByText('一致する記事・ニュースが見つかりません。')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('shows a recoverable error for malformed search data', async () => {
    mockFetch().mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'https://example.com/' }] });
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole('button', { name: '記事・ニュースを検索' }));
    expect(await screen.findByText('検索データを読み込めませんでした。')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
