// SPDX-License-Identifier: MIT
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Catalog } from '@/features/reference/catalog';

const titles = [
  'Lane manual',
  'Vista display',
  'Backup guide',
  'MQTT topics',
  'Director operations',
  'Printing',
  'Lane devices',
];
const catalog = titles.map((title, index) => ({
  id: `doc-${index}`,
  title,
  href: `/${title.toLowerCase().replaceAll(' ', '-')}/`,
  description: `${title} の概要`,
}));
const fetch = vi.fn<typeof globalThis.fetch>();

function renderCatalog(url: string) {
  window.history.replaceState(null, '', url);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Catalog />
    </QueryClientProvider>,
  );
}
const location = () => `${window.location.pathname}${window.location.search}`;
const shownTitles = () =>
  within(screen.getByRole('table', { name: '文書一覧' }))
    .getAllByRole('link')
    .map((link) => link.textContent);
const topPages = () => screen.getByRole('navigation', { name: '一覧の上のページ切り替え' });
const bottomPages = () => screen.getByRole('navigation', { name: 'ページ切り替え' });

beforeEach(() => {
  // Next embeds `trailingSlash: true` from next.config.ts at build time; links keep the configured form.
  vi.stubEnv('__NEXT_TRAILING_SLASH', 'true');
  fetch.mockImplementation(() => Promise.resolve(Response.json(catalog)));
  vi.stubGlobal('fetch', fetch);
});
afterEach(() => {
  fetch.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.replaceState(null, '', '/');
});

describe('reference catalog', () => {
  it('shows five sorted documents per page and keeps the page in the URL', async () => {
    const user = userEvent.setup();
    renderCatalog('/reference/');
    expect(await screen.findByRole('table', { name: '文書一覧' })).toBeInTheDocument();
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/catalog/');
    expect(screen.getByText('7 件の文書')).toBeInTheDocument();
    expect(shownTitles()).toEqual([
      'Backup guide',
      'Director operations',
      'Lane devices',
      'Lane manual',
      'MQTT topics',
    ]);
    expect(screen.getByRole('link', { name: 'Lane manual' })).toHaveAttribute('href', '/lane-manual/');
    expect(within(topPages()).getByRole('link', { name: '2' })).toHaveAttribute('href', '/reference/?page=2');
    expect(topPages()).toHaveTextContent('1 / 2 ・ 1–5 / 7 件');

    await user.click(within(topPages()).getByRole('link', { name: '次へ' }));
    expect(location()).toBe('/reference/?page=2');
    expect(shownTitles()).toEqual(['Printing', 'Vista display']);
    expect(topPages()).toHaveTextContent('2 / 2 ・ 6–7 / 7 件');

    await user.click(within(bottomPages()).getByRole('button', { name: '前へ' }));
    expect(location()).toBe('/reference/?page=1');
    expect(shownTitles()[0]).toBe('Backup guide');
  });

  it('restores the page and order from the URL and keeps both while sorting', async () => {
    const user = userEvent.setup();
    renderCatalog('/reference/?page=2&sort=desc');
    await screen.findByRole('table', { name: '文書一覧' });
    expect(shownTitles()).toEqual(['Director operations', 'Backup guide']);
    expect(within(topPages()).getByRole('link', { name: '1' })).toHaveAttribute('href', '/reference/?page=1&sort=desc');

    const header = screen.getByRole('columnheader', { name: /文書名/ });
    await user.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(location()).toBe('/reference/?page=2');
    expect(shownTitles()).toEqual(['Printing', 'Vista display']);

    await user.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(location()).toBe('/reference/?page=2&sort=desc');
  });

  it('filters by title from the first page and follows browser history', async () => {
    const user = userEvent.setup();
    renderCatalog('/reference/?page=2');
    await screen.findByRole('table', { name: '文書一覧' });
    await user.type(screen.getByRole('textbox', { name: '文書名で検索' }), 'LANE');
    await user.click(screen.getByRole('button', { name: '絞り込む' }));
    expect(location()).toBe('/reference/?q=LANE');
    expect(screen.getByText('2 件の文書')).toBeInTheDocument();
    expect(shownTitles()).toEqual(['Lane devices', 'Lane manual']);
    expect(within(topPages()).getByRole('link', { name: '1' })).toHaveAttribute('href', '/reference/?q=LANE&page=1');

    window.history.pushState(null, '', '/reference/?q=vista');
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(screen.getByRole('textbox', { name: '文書名で検索' })).toHaveValue('vista');
    expect(shownTitles()).toEqual(['Vista display']);
  });

  it('offers a retry when the catalog cannot be loaded', async () => {
    const user = userEvent.setup();
    fetch.mockResolvedValueOnce(Response.json({ title: 'Unavailable' }, { status: 503 }));
    renderCatalog('/reference/');
    expect(await screen.findByText('一覧を読み込めませんでした。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '再試行' }));
    expect(await screen.findByText('7 件の文書')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
