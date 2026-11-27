// SPDX-License-Identifier: MIT
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchDialog } from '@/features/search/search-dialog';

const longText = '射座ごとに標的装置の接続と得点表示を確認します。'.repeat(10);
const documents = [
  { id: '/lane/', title: 'Lane 操作ガイド', section: '', text: longText },
  { id: '/director/#lane-assignment', title: 'Director', section: '射座割', text: '大会ごとに選手を割り当てます。' },
  { id: '/vista/', title: 'Vista', section: '', text: '観客モニタへ順位を表示します。' },
];
const fetch = vi.fn<typeof globalThis.fetch>();

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SearchDialog />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // Next embeds `trailingSlash: true` from next.config.ts at build time; links keep the configured form.
  vi.stubEnv('__NEXT_TRAILING_SLASH', 'true');
  fetch.mockImplementation(() => Promise.resolve(Response.json(documents)));
  vi.stubGlobal('fetch', fetch);
});
afterEach(() => {
  fetch.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('document search', () => {
  it('loads the index when opened with Ctrl+K and links each match to its document', async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(fetch).not.toHaveBeenCalled();
    await user.keyboard('{Control>}k{/Control}');
    const dialog = screen.getByRole('dialog', { name: '文書を検索' });
    expect(await within(dialog).findByText('キーワードを入力してください。')).toBeInTheDocument();
    expect(fetch.mock.calls[0]?.[0]).toBe('/search-index.json');

    await user.type(within(dialog).getByRole('searchbox', { name: '検索キーワード' }), '射座');
    expect(await within(dialog).findByText('2 件の検索結果')).toBeInTheDocument();
    const links = within(within(dialog).getByRole('list', { name: '検索結果' })).getAllByRole('link');
    const lane = links.find((link) => link.getAttribute('href') === '/lane/');
    const director = links.find((link) => link.getAttribute('href') === '/director/#lane-assignment');
    expect(links).toHaveLength(2);
    // Each result shows its title, its section when present, and at most 160 characters of text.
    expect(lane?.querySelectorAll('p')).toHaveLength(1);
    expect(lane).toHaveTextContent('Lane 操作ガイド');
    expect(lane?.querySelector('p')?.textContent).toBe(longText.slice(0, 160));
    expect(director?.querySelectorAll('p')).toHaveLength(2);
    expect(director?.querySelector('p')).toHaveTextContent('射座割');

    // jsdom cannot navigate; the dialog must close as the link is followed.
    const blockNavigation = (event: MouseEvent) => event.preventDefault();
    window.addEventListener('click', blockNavigation);
    await user.click(director!);
    window.removeEventListener('click', blockNavigation);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reports an unavailable index and loads it again on retry', async () => {
    const user = userEvent.setup();
    fetch.mockResolvedValueOnce(new Response('missing', { status: 404 }));
    renderDialog();
    await user.click(screen.getByRole('button', { name: '文書を検索' }));
    const dialog = screen.getByRole('dialog', { name: '文書を検索' });
    expect(await within(dialog).findByText('検索データを読み込めませんでした。')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '再試行' }));
    expect(await within(dialog).findByText('キーワードを入力してください。')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
