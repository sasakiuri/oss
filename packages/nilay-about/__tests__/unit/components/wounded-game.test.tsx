import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useWoundedGameStore } from '@/app/(standalone)/labs/wounded-game/_store';
import { WoundedGameClient } from '@/app/(standalone)/labs/wounded-game/wounded-game-client';
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

const spokenRegions = () =>
  screen.getAllByRole('status').filter((node) => node.tagName === 'P' && node.className.includes('sr-only'));

// The tool is on the page from the first paint and held busy until the saved state is read.
const ready = () => waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
const leadFigure = () => screen.getByText('資料が示す最も長い待ち時間').parentElement as HTMLElement;

beforeEach(() => {
  useWoundedGameStore.setState(useWoundedGameStore.getInitialState(), true);
  window.localStorage.clear();
  useStorageStatus.setState({ available: true, discarded: [] });
  useLanguageStore.setState({ language: 'ja' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reading the signs', () => {
  it('leads with the start time and the time left once the shot time is known', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 8, 23, 16, 50) });
    try {
      render(<WoundedGameClient />);
      await ready();
      fireEvent.click(screen.getByRole('radio', { name: '胸（心臓・肺）' }));
      fireEvent.change(screen.getByLabelText('撃った時刻'), { target: { value: '2026-09-23T16:40' } });
      const start = screen.getByText('追跡開始の目安').parentElement as HTMLElement;
      expect(within(start).getByText('9/23 17:10')).toHaveClass('text-3xl');
      expect(within(start).getByText('あと 20 分（撃ってから 10 分）')).toBeInTheDocument();
      expect(within(leadFigure()).getByText('30 分以上')).not.toHaveClass('text-3xl');
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts from an uncertain hit and an hour’s wait', async () => {
    const { container } = render(<WoundedGameClient />);
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(screen.getByText('撃った直後の状況'));
    await ready();
    expect(screen.getByRole('radio', { name: '分からない' })).toBeChecked();
    expect(within(leadFigure()).getByText('1 時間以上')).toBeInTheDocument();
    expect(within(leadFigure()).getByText('資料によって 30 分から分かれます。')).toBeInTheDocument();
    expect(screen.getByText('撃った時刻を入力してください。')).toBeInTheDocument();
  });

  it('moves to six hours and the food rule when a gut sign is ticked', async () => {
    render(<WoundedGameClient />);
    await ready();
    fireEvent.click(screen.getByRole('checkbox', { name: '緑がかった液・脂・透明な液' }));
    expect(screen.getByRole('heading', { name: '腹（腸）に当たった場合の目安' })).toBeInTheDocument();
    expect(within(leadFigure()).getByText('6 時間以上')).toBeInTheDocument();
    expect(screen.getByText(/腹部に着弾した個体を食用に供さないこと/)).toBeInTheDocument();
    expect(useWoundedGameStore.getState().cues).toEqual(['gut-fluid']);
  });

  it('gives the start time from the time of the shot', async () => {
    render(<WoundedGameClient />);
    await ready();
    fireEvent.click(screen.getByRole('radio', { name: '胸（心臓・肺）' }));
    fireEvent.change(screen.getByLabelText('撃った時刻'), { target: { value: '2026-09-23T16:40' } });
    // A chest hit's longest minimum is the firearm course's 30 minutes: 16:40 + 0:30.
    expect(screen.getByText('9/23 17:10')).toBeInTheDocument();
    await waitFor(
      () => {
        const summary = spokenRegions()[1];
        if (!summary) throw new Error('Expected the settled summary region.');
        expect(summary.textContent).toBe(
          '胸（心臓・肺）に当たった場合の目安：資料が示す最も長い待ち時間は30 分以上。追跡開始の目安は 9/23 17:10 以降。',
        );
      },
      { timeout: 2000 },
    );
  });

  it('puts the approach before any wait when the downed animal is in sight', async () => {
    render(<WoundedGameClient />);
    await ready();
    fireEvent.change(screen.getByLabelText('撃った時刻'), { target: { value: '2026-09-23T16:40' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '倒れた個体が見えている' }));
    expect(screen.getByRole('heading', { name: '倒れた個体が見えている場合' })).toBeInTheDocument();
    expect(screen.getByText('例外（近づき方を先に確認）')).toBeInTheDocument();
    // Missouri Hunter Safety Course, Approaching Downed Game: wait a short distance away for a few
    // minutes and watch for any rise and fall of the chest, even when it appears dead.
    // The first is the lead answer; the same passage is repeated in the closed finishing section.
    const [approach] = screen.getAllByText(/上側かつ頭の後方から慎重に近づき/, { selector: 'p' });
    expect(approach).toHaveTextContent(
      '死んでいるように見えても、少し離れた場所で数分待ち、胸の上下の動きがないかを見ます。',
    );
    expect(screen.queryByText('資料が示す最も長い待ち時間')).toBeNull();
    expect(screen.queryByText('追跡開始の目安')).toBeNull();
    expect(screen.queryByText('9/23 17:40')).toBeNull();
    // The waits stay, for the animal dropping out of view.
    expect(screen.getByRole('heading', { name: '見えなくなった場合の待ち時間' })).toBeInTheDocument();
    await waitFor(
      () => {
        const summary = spokenRegions()[1];
        if (!summary) throw new Error('Expected the settled summary region.');
        expect(summary.textContent).toContain('待ち時間の例外');
      },
      { timeout: 2000 },
    );
    fireEvent.click(screen.getByRole('checkbox', { name: '倒れた個体が見えている' }));
    expect(screen.getByText('9/23 17:40')).toBeInTheDocument();
  });

  it('switches to English, citations included', async () => {
    render(<WoundedGameClient />);
    await ready();
    act(() => useLanguageStore.getState().setLanguage('en'));
    expect(screen.getByText('Right after the shot')).toBeInTheDocument();
    expect(
      within(screen.getByText('Longest wait in the sources').parentElement as HTMLElement).getByText('1 h or more'),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Missouri Bowhunter Safety Course/).length).toBeGreaterThan(0);
  });
});

describe('the trail log', () => {
  it('withdraws the undo offer on reset, so the cleared log stays empty', async () => {
    render(<WoundedGameClient />);
    await ready();
    fireEvent.change(screen.getByLabelText('時刻'), { target: { value: '2026-09-23T17:15' } });
    fireEvent.click(screen.getByRole('button', { name: '記録を追加' }));
    fireEvent.click(screen.getByRole('button', { name: '9/23 17:15 の血痕を削除' }));
    expect(screen.getByRole('button', { name: '元に戻す' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '入力を初期値に戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '初期値に戻す' }));
    expect(screen.queryByRole('button', { name: '元に戻す' })).toBeNull();
    expect(useWoundedGameStore.getState().entries).toHaveLength(0);
  });

  it('withdraws the undo offer once a new entry is added', async () => {
    render(<WoundedGameClient />);
    await ready();
    fireEvent.change(screen.getByLabelText('時刻'), { target: { value: '2026-09-23T17:15' } });
    fireEvent.click(screen.getByRole('button', { name: '記録を追加' }));
    fireEvent.click(screen.getByRole('button', { name: '9/23 17:15 の血痕を削除' }));
    fireEvent.click(screen.getByRole('button', { name: '記録を追加' }));
    expect(screen.queryByRole('button', { name: '元に戻す' })).toBeNull();
  });

  it('offers to undo a deleted entry', async () => {
    render(<WoundedGameClient />);
    await ready();
    fireEvent.change(screen.getByLabelText('時刻'), { target: { value: '2026-09-23T17:15' } });
    fireEvent.change(screen.getByLabelText('メモ（目印・血の量・向きなど）'), { target: { value: '倒木の手前' } });
    fireEvent.click(screen.getByRole('button', { name: '記録を追加' }));
    fireEvent.click(screen.getByRole('button', { name: '9/23 17:15 の血痕を削除' }));
    expect(screen.queryByText('倒木の手前')).toBeNull();
    expect(screen.getByText('9/23 17:15 の血痕を削除しました。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(screen.getByText('倒木の手前')).toBeInTheDocument();
    expect(useWoundedGameStore.getState().entries[0]).toMatchObject({ at: '2026-09-23T17:15', note: '倒木の手前' });
  });

  it('adds an entry without a position and lists it', async () => {
    render(<WoundedGameClient />);
    await ready();
    fireEvent.change(screen.getByLabelText('時刻'), { target: { value: '2026-09-23T17:15' } });
    fireEvent.change(screen.getByLabelText('メモ（目印・血の量・向きなど）'), { target: { value: '倒木の手前' } });
    fireEvent.click(screen.getByRole('button', { name: '記録を追加' }));
    expect(screen.getByText('倒木の手前')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '9/23 17:15 の血痕を削除' })).toBeInTheDocument();
    expect(useWoundedGameStore.getState().entries[0]).toMatchObject({
      at: '2026-09-23T17:15',
      kind: 'blood',
      note: '倒木の手前',
      position: null,
    });
  });

  it('writes nothing when the location is asked for and cannot be read', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) =>
          failure({ code: 1, message: 'denied' } as GeolocationPositionError),
      },
    });
    render(<WoundedGameClient />);
    await ready();
    fireEvent.click(screen.getByRole('checkbox', { name: '現在地を付ける' }));
    fireEvent.click(screen.getByRole('button', { name: '記録を追加' }));
    expect(screen.getByRole('alert')).toHaveTextContent('現在地を取得できず、記録していません。');
    expect(useWoundedGameStore.getState().entries).toEqual([]);
  });

  it('measures later entries from the located shot site', async () => {
    const fixes = [
      { latitude: 35, longitude: 135, accuracy: 5 },
      { latitude: 35.001, longitude: 135, accuracy: 7.6 },
    ];
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: fixes.shift(), timestamp: 0 } as unknown as GeolocationPosition),
      },
    });
    render(<WoundedGameClient />);
    await ready();
    fireEvent.click(screen.getByRole('checkbox', { name: '現在地を付ける' }));
    fireEvent.change(screen.getByLabelText('記録の種類'), { target: { value: 'shot-site' } });
    fireEvent.change(screen.getByLabelText('時刻'), { target: { value: '2026-09-23T17:00' } });
    fireEvent.click(screen.getByRole('button', { name: '記録を追加' }));
    fireEvent.change(screen.getByLabelText('記録の種類'), { target: { value: 'blood' } });
    fireEvent.change(screen.getByLabelText('時刻'), { target: { value: '2026-09-23T17:20' } });
    fireEvent.click(screen.getByRole('button', { name: '記録を追加' }));
    // 0.001° of latitude is 111.2 m.
    expect(screen.getByText('35.00100, 135.00000（誤差 約 8 m）・被弾地点から直線 111 m')).toBeInTheDocument();
  });

  it('clears the signs and the log on reset', async () => {
    render(<WoundedGameClient />);
    await ready();
    fireEvent.click(screen.getByRole('checkbox', { name: '泡が混じる血' }));
    fireEvent.click(screen.getByRole('button', { name: '記録を追加' }));
    expect(useWoundedGameStore.getState().entries).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '入力を初期値に戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '初期値に戻す' }));
    expect(useWoundedGameStore.getState()).toMatchObject({ shotAt: '', impression: 'unsure', cues: [], entries: [] });
    expect(screen.getByRole('checkbox', { name: '泡が混じる血' })).not.toBeChecked();
    expect(screen.getByText('まだ記録はありません。')).toBeInTheDocument();
  });
});

describe('saved data', () => {
  const saved = (entries: object[], extra: object = {}) =>
    JSON.stringify({
      state: { state: { shotAt: '', impression: 'unsure', cues: [], entries, ...extra } },
      version: 0,
    });
  const entryA = { id: 'a', at: '2026-09-23T17:00', kind: 'blood', note: '血痕A', position: null };

  it('keeps an entry another tab added, even before its storage event arrives', async () => {
    render(<WoundedGameClient />);
    await ready();
    // Tab A writes its entry; this tab has not been told yet.
    window.localStorage.setItem(storageKey, saved([entryA]));
    fireEvent.change(screen.getByLabelText('メモ（目印・血の量・向きなど）'), { target: { value: '血痕B' } });
    fireEvent.click(screen.getByRole('button', { name: '記録を追加' }));
    expect(useWoundedGameStore.getState().entries.map((entry) => entry.note)).toEqual(['血痕A', '血痕B']);
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    expect(stored.state.state.entries.map((entry: { note: string }) => entry.note)).toEqual(['血痕A', '血痕B']);
    expect(screen.getByText('血痕A')).toBeInTheDocument();
  });

  it('saves a tick as a tick when another tab ticked the same sign first', async () => {
    render(<WoundedGameClient />);
    await ready();
    const box = screen.getByRole('checkbox', { name: '泡が混じる血' });
    expect(box).not.toBeChecked();
    // Another tab has already saved the tick; this tab still shows the box empty and is ticked here too.
    window.localStorage.setItem(storageKey, saved([entryA], { cues: ['frothy'], impression: 'chest' }));
    fireEvent.click(box);
    expect(useWoundedGameStore.getState().cues).toEqual(['frothy']);
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    expect(stored.state.state.cues).toEqual(['frothy']);
    // The other tab's entry and setting survive this tab's write.
    expect(stored.state.state.entries.map((entry: { note: string }) => entry.note)).toEqual(['血痕A']);
    expect(stored.state.state.impression).toBe('chest');
  });

  it('saves an untick as an untick when another tab unticked it first', async () => {
    render(<WoundedGameClient />);
    await ready();
    fireEvent.click(screen.getByRole('checkbox', { name: '泡が混じる血' }));
    window.localStorage.setItem(storageKey, saved([], { cues: [] }));
    fireEvent.click(screen.getByRole('checkbox', { name: '泡が混じる血' }));
    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? '{}').state.state.cues).toEqual([]);
  });

  it('writes the chosen value of other settings onto another tab’s log', async () => {
    render(<WoundedGameClient />);
    await ready();
    window.localStorage.setItem(storageKey, saved([entryA]));
    fireEvent.click(screen.getByRole('radio', { name: '腹（腸）' }));
    fireEvent.change(screen.getByLabelText('撃った時刻'), { target: { value: '2026-09-23T16:00' } });
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}').state.state;
    expect(stored).toMatchObject({ impression: 'gut', shotAt: '2026-09-23T16:00' });
    expect(stored.entries.map((entry: { note: string }) => entry.note)).toEqual(['血痕A']);
  });

  it('reads in another tab’s change when its storage event arrives', async () => {
    render(<WoundedGameClient />);
    await ready();
    window.localStorage.setItem(storageKey, saved([entryA], { cues: ['frothy'] }));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: storageKey }));
    });
    await screen.findByText('血痕A');
    expect(screen.getByRole('checkbox', { name: '泡が混じる血' })).toBeChecked();
  });

  it('ignores storage events for other keys', async () => {
    render(<WoundedGameClient />);
    await ready();
    window.localStorage.setItem(storageKey, saved([entryA]));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'nilay-labs-hunting-log-v1' }));
    });
    expect(screen.queryByText('血痕A')).toBeNull();
  });

  it('treats a saved time that does not exist as damaged', async () => {
    window.localStorage.setItem(storageKey, saved([], { shotAt: '2026-02-30T25:99' }));
    render(<WoundedGameClient />);
    await ready();
    expect(screen.getAllByText(discardedSaveMessage('ja')).length).toBeGreaterThan(0);
    expect(useWoundedGameStore.getState().shotAt).toBe('');
  });

  it('restores a saved trail', async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        state: {
          state: {
            shotAt: '2026-09-23T16:00',
            impression: 'gut',
            cues: [],
            entries: [{ id: 'a', at: '2026-09-23T16:30', kind: 'lost', note: '沢の手前', position: null }],
          },
        },
        version: 0,
      }),
    );
    render(<WoundedGameClient />);
    await screen.findByText('沢の手前');
    expect(screen.getByRole('radio', { name: '腹（腸）' })).toBeChecked();
    // 16:00 + 6 h.
    expect(screen.getByText('9/23 22:00')).toBeInTheDocument();
  });

  it('says so when the saved trail cannot be read, and opens empty', async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        state: { state: { shotAt: 'yesterday', impression: 'gut', cues: [], entries: [] } },
        version: 0,
      }),
    );
    render(<WoundedGameClient />);
    await ready();
    expect(screen.getAllByText(discardedSaveMessage('ja')).length).toBeGreaterThan(0);
    expect(screen.getByRole('radio', { name: '分からない' })).toBeChecked();
  });
});
