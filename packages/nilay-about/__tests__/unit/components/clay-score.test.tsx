import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useClayScoreStore } from '@/app/(standalone)/labs/clay-score/_store';
import { ClayScoreClient } from '@/app/(standalone)/labs/clay-score/clay-score-client';
import { discardedSaveMessage } from '@/components/labs';
import { useStorageStatus } from '@/lib/browser-storage';
import { useLanguageStore } from '@/store';

// Whole-page runs through several sections; under a parallel suite jsdom can take longer than the default 5 s.
const SLOW_TEST_MS = 15_000;

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

const hitButton = () => screen.getByRole('button', { name: '初矢 ①' });
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
    expect(screen.queryByRole('table', { name: 'このラウンドの射台別の命中' })).toBeNull();
    fireEvent.click(hitButton());
    expect(screen.getByRole('table', { name: 'このラウンドの射台別の命中' })).toBeInTheDocument();
  });

  it(
    'records targets in order and tallies them by station',
    async () => {
      render(<ClayScoreClient />);
      await settled();
      await screen.findByText('次：1 枚目・射台 1');
      fireEvent.click(hitButton());
      fireEvent.click(hitButton());
      fireEvent.click(missButton());
      expect(screen.getByText('次：4 枚目・射台 4')).toBeInTheDocument();
      expect(within(lead()).getByText('2')).toBeInTheDocument();
      expect(screen.getByText('失中 1 枚')).toBeInTheDocument();
      // The hit rate and the first-barrel rate are both 2 of 3.
      expect(screen.getAllByText('67%')).toHaveLength(2);
      expect(screen.getByRole('button', { name: '3 枚目・射台 3：失中' })).toBeInTheDocument();
      const status = screen.getAllByRole('status').filter((node) => node.className.includes('sr-only'))[1];
      expect(status).toHaveTextContent('3 枚目 失中。3 枚中 2 枚命中。');
      // A box steps through first barrel, second barrel, miss and not recorded.
      fireEvent.click(screen.getByRole('button', { name: '3 枚目・射台 3：失中' }));
      expect(screen.getByRole('button', { name: '3 枚目・射台 3：未記録' })).toBeInTheDocument();
      expect(screen.getByText('次：3 枚目・射台 3')).toBeInTheDocument();
    },
    SLOW_TEST_MS,
  );

  it('relabels the stations from the starting station without losing results', async () => {
    render(<ClayScoreClient />);
    await settled();
    await screen.findByLabelText('開始射台');
    fireEvent.click(hitButton());
    fireEvent.change(screen.getByLabelText('開始射台'), { target: { value: '4' } });
    expect(screen.getByRole('button', { name: '1 枚目・射台 4：初矢で命中' })).toBeInTheDocument();
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
      for (let index = 0; index < 24; index++) useClayScoreStore.getState().mark(index === 7 ? 'miss' : 'first');
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
    expect(saved.state.records[0]).toMatchObject({ discipline: 'trap', startStation: 1, barrels: true });
    // The first shooter's sheet stays where an earlier save kept it.
    expect(saved.state.results).toHaveLength(25);
  });

  it('resets the sheet but keeps the saved rounds', async () => {
    render(<ClayScoreClient />);
    await settled();
    await screen.findByText('次：1 枚目・射台 1');
    act(() => {
      for (let index = 0; index < 25; index++) useClayScoreStore.getState().mark('first');
      useClayScoreStore.getState().saveRound();
      useClayScoreStore.getState().setDiscipline('skeet');
      useClayScoreStore.getState().mark('miss');
    });
    fireEvent.click(screen.getByRole('button', { name: '入力を初期値に戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '初期値に戻す' }));
    const state = useClayScoreStore.getState();
    expect(state.discipline).toBe('trap');
    expect(state.shooters[0]!.results.every((result) => result === null)).toBe(true);
    expect(state.records).toHaveLength(1);
  });

  it('switches every label, including the last announcement, to English', async () => {
    render(<ClayScoreClient />);
    await settled();
    await screen.findByText('次：1 枚目・射台 1');
    fireEvent.click(hitButton());
    act(() => useLanguageStore.getState().setLanguage('en'));
    expect(screen.getByText('Next: Target 2, station 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'First ①' })).toBeInTheDocument();
    const status = screen.getAllByRole('status').filter((node) => node.className.includes('sr-only'))[1];
    expect(status).toHaveTextContent('Target 1 hit with the first barrel. 1 of 1 hit.');
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
    expect(useClayScoreStore.getState().shooters[0]!.startStation).toBe(1);
  });

  it('reads a sheet in progress saved before the added fields, without a discard notice', async () => {
    const results = Array.from({ length: 25 }, (_, index) => (index < 2 ? 'hit' : null));
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        state: { discipline: 'skeet', startStation: 1, results, note: '射撃場A', records: [] },
        version: 0,
      }),
    );
    render(<ClayScoreClient />);
    await settled();
    await screen.findByText('次：3 枚目・射台 1・ダブル・ローハウス');
    expect(screen.getByLabelText('メモ')).toHaveValue('射撃場A');
    expect(screen.queryByText(discardedSaveMessage('ja'))).toBeNull();
  });

  it('records plain hits when the barrels are turned off, and only before the round starts', async () => {
    render(<ClayScoreClient />);
    await settled();
    const barrels = await screen.findByLabelText('初矢と二の矢を分けて記録する');
    fireEvent.click(barrels);
    fireEvent.click(screen.getByRole('button', { name: '命中 ○' }));
    expect(screen.getByLabelText('初矢と二の矢を分けて記録する')).toBeDisabled();
    expect(useClayScoreStore.getState().shooters[0]!.results[0]).toBe('hit');
  });

  it('records the result and the direction in one tap and tallies by direction', async () => {
    render(<ClayScoreClient />);
    await settled();
    fireEvent.click(await screen.findByLabelText('クレーの飛んだ方向も記録する'));
    fireEvent.click(screen.getByRole('button', { name: '初矢 ①・左' }));
    fireEvent.click(screen.getByRole('button', { name: '失中 ×・右' }));
    expect(screen.getByRole('button', { name: '2 枚目・射台 2：失中・右' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'このラウンドの方向別の命中' });
    expect(within(table).getByRole('row', { name: /左/ })).toHaveTextContent('1 / 1');
    expect(within(table).getByRole('row', { name: /右/ })).toHaveTextContent('0 / 1');
  });

  it(
    'scores a squad in shooting order and saves one round per shooter',
    async () => {
      render(<ClayScoreClient />);
      await settled();
      fireEvent.change(await screen.findByLabelText('射手の人数'), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText('射順 1 の名前'), { target: { value: 'Aki' } });
      fireEvent.change(screen.getByLabelText('射順 2 の名前'), { target: { value: 'Ben' } });
      expect(screen.getByLabelText('射順 2 の開始射台')).toHaveValue('2');
      expect(screen.getByText('次：Aki・1 枚目・射台 1')).toBeInTheDocument();
      fireEvent.click(hitButton());
      expect(screen.getByText('次：Ben・1 枚目・射台 2')).toBeInTheDocument();
      act(() => {
        for (let turn = 1; turn < 50; turn++) useClayScoreStore.getState().mark(turn % 2 === 0 ? 'first' : 'miss');
      });
      fireEvent.click(screen.getByRole('button', { name: 'このラウンドを保存' }));
      const records = useClayScoreStore.getState().records;
      expect(
        records.map((record) => [record.shooter, record.results.filter((result) => result !== 'miss').length]),
      ).toEqual([
        ['Aki', 25],
        ['Ben', 0],
      ]);
      expect(records[0]!.sessionId).toBe(records[1]!.sessionId);
    },
    SLOW_TEST_MS,
  );

  it(
    'records with the assigned keys, and a key can be reassigned',
    async () => {
      render(<ClayScoreClient />);
      await settled();
      act(() => useClayScoreStore.getState().setKeysEnabled(true));
      fireEvent.keyDown(window, { key: '1' });
      fireEvent.keyDown(window, { key: '0' });
      expect(useClayScoreStore.getState().shooters[0]!.results.slice(0, 2)).toEqual(['first', 'miss']);
      fireEvent.keyDown(window, { key: 'Backspace' });
      expect(useClayScoreStore.getState().shooters[0]!.results[1]).toBeNull();
      // Typing in a field is left alone.
      fireEvent.keyDown(screen.getByLabelText('メモ'), { key: '1' });
      expect(useClayScoreStore.getState().shooters[0]!.results[1]).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /キーボード・リモコンでの入力/ }));
      fireEvent.click(screen.getByRole('button', { name: '初矢で命中のキーを割り当てる' }));
      fireEvent.keyDown(window, { key: 'AudioVolumeUp' });
      expect(useClayScoreStore.getState().keyMap.first).toBe('AudioVolumeUp');
      fireEvent.keyDown(window, { key: 'AudioVolumeUp' });
      expect(useClayScoreStore.getState().shooters[0]!.results[1]).toBe('first');
    },
    SLOW_TEST_MS,
  );

  it(
    'filters the history by tag and draws the trend once there are two rounds',
    async () => {
      render(<ClayScoreClient />);
      await settled();
      act(() => {
        const store = useClayScoreStore.getState();
        store.setTag('range', 'A');
        for (let index = 0; index < 25; index++) useClayScoreStore.getState().mark('first');
        useClayScoreStore.getState().saveRound();
        useClayScoreStore.getState().setTag('range', 'B');
        for (let index = 0; index < 25; index++) useClayScoreStore.getState().mark(index < 5 ? 'miss' : 'second');
        useClayScoreStore.getState().saveRound();
      });
      fireEvent.click(screen.getByRole('button', { name: /ラウンドの履歴/ }));
      expect(screen.getByRole('img', { name: /スコアの推移。2 ラウンド/ })).toBeInTheDocument();
      expect(screen.getByText(/トラップ 2 ラウンド・平均 22.5 枚・最高 25 枚・初矢命中率 50%/)).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('射撃場で絞り込む'), { target: { value: 'B' } });
      expect(screen.getByText(/絞り込んだトラップ 1 ラウンド・平均 20 枚/)).toBeInTheDocument();
      expect(screen.queryByRole('img', { name: /スコアの推移/ })).toBeNull();
    },
    SLOW_TEST_MS,
  );
});
