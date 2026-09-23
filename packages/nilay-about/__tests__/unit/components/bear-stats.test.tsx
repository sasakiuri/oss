import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useBearStatsStore } from '@/app/(standalone)/labs/bear-stats/_store';
import { BearStatsClient } from '@/app/(standalone)/labs/bear-stats/bear-stats-client';
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

async function open() {
  const { container } = render(<BearStatsClient />);
  await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());
}

const lead = () => screen.getByText(/・全国・|・Japan・/).parentElement!;

describe('bear statistics', () => {
  beforeEach(() => {
    useBearStatsStore.setState(useBearStatsStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  it('renders the figures with the defaults, held busy until the saved choices are read', async () => {
    const { container } = render(<BearStatsClient />);
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy).toHaveAttribute('inert');
    expect(within(busy as HTMLElement).getByText('令和7年度・全国・被害件数')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());
  });

  it('opens on the last whole year of injuries and announces it once settled', async () => {
    await open();
    // injury-qe.pdf 計 R07: 216 件.
    expect(within(lead()).getByText('216')).toBeInTheDocument();
    expect(screen.getByText('内訳：ツキノワグマ 211・ヒグマ 5')).toBeInTheDocument();
    const summary = spokenRegions()[1]!;
    await waitFor(() => expect(summary.textContent).toBe('令和7年度、全国の被害件数は 216 件（速報値）。'), {
      timeout: 2000,
    });
  });

  it('follows the dataset, the area, the year and the measure', async () => {
    await open();
    fireEvent.click(screen.getByRole('radio', { name: '死亡者数' }));
    expect(within(lead()).getByText('13')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('地域'), { target: { value: 'akita' } });
    // 秋田 R07: 4 deaths.
    expect(screen.getByText('令和7年度・秋田県・死亡者数').parentElement).toHaveTextContent('4人');
    fireEvent.click(screen.getByRole('radio', { name: '捕獲数' }));
    // capture-qe.pdf 秋田 R07: 2,691 頭.
    expect(screen.getByText('令和7年度・秋田県・捕獲数（計）').parentElement).toHaveTextContent('2,691頭');
    expect(screen.getByText('捕獲数の月別の数値は公表されていません。')).toBeInTheDocument();
  });

  it('moves to a year the dataset has and compares a part year with the same months', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('年度'), { target: { value: '2010' } });
    fireEvent.click(screen.getByRole('radio', { name: '出没件数' }));
    // Sightings start in FY2022, so the choice moves there.
    expect(useBearStatsStore.getState().year).toBe(2022);
    expect(screen.getByLabelText('年度')).toHaveValue('2022');
    fireEvent.change(screen.getByLabelText('年度'), { target: { value: '2026' } });
    expect(within(lead()).getByText('17,362')).toBeInTheDocument();
    expect(screen.getByText(/年度途中（7月分まで）/)).toBeInTheDocument();
    expect(screen.getByText('前年度の同じ期間（4月〜7月）').parentElement).toHaveTextContent('12,716');
  });

  it('says a figure is not published instead of showing zero', async () => {
    await open();
    fireEvent.click(screen.getByRole('radio', { name: '出没件数' }));
    fireEvent.change(screen.getByLabelText('地域'), { target: { value: 'hokkaido' } });
    expect(screen.getByText('北海道は出没数を公表していません（資料の注記）。')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /都道府県別の出没件数/ });
    expect(
      within(within(table).getByRole('rowheader', { name: '北海道' }).closest('tr')!).getByText('掲載なし'),
    ).toBeInTheDocument();
    // Every month of the current year is unpublished too, not 「未集計」.
    fireEvent.change(screen.getByLabelText('年度'), { target: { value: '2026' } });
    const monthly = screen.getByRole('table', { name: /北海道の出没件数（月別）/ });
    const cells = within(monthly)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelector('td')?.textContent);
    expect(cells).toEqual(Array(12).fill('掲載なし'));
  });

  it('counts bear emergency shootings and keeps wild boar out', async () => {
    await open();
    fireEvent.click(screen.getByRole('radio', { name: '緊急銃猟' }));
    expect(within(lead()).getByText('57')).toBeInTheDocument();
    expect(screen.getByText(/同じ資料のイノシシ 3 件は含みません/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /緊急銃猟の事例一覧/ })).toHaveTextContent('60 件（イノシシを含む）');
  });

  it('draws each chart beside a table that holds its figures', async () => {
    await open();
    expect(screen.getByRole('img', { name: /全国の被害件数の年度別の棒グラフ/ })).toBeInTheDocument();
    const yearly = screen.getByRole('table', { name: /全国の被害件数（年度別）/ });
    expect(within(yearly).getAllByRole('row')).toHaveLength(20);
    const monthly = screen.getByRole('table', { name: /月別/ });
    // r07injury-qe.pdf 計 10月: 78 件.
    expect(
      within(within(monthly).getByRole('rowheader', { name: '10月' }).closest('tr')!).getByText('78'),
    ).toBeInTheDocument();
  });

  it('keeps each table closed under its chart until asked for', async () => {
    await open();
    const summaries = ['年度別の表', '月別の表', '都道府県別の表'].map((name) =>
      screen.getByText(name, { selector: 'summary' }),
    );
    for (const summary of summaries) expect(summary.closest('details')).not.toHaveAttribute('open');
  });

  it('goes back to the defaults on reset', async () => {
    await open();
    act(() => {
      useBearStatsStore.getState().setDataset('captures');
      useBearStatsStore.getState().setArea('iwate');
    });
    fireEvent.click(screen.getByRole('button', { name: /初期値に戻す|リセット/ }));
    const confirm = await screen.findAllByRole('button', { name: /初期値に戻す|リセット/ });
    fireEvent.click(confirm.at(-1)!);
    await waitFor(() => expect(useBearStatsStore.getState()).toMatchObject({ dataset: 'injuries', area: 'national' }));
  });

  it('switches every label to English', async () => {
    useLanguageStore.setState({ language: 'en' });
    await open();
    expect(screen.getByText('FY2025・Japan・Incidents')).toBeInTheDocument();
    const summary = spokenRegions()[1]!;
    await waitFor(() => expect(summary.textContent).toBe('FY2025, Japan: 216 cases (incidents, provisional).'), {
      timeout: 2000,
    });
  });

  it('owns up to unreadable saved settings and starts from the defaults', async () => {
    window.localStorage.setItem(storageKey, JSON.stringify({ state: { settings: { dataset: 'bears' } }, version: 0 }));
    await open();
    expect(screen.getAllByText(discardedSaveMessage('ja')).length).toBeGreaterThan(0);
    expect(useBearStatsStore.getState().dataset).toBe('injuries');
  });

  it('restores saved choices', async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        state: {
          settings: { dataset: 'captures', area: 'iwate', year: 2024, injuryMetric: 'cases', captureMetric: 'killed' },
        },
        version: 0,
      }),
    );
    await open();
    // capture-qe.pdf 岩手 R06: 捕殺 426.
    expect(screen.getByText('令和6年度・岩手県・捕殺').parentElement).toHaveTextContent('426頭');
  });
});
