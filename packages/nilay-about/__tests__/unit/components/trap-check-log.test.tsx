import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TRAP_CHECK_LOG_STORAGE_KEY, useTrapCheckLogStore } from '@/app/(standalone)/labs/trap-check-log/_store';
import { TrapCheckLogClient, discardedLogMessage } from '@/app/(standalone)/labs/trap-check-log/trap-check-log-client';
import { useStorageStatus } from '@/lib/browser-storage';
import type { Trap } from '@/lib/schemas/trap-check-log';
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

const NOW = new Date('2026-09-22T12:00:00');

const savedTrap = (overrides: Partial<Trap> = {}): Trap => ({
  id: 'saved-1',
  name: '沢 1 号',
  kind: 'kukuri',
  installedAt: '2026-09-20T06:00',
  location: '林道の分岐',
  latitude: null,
  longitude: null,
  removedAt: null,
  checks: [{ id: 'c1', at: '2026-09-21T10:00', result: 'nothing', note: '' }],
  ...overrides,
});

const seed = (traps: Trap[], intervalHours = 24) =>
  window.localStorage.setItem(
    TRAP_CHECK_LOG_STORAGE_KEY,
    JSON.stringify({ state: { intervalHours, traps }, version: 0 }),
  );

// Rendered from the first paint and held busy until the saved log is read.
const renderReady = async () => {
  const { container } = render(<TrapCheckLogClient />);
  expect(container.querySelector('[aria-busy="true"]')).toContainElement(screen.getByLabelText('識別名'));
  await waitFor(() => expect(container.querySelector('[aria-busy]')).toHaveAttribute('aria-busy', 'false'));
};

const saved = () => JSON.parse(window.localStorage.getItem(TRAP_CHECK_LOG_STORAGE_KEY) ?? 'null');

describe('the trap check log', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    useTrapCheckLogStore.setState(useTrapCheckLogStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers a trap after naming what is missing, and stores it on this device', async () => {
    await renderReady();
    expect(screen.getByText(/まだわなが登録されていません/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '登録する' }));
    expect(screen.getByText('入力してください。')).toBeInTheDocument();
    expect(screen.getByLabelText('識別名')).toHaveFocus();

    fireEvent.change(screen.getByLabelText('識別名'), { target: { value: '尾根 2 号' } });
    fireEvent.change(screen.getByLabelText('種類'), { target: { value: 'hako' } });
    fireEvent.change(screen.getByLabelText('設置日時'), { target: { value: '2026-09-22T06:00' } });
    fireEvent.change(screen.getByLabelText('緯度'), { target: { value: '35.5' } });
    fireEvent.click(screen.getByRole('button', { name: '登録する' }));
    expect(screen.getByText('緯度を入れる場合は経度も入力してください。')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('経度'), { target: { value: '139.25' } });
    fireEvent.click(screen.getByRole('button', { name: '登録する' }));

    const card = screen.getByRole('group', { name: '尾根 2 号' });
    expect(within(card).getByText(/はこわな/)).toBeInTheDocument();
    // 6 hours since setting, 18 left of the default 24.
    expect(
      within(card).getByText('設置から（見回り記録なし） 6 時間 0 分。次の見回りまで あと 18 時間 0 分'),
    ).toBeInTheDocument();
    expect(screen.getByText('「尾根 2 号」を登録しました。')).toBeInTheDocument();
    expect(saved().state.traps[0]).toMatchObject({
      name: '尾根 2 号',
      kind: 'hako',
      latitude: 35.5,
      longitude: 139.25,
    });
  });

  it('warns about a trap past the interval, and stops once the interval is widened', async () => {
    seed([savedTrap()]);
    await renderReady();
    const card = screen.getByRole('group', { name: '沢 1 号' });
    // 26 hours since the round at 10:00 the day before.
    expect(within(card).getByText('【間隔超過】')).toBeInTheDocument();
    expect(
      within(card).getByText(/最後の見回りから 1 日 2 時間 0 分。間隔を 2 時間 0 分 超えています。/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('設置中 1 基のうち 1 基が、見回り間隔 24 時間を過ぎています。')).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText(/見回り間隔/), { target: { value: '26' } });
    expect(within(card).queryByText('【間隔超過】')).toBeNull();
    expect(within(card).getByText(/次の見回りまで あと 0 分/)).toBeInTheDocument();
    expect(saved().state.intervalHours).toBe(26);

    // A value outside the range is marked, and the warnings keep the last one that passed.
    fireEvent.change(screen.getByLabelText(/見回り間隔/), { target: { value: '0' } });
    expect(screen.getByText('1 から 168 までの整数で入力してください。')).toBeInTheDocument();
    expect(saved().state.intervalHours).toBe(26);
  });

  it('records a round with the current minute and clears the warning', async () => {
    seed([savedTrap()]);
    await renderReady();
    const card = screen.getByRole('group', { name: '沢 1 号' });
    fireEvent.click(within(card).getByRole('button', { name: '見回りを記録' }));
    expect(within(card).getByLabelText('見回り日時')).toHaveValue('2026-09-22T12:00');
    fireEvent.change(within(card).getByLabelText('結果'), { target: { value: 'caught' } });
    fireEvent.click(within(card).getByRole('button', { name: '記録する' }));
    expect(within(card).queryByText('【間隔超過】')).toBeNull();
    expect(within(card).getByText('最後の見回りから 0 分。次の見回りまで あと 1 日 0 時間 0 分')).toBeInTheDocument();
    expect(saved().state.traps[0].checks).toHaveLength(2);
    expect(saved().state.traps[0].checks[1]).toMatchObject({ at: '2026-09-22T12:00', result: 'caught' });
  });

  it('registers with the time of saving when the page was left open and the time was not edited', async () => {
    vi.setSystemTime(new Date('2026-09-22T06:00:00'));
    await renderReady();
    expect(screen.getByLabelText('設置日時')).toHaveValue('2026-09-22T06:00');
    // Six hours later, with the page still open and the field untouched.
    vi.setSystemTime(new Date('2026-09-22T12:00:20'));
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(screen.getByLabelText('設置日時')).toHaveValue('2026-09-22T12:00');
    fireEvent.change(screen.getByLabelText('識別名'), { target: { value: '尾根' } });
    fireEvent.click(screen.getByRole('button', { name: '登録する' }));
    expect(saved().state.traps[0]).toMatchObject({ name: '尾根', installedAt: '2026-09-22T12:00' });
    expect(
      within(screen.getByRole('group', { name: '尾根' })).getByText(
        '設置から（見回り記録なし） 0 分。次の見回りまで あと 1 日 0 時間 0 分',
      ),
    ).toBeInTheDocument();
  });

  it('keeps a setting time the person typed, however long the page stays open', async () => {
    await renderReady();
    fireEvent.change(screen.getByLabelText('設置日時'), { target: { value: '2026-09-22T05:30' } });
    vi.setSystemTime(new Date('2026-09-22T13:00:00'));
    fireEvent.change(screen.getByLabelText('識別名'), { target: { value: '尾根' } });
    fireEvent.click(screen.getByRole('button', { name: '登録する' }));
    expect(saved().state.traps[0]).toMatchObject({ installedAt: '2026-09-22T05:30' });
  });

  it('records a round left open with the time of saving', async () => {
    seed([savedTrap()]);
    await renderReady();
    const card = screen.getByRole('group', { name: '沢 1 号' });
    fireEvent.click(within(card).getByRole('button', { name: '見回りを記録' }));
    vi.setSystemTime(new Date('2026-09-22T12:40:10'));
    fireEvent.click(within(card).getByRole('button', { name: '記録する' }));
    expect(saved().state.traps[0].checks[1]).toMatchObject({ at: '2026-09-22T12:40' });
    expect(within(card).getByText('最後の見回りから 0 分。次の見回りまで あと 1 日 0 時間 0 分')).toBeInTheDocument();
  });

  it('refuses a round dated before the trap was set', async () => {
    seed([savedTrap()]);
    await renderReady();
    const card = screen.getByRole('group', { name: '沢 1 号' });
    fireEvent.click(within(card).getByRole('button', { name: '見回りを記録' }));
    fireEvent.change(within(card).getByLabelText('見回り日時'), { target: { value: '2026-09-19T06:00' } });
    fireEvent.click(within(card).getByRole('button', { name: '記録する' }));
    expect(within(card).getByText('設置日時（2026-09-20 06:00）より前の見回りは記録できません。')).toBeInTheDocument();
    expect(within(card).getByLabelText('見回り日時')).toHaveFocus();
    expect(useTrapCheckLogStore.getState().traps[0]?.checks).toHaveLength(1);
  });

  it('points out saved rounds that all come before the setting time', async () => {
    seed([savedTrap({ checks: [{ id: 'c0', at: '2026-09-19T06:00', result: 'nothing', note: '' }] })]);
    await renderReady();
    expect(
      within(screen.getByRole('group', { name: '沢 1 号' })).getByText(
        /設置から（見回りの記録がすべて設置日時より前のため数えていません。日時を確認してください）/,
      ),
    ).toBeInTheDocument();
  });

  it('puts the interval back to its default on reset and keeps the traps', async () => {
    seed([savedTrap()], 48);
    await renderReady();
    expect(screen.getByLabelText(/見回り間隔/)).toHaveValue(48);
    fireEvent.click(screen.getByRole('button', { name: '入力を初期値に戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '初期値に戻す' }));
    expect(screen.getByLabelText(/見回り間隔/)).toHaveValue(24);
    expect(screen.getByRole('group', { name: '沢 1 号' })).toBeInTheDocument();
    expect(saved().state).toMatchObject({ intervalHours: 24, traps: [{ name: '沢 1 号' }] });
  });

  it('switches every label, including the status line, to English', async () => {
    seed([savedTrap()]);
    await renderReady();
    act(() => useLanguageStore.setState({ language: 'en' }));
    expect(screen.getByRole('heading', { name: 'Traps' })).toBeInTheDocument();
    const card = screen.getByRole('group', { name: '沢 1 号' });
    expect(within(card).getByText('[Overdue]')).toBeInTheDocument();
    expect(
      within(card).getByText(/1 d 2 h 0 min since the last round\. 2 h 0 min past the interval\./),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
  });

  it('shows the counts, export and print only once there is a trap', async () => {
    await renderReady();
    expect(screen.queryByText('間隔を過ぎたわな')).toBeNull();
    expect(screen.queryByRole('button', { name: 'CSV に書き出す' })).toBeNull();
    expect(screen.queryByRole('button', { name: '印刷する' })).toBeNull();
    fireEvent.change(screen.getByLabelText('識別名'), { target: { value: '尾根 2 号' } });
    fireEvent.click(screen.getByRole('button', { name: '登録する' }));
    expect(screen.getByText('間隔を過ぎたわな')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CSV に書き出す' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '印刷する' })).toBeInTheDocument();
  });

  it('says so when the saved log cannot be read, and opens empty', async () => {
    window.localStorage.setItem(
      TRAP_CHECK_LOG_STORAGE_KEY,
      JSON.stringify({ state: { intervalHours: 24, traps: [{ name: 'broken' }] }, version: 0 }),
    );
    await renderReady();
    expect(screen.getAllByText(discardedLogMessage('ja'))).toHaveLength(2);
    expect(screen.getByText(/まだわなが登録されていません/)).toBeInTheDocument();
  });

  it('deletes every record only after confirming', async () => {
    seed([savedTrap()]);
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: /この端末への保存/ }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: '記録をすべて削除' }));
    expect(screen.getByRole('group', { name: '沢 1 号' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '記録をすべて削除' }));
    expect(screen.queryByRole('group', { name: '沢 1 号' })).toBeNull();
    expect(saved().state.traps).toEqual([]);
    confirm.mockRestore();
  });
});
