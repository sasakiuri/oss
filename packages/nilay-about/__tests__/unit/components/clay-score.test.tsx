import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useClayScoreStore } from '@/app/(standalone)/labs/clay-score/_store';
import { ClayScoreClient } from '@/app/(standalone)/labs/clay-score/clay-score-client';
import { discardedSaveMessage } from '@/components/labs';
import { useStorageStatus } from '@/lib/browser-storage';
import { useLanguageStore } from '@/store';

// Only the shared chrome is stubbed: it needs the Next.js app router, which a unit render has not mounted.
vi.mock('@/components/labs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/labs')>();
  const { createElement } = await import('react');
  return {
    ...actual,
    AppLayout: ({ header, children }: { header: ReactNode; children: ReactNode }) =>
      createElement('div', null, header, children),
    AppHeader: ({ title, actions }: { title: string; actions?: ReactNode }) =>
      createElement('header', null, title, actions),
    LanguageMenu: () => null,
  };
});

const hitButton = () => screen.getByRole('button', { name: '命中 ○' });
const missButton = () => screen.getByRole('button', { name: '失中 ×' });
// The sheet is on the page from the first render, held busy until the saved records are read.
const settled = () => waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
const lead = () => screen.getByText('命中', { selector: 'p' }).parentElement as HTMLElement;

describe('clay score sheet', () => {
  beforeEach(() => {
    useClayScoreStore.setState(useClayScoreStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders the sheet before the saved records are read, and holds it busy until then', async () => {
    const { container } = render(<ClayScoreClient />);
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(hitButton());
    await settled();
  });

  it('leaves the station table out until a target is recorded', async () => {
    render(<ClayScoreClient />);
    await settled();
    expect(screen.queryByRole('table', { name: '射台別の命中' })).toBeNull();
    fireEvent.click(hitButton());
    expect(screen.getByRole('table', { name: '射台別の命中' })).toBeInTheDocument();
  });

  it('records targets in order and tallies them by station', async () => {
    render(<ClayScoreClient />);
    await settled();
    await screen.findByText('次：1 枚目・射台 1');
    fireEvent.click(hitButton());
    fireEvent.click(hitButton());
    fireEvent.click(missButton());
    expect(screen.getByText('次：4 枚目・射台 4')).toBeInTheDocument();
    expect(within(lead()).getByText('2')).toBeInTheDocument();
    expect(screen.getByText('失中 1 枚')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3 枚目・射台 3：失中' })).toBeInTheDocument();
    const status = screen.getAllByRole('status').filter((node) => node.className.includes('sr-only'))[1];
    expect(status).toHaveTextContent('3 枚目 失中。3 枚中 2 枚命中。');
    // A box steps through hit, miss and not recorded.
    fireEvent.click(screen.getByRole('button', { name: '3 枚目・射台 3：失中' }));
    expect(screen.getByRole('button', { name: '3 枚目・射台 3：未記録' })).toBeInTheDocument();
    expect(screen.getByText('次：3 枚目・射台 3')).toBeInTheDocument();
  });

  it('relabels the stations from the starting station without losing results', async () => {
    render(<ClayScoreClient />);
    await settled();
    await screen.findByLabelText('開始射台');
    fireEvent.click(hitButton());
    fireEvent.change(screen.getByLabelText('開始射台'), { target: { value: '4' } });
    expect(screen.getByRole('button', { name: '1 枚目・射台 4：命中' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3 枚目・射台 1：未記録' })).toBeInTheDocument();
  });

  it('lays out skeet in the rule book order and asks before clearing a round', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ClayScoreClient />);
    await settled();
    await screen.findByText('次：1 枚目・射台 1');
    fireEvent.click(hitButton());
    fireEvent.click(screen.getByRole('radio', { name: 'スキート' }));
    expect(confirm).toHaveBeenCalled();
    expect(useClayScoreStore.getState().discipline).toBe('trap');
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('radio', { name: 'スキート' }));
    expect(useClayScoreStore.getState().discipline).toBe('skeet');
    expect(screen.getByText('次：1 枚目・射台 1・シングル・ハイハウス')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '20 枚目・射台 4・ダブル・ハイハウス：未記録' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '25 枚目・射台 8・シングル・ローハウス：未記録' })).toBeInTheDocument();
  });

  it('saves only a full round, then opens a clean sheet and lists it in the history', async () => {
    render(<ClayScoreClient />);
    await settled();
    await screen.findByText('次：1 枚目・射台 1');
    const save = screen.getByRole('button', { name: 'このラウンドを保存' });
    expect(save).toBeDisabled();
    // 24 through the store, so the render stays quick; the last one through the button.
    act(() => {
      for (let index = 0; index < 24; index++) useClayScoreStore.getState().mark(index === 7 ? 'miss' : 'hit');
    });
    expect(save).toBeDisabled();
    fireEvent.click(hitButton());
    expect(screen.getByText('25 枚すべて記録しました。')).toBeInTheDocument();
    expect(hitButton()).toBeDisabled();
    fireEvent.click(save);
    expect(screen.getByText('ラウンドを保存しました。')).toBeInTheDocument();
    expect(useClayScoreStore.getState().records).toHaveLength(1);
    expect(screen.getByText('次：1 枚目・射台 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ラウンドの履歴/ })).toHaveTextContent(
      'トラップ 1 ラウンド・平均 24 枚・最高 24 枚',
    );
    const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    expect(saved.state.records[0]).toMatchObject({ discipline: 'trap', startStation: 1 });
  });

  it('resets the sheet but keeps the saved rounds', async () => {
    render(<ClayScoreClient />);
    await settled();
    await screen.findByText('次：1 枚目・射台 1');
    act(() => {
      for (let index = 0; index < 25; index++) useClayScoreStore.getState().mark('hit');
      useClayScoreStore.getState().saveRound();
      useClayScoreStore.getState().setDiscipline('skeet');
      useClayScoreStore.getState().mark('miss');
    });
    fireEvent.click(screen.getByRole('button', { name: '入力を初期値に戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '初期値に戻す' }));
    const state = useClayScoreStore.getState();
    expect(state.discipline).toBe('trap');
    expect(state.results.every((result) => result === null)).toBe(true);
    expect(state.records).toHaveLength(1);
  });

  it('switches every label, including the last announcement, to English', async () => {
    render(<ClayScoreClient />);
    await settled();
    await screen.findByText('次：1 枚目・射台 1');
    fireEvent.click(hitButton());
    act(() => useLanguageStore.getState().setLanguage('en'));
    expect(screen.getByText('Next: Target 2, station 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hit ○' })).toBeInTheDocument();
    const status = screen.getAllByRole('status').filter((node) => node.className.includes('sr-only'))[1];
    expect(status).toHaveTextContent('Target 1 hit. 1 of 1 hit.');
    expect(status).toHaveAttribute('lang', 'en');
  });

  it('opens with the defaults and says so when the save cannot be read', async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ state: { discipline: 'trap', startStation: 9, results: [], note: '', records: [] } }),
    );
    render(<ClayScoreClient />);
    await settled();
    await screen.findByText('次：1 枚目・射台 1');
    await waitFor(() => expect(screen.getAllByText(discardedSaveMessage('ja')).length).toBeGreaterThan(0));
    expect(useClayScoreStore.getState().startStation).toBe(1);
  });

  it('restores a saved sheet in progress', async () => {
    const results = Array.from({ length: 25 }, (_, index) => (index < 2 ? 'hit' : null));
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ state: { discipline: 'skeet', startStation: 1, results, note: '射撃場A', records: [] } }),
    );
    render(<ClayScoreClient />);
    await settled();
    await screen.findByText('次：3 枚目・射台 1・ダブル・ローハウス');
    expect(screen.getByLabelText('メモ（射撃場・銃・装弾など）')).toHaveValue('射撃場A');
  });
});
