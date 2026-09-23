import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HUNTING_LOG_STORAGE_KEY, useHuntingLogStore } from '@/app/(standalone)/labs/hunting-log/_store';
import { HuntingLogClient } from '@/app/(standalone)/labs/hunting-log/hunting-log-client';
import { useStorageStatus } from '@/lib/browser-storage';
import type { HuntingOuting } from '@/lib/schemas/hunting-log';
import { useLanguageStore } from '@/store';

// Only the shared chrome that needs the Next.js app router is stubbed.
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

const saved = (outings: HuntingOuting[]) =>
  window.localStorage.setItem(
    HUNTING_LOG_STORAGE_KEY,
    JSON.stringify({ state: { outings, prefecture: '長野県', registrationDates: {} }, version: 0 }),
  );

const deer = (id: string, date: string, mesh: string, count: number): HuntingOuting => ({
  id,
  date,
  prefecture: '長野県',
  municipality: '松本市',
  mesh,
  license: 'trap',
  catches: [{ species: 'ニホンジカ', count, gun: null }],
  note: '',
});

const reportTable = () => {
  const table = screen.getAllByRole('table')[0];
  if (!table) throw new Error('Expected a report table.');
  return table;
};

beforeEach(() => {
  useLanguageStore.setState({ language: 'ja' });
  useHuntingLogStore.setState(useHuntingLogStore.getInitialState(), true);
  window.localStorage.clear();
  useStorageStatus.setState({ available: true, discarded: [] });
});
afterEach(() => vi.restoreAllMocks());

// The tool renders from the first paint, held busy until the saved state is read; act only after that.
const loaded = async <T,>(find: () => Promise<T>) => {
  const element = await find();
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  return element;
};

describe('the hunting log', () => {
  it('renders the form before the saved log is read, held busy', () => {
    const { container } = render(<HuntingLogClient />);
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(screen.getByLabelText('出猟日'));
  });

  it('says beside the button that the outing was recorded', async () => {
    render(<HuntingLogClient />);
    fireEvent.change(await loaded(() => screen.findByLabelText('出猟日')), { target: { value: '2025-11-20' } });
    fireEvent.change(screen.getByLabelText('都道府県（狩猟者登録を受けたところ）'), { target: { value: '長野県' } });
    fireEvent.change(screen.getByLabelText('猟法（免許の種類）'), { target: { value: 'trap' } });
    fireEvent.click(screen.getByRole('button', { name: '記録を追加' }));
    const shown = screen
      .getAllByText('2025年11月20日の出猟を記録しました。')
      .filter((node) => !node.className.includes('sr-only'));
    expect(shown).toHaveLength(1);
    expect(shown[0]?.closest('.rounded-md')).toContainElement(screen.getByRole('button', { name: '記録を追加' }));
  });

  it('records an outing and adds it to the report draft', async () => {
    render(<HuntingLogClient />);
    const date = await loaded(() => screen.findByLabelText('出猟日'));
    expect(screen.getByText(/ここに報告の下書き/)).toBeInTheDocument();
    fireEvent.change(date, { target: { value: '2025-11-20' } });
    fireEvent.change(screen.getByLabelText('都道府県（狩猟者登録を受けたところ）'), { target: { value: '長野県' } });
    fireEvent.change(screen.getByLabelText('メッシュ番号等'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('猟法（免許の種類）'), { target: { value: 'trap' } });
    fireEvent.click(screen.getByRole('button', { name: '鳥獣を追加' }));
    fireEvent.change(screen.getByLabelText('鳥獣の種類 1'), { target: { value: 'ニホンジカ' } });
    fireEvent.change(screen.getByLabelText('数'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '記録を追加' }));

    const rows = within(reportTable()).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('わな猟12ニホンジカ2');
    expect(screen.getByText('2026年5月15日')).toBeInTheDocument();
    expect(useHuntingLogStore.getState().outings).toHaveLength(1);
    expect(window.localStorage.getItem(HUNTING_LOG_STORAGE_KEY)).toContain('ニホンジカ');
    // The form starts over but keeps the prefecture.
    expect(screen.getByLabelText('都道府県（狩猟者登録を受けたところ）')).toHaveValue('長野県');
    expect(screen.getByLabelText('猟法（免許の種類）')).toHaveValue('');
  });

  it('points at the missing items instead of recording', async () => {
    render(<HuntingLogClient />);
    await loaded(() => screen.findByLabelText('出猟日'));
    fireEvent.click(screen.getByRole('button', { name: '記録を追加' }));
    expect(screen.getByRole('alert')).toHaveTextContent('入力内容を確認してください。');
    expect(screen.getAllByText('入力してください。')).toHaveLength(2);
    expect(screen.getByLabelText('都道府県（狩猟者登録を受けたところ）')).toHaveFocus();
    expect(useHuntingLogStore.getState().outings).toHaveLength(0);
  });

  it('puts the field with the wrong count in focus', async () => {
    render(<HuntingLogClient />);
    await loaded(() => screen.findByLabelText('出猟日'));
    fireEvent.change(screen.getByLabelText('都道府県（狩猟者登録を受けたところ）'), { target: { value: '長野県' } });
    fireEvent.change(screen.getByLabelText('猟法（免許の種類）'), { target: { value: 'trap' } });
    fireEvent.click(screen.getByRole('button', { name: '鳥獣を追加' }));
    fireEvent.change(screen.getByLabelText('鳥獣の種類 1'), { target: { value: 'イノシシ' } });
    fireEvent.change(screen.getByLabelText('数'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: '記録を追加' }));
    expect(screen.getByLabelText('数')).toHaveFocus();
    expect(screen.getByLabelText('数')).toHaveAttribute('aria-invalid', 'true');
  });

  it('records both guns of one day in one record and splits the report (様式第十七 備考 6)', async () => {
    render(<HuntingLogClient />);
    const date = await loaded(() => screen.findByLabelText('出猟日'));
    fireEvent.change(date, { target: { value: '2025-11-20' } });
    fireEvent.change(screen.getByLabelText('都道府県（狩猟者登録を受けたところ）'), { target: { value: '長野県' } });
    fireEvent.change(screen.getByLabelText('メッシュ番号等'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('猟法（免許の種類）'), { target: { value: 'firstGun' } });
    fireEvent.click(screen.getByRole('button', { name: '鳥獣を追加' }));
    fireEvent.click(screen.getByRole('button', { name: '鳥獣を追加' }));
    fireEvent.change(screen.getByLabelText('鳥獣の種類 1'), { target: { value: 'キジ' } });
    fireEvent.change(screen.getByLabelText('鳥獣の種類 2'), { target: { value: 'キジバト' } });
    fireEvent.change(screen.getByLabelText('銃 1'), { target: { value: 'powder' } });
    fireEvent.click(screen.getByRole('button', { name: '記録を追加' }));
    // The second line has no gun yet, and that field takes the focus.
    expect(screen.getByLabelText('銃 2')).toHaveFocus();
    expect(screen.getByText('装薬銃か空気銃かを選んでください。')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('銃 2'), { target: { value: 'air' } });
    fireEvent.click(screen.getByRole('button', { name: '記録を追加' }));
    expect(useHuntingLogStore.getState().outings).toHaveLength(1);
    const [left, right] = screen.getAllByRole('table');
    expect(left).toHaveTextContent('報告事項（装薬銃を使用して捕獲等をした鳥獣）');
    expect(left).toHaveTextContent('キジ1');
    expect(right).toHaveTextContent('報告事項（空気銃を使用して捕獲等をした鳥獣）');
    expect(right).toHaveTextContent('キジバト1');
    // Another licence asks no gun.
    fireEvent.change(screen.getByLabelText('猟法（免許の種類）'), { target: { value: 'net' } });
    fireEvent.click(screen.getByRole('button', { name: '鳥獣を追加' }));
    expect(screen.queryByLabelText('銃 1')).toBeNull();
  });

  it('leaves out records before the day of registration once it is entered', async () => {
    saved([deer('a', '2025-10-20', '12', 1), deer('b', '2025-11-05', '12', 2)]);
    render(<HuntingLogClient />);
    await loaded(() => screen.findByLabelText('出猟日'));
    expect(within(reportTable()).getAllByRole('row')[1]).toHaveTextContent('ニホンジカ3');
    expect(screen.getByText(/未入力のため、有効期間を 10 月 15 日からとして集計しています/)).toBeInTheDocument();
    const registered = screen.getByLabelText('狩猟者登録を受けた日（任意）');
    fireEvent.change(registered, { target: { value: '2027-01-01' } });
    expect(screen.getByText(/この日付は保存していません/)).toBeInTheDocument();
    fireEvent.change(registered, { target: { value: '2025-11-01' } });
    expect(within(reportTable()).getAllByRole('row')[1]).toHaveTextContent('ニホンジカ2');
    expect(screen.getByText(/1 件の記録は、入力した登録日（2025年11月1日）より前の日付/)).toBeInTheDocument();
    expect(useHuntingLogStore.getState().registrationDates).toEqual({ '2025-長野県': '2025-11-01' });
    fireEvent.change(registered, { target: { value: '' } });
    expect(useHuntingLogStore.getState().registrationDates).toEqual({});
  });

  it('reads the saved log, sums it and flags dates outside any registration', async () => {
    saved([deer('a', '2025-11-20', '12', 1), deer('b', '2026-01-10', '12', 2), deer('c', '2026-07-01', '12', 1)]);
    render(<HuntingLogClient />);
    await loaded(() => screen.findByLabelText('出猟日'));
    expect(within(reportTable()).getAllByRole('row')[1]).toHaveTextContent('わな猟12ニホンジカ3');
    expect(screen.getByText(/1 件の記録は、狩猟者登録の有効期間にあたらない日付です/)).toBeInTheDocument();
    expect(screen.getByText('出猟の記録（3 件）')).toBeInTheDocument();
  });

  it('edits and deletes a record', async () => {
    saved([deer('a', '2025-11-20', '12', 1)]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<HuntingLogClient />);
    await loaded(() => screen.findByLabelText('出猟日'));
    fireEvent.click(screen.getByRole('button', { name: '2025年11月20日の記録を直す' }));
    expect(screen.getByLabelText('メッシュ番号等')).toHaveValue('12');
    fireEvent.change(screen.getByLabelText('数'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: '変更を保存' }));
    expect(within(reportTable()).getAllByRole('row')[1]).toHaveTextContent('ニホンジカ4');
    expect(useHuntingLogStore.getState().outings).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '2025年11月20日の記録を削除' }));
    expect(useHuntingLogStore.getState().outings).toHaveLength(0);
    expect(screen.getByText(/まだ記録がありません。/)).toBeInTheDocument();
  });

  it('asks for a record within the registration period when every record falls outside it', async () => {
    saved([deer('a', '2025-07-01', '12', 1)]);
    render(<HuntingLogClient />);
    await loaded(() => screen.findByLabelText('出猟日'));
    expect(screen.getByText('登録の有効期間内の記録を追加すると、報告の下書きを表示します。')).toBeInTheDocument();
    expect(screen.queryByText(/ここに報告の下書き/)).toBeNull();
  });

  it('deletes every record from the reset button after asking', async () => {
    saved([deer('a', '2025-11-20', '12', 1)]);
    render(<HuntingLogClient />);
    await loaded(() => screen.findByLabelText('出猟日'));
    fireEvent.click(screen.getByRole('button', { name: '入力を初期値に戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '初期値に戻す' }));
    expect(useHuntingLogStore.getState().outings).toHaveLength(0);
    expect(screen.getByLabelText('都道府県（狩猟者登録を受けたところ）')).toHaveValue('');
    expect(JSON.parse(window.localStorage.getItem(HUNTING_LOG_STORAGE_KEY) ?? '{}').state.outings).toEqual([]);
  });

  it('switches the interface to English and keeps the report in Japanese', async () => {
    saved([deer('a', '2025-11-20', '12', 1)]);
    render(<HuntingLogClient />);
    await loaded(() => screen.findByLabelText('出猟日'));
    act(() => useLanguageStore.setState({ language: 'en' }));
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Report draft' })).toBeInTheDocument();
    expect(within(reportTable()).getByText('免許の種類')).toBeInTheDocument();
    expect(within(reportTable()).getByText('ニホンジカ')).toBeInTheDocument();
  });

  it('says so when the saved log cannot be read, and opens empty', async () => {
    window.localStorage.setItem(
      HUNTING_LOG_STORAGE_KEY,
      JSON.stringify({ state: { outings: [{ id: 'x' }], prefecture: '長野県', registrationDates: {} }, version: 0 }),
    );
    render(<HuntingLogClient />);
    await loaded(() => screen.findByLabelText('出猟日'));
    expect(
      screen.getAllByText('保存されていた出猟の記録を読み取れなかったため、記録のない状態で開いています。'),
    ).toHaveLength(2);
    expect(useHuntingLogStore.getState().outings).toEqual([]);
  });
});
