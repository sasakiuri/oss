import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useElectricFenceStore } from '@/app/(standalone)/labs/electric-fence/_store';
import { powerStorageKey, usePowerStore } from '@/app/(standalone)/labs/electric-fence/_store/power';
import { ElectricFenceClient } from '@/app/(standalone)/labs/electric-fence/electric-fence-client';
import { discardedSaveMessage } from '@/components/labs';
import { useStorageStatus } from '@/lib/browser-storage';
import { LEGAL_REQUIREMENTS, ORDINANCE_ARTICLE_74 } from '@/lib/electric-fence';
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

const figure = (label: string) =>
  within(screen.getByRole('region', { name: /計算結果|Results/ }))
    .getByText(label)
    .closest('div')!;

async function open() {
  const { container } = render(<ElectricFenceClient />);
  await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());
}

describe('electric fence planner', () => {
  beforeEach(() => {
    useElectricFenceStore.setState(useElectricFenceStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  it('renders the tool with the defaults, held busy until the saved settings are read', async () => {
    const { container } = render(<ElectricFenceClient />);
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy).toHaveAttribute('inert');
    expect(within(busy as HTMLElement).getByLabelText('外周長', { exact: false })).toHaveValue(200);
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());
  });

  it('opens with the Tottori six rows and counts them', async () => {
    await open();
    expect(screen.getByLabelText('対象の獣種')).toHaveValue('deer-boar');
    expect(screen.getByRole('spinbutton', { name: /^6 段目/ })).toHaveValue(160);
    expect(figure('通電する柵線の総延長')).toHaveTextContent('1,200');
    expect(figure('支柱')).toHaveTextContent('72');
    expect(figure('ガイシ（またはクリップ）')).toHaveTextContent('456');
    expect(figure('出入口のグリップ')).toHaveTextContent('6');
    expect(screen.getByText('5 kV 以上に保つ')).toBeInTheDocument();
  });

  it('recounts as the perimeter and the gates change', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('外周長', { exact: false }), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('出入口の数'), { target: { value: '2' } });
    expect(figure('通電する柵線の総延長')).toHaveTextContent('720');
    expect(figure('支柱')).toHaveTextContent('47');
    expect(figure('出入口のグリップ')).toHaveTextContent('12');
  });

  it('fills in another source’s rows and marks them once they are changed', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('対象の獣種'), { target: { value: 'bear' } });
    expect(useElectricFenceStore.getState().rows.map((row) => row.heightCm)).toEqual([20, 40, 60]);
    expect(useElectricFenceStore.getState().outerWire.enabled).toBe(true);
    expect(screen.queryByText('出典の値から変更しています。')).toBeNull();
    fireEvent.change(screen.getByRole('spinbutton', { name: /^3 段目/ }), { target: { value: '70' } });
    expect(screen.getByText('出典の値から変更しています。')).toBeInTheDocument();
  });

  it('asks for the rows when the source gives none', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('対象の獣種'), { target: { value: 'monkey' } });
    expect(screen.getByText(/この出典は段の高さを数値で示していません/)).toBeInTheDocument();
    expect(figure('通電する柵線の総延長')).toHaveTextContent('—');
    expect(
      within(screen.getByRole('region', { name: '計算結果' })).getByText('「段の高さ」で段を追加してください。'),
    ).toBeInTheDocument();
  });

  it('keeps the uneven-ground and spare fields closed until one of them is wrong', async () => {
    await open();
    expect(screen.getByRole('button', { name: /起伏区間と予備/ })).toHaveAttribute('aria-expanded', 'false');
    act(() => useElectricFenceStore.getState().setLayout({ roughLengthM: 500 }));
    expect(screen.getByRole('button', { name: /起伏区間と予備/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('起伏区間の長さ', { exact: false })).toBeVisible();
  });

  it('keeps the legal requirements on screen with their sources', async () => {
    await open();
    expect(screen.getByRole('heading', { name: '電気さくの法令要件' })).toBeVisible();
    // Every item is shown as the library holds it, and the library's wording is pinned to the sources
    // in the lib test.
    expect(screen.getByText(ORDINANCE_ARTICLE_74)).toBeVisible();
    for (const requirement of LEGAL_REQUIREMENTS) {
      expect(screen.getByText(requirement.item)).toBeVisible();
      expect(screen.getByText(requirement.ja)).toBeVisible();
    }
    expect(
      screen.getByText(/経済産業省「電気設備の技術基準の解釈」（令和7年11月20日改正）。2026-09-23 確認/),
    ).toBeVisible();
  });

  it('puts every input and tick back on reset', async () => {
    await open();
    act(() => {
      useElectricFenceStore.getState().setLayout({ perimeterM: 50 });
      useElectricFenceStore.getState().toggleChecked('voltage');
      useElectricFenceStore.getState().setSpecies('boar');
    });
    fireEvent.click(screen.getByRole('button', { name: '入力を初期値に戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '初期値に戻す' }));
    const state = useElectricFenceStore.getState();
    expect(state.perimeterM).toBe(200);
    expect(state.checked).toEqual([]);
    expect(state.presetId).toBe('tottori-deer-boar');
  });

  it('speaks English when the language is switched, and announces the settled result', async () => {
    await open();
    act(() => useLanguageStore.setState({ language: 'en' }));
    expect(screen.getByText('Powered wire, total')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Legal requirements for electric fences' })).toBeVisible();
    const regions = screen.getAllByRole('status').filter((node) => node.className.includes('sr-only'));
    await waitFor(
      () => {
        const summary = regions[1];
        if (!summary) throw new Error('Expected the settled summary region.');
        expect(summary.textContent).toBe('1,200 m of powered wire, 72 posts, 456 insulators, 6 gate handles.');
      },
      { timeout: 2000 },
    );
  });

  it('says so when the saved settings cannot be read, and opens with the defaults', async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ state: { settings: { perimeterM: 'long' } }, version: 0 }),
    );
    await open();
    expect(screen.getAllByText(discardedSaveMessage('ja')).length).toBeGreaterThan(0);
    expect(useElectricFenceStore.getState().perimeterM).toBe(200);
  });

  it('restores saved settings', async () => {
    act(() => useElectricFenceStore.getState().setLayout({ perimeterM: 90 }));
    useElectricFenceStore.setState({ perimeterM: 200 });
    await open();
    expect(useElectricFenceStore.getState().perimeterM).toBe(90);
  });

  it('sizes the solar panel and totals the cost from the prices entered, in its own saved key', async () => {
    usePowerStore.setState(usePowerStore.getInitialState(), true);
    await open();
    fireEvent.click(screen.getByRole('button', { name: /電源装置・ソーラー・付帯資材・費用/ }));
    // The default fence: 1,200 m of powered wire.
    expect(screen.getByText(/通電する柵線は計 1,200 m/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/本器の消費電力/), { target: { value: '0.7888' } });
    fireEvent.change(screen.getByLabelText(/ピーク日照時間/), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/日照なしで動かす日数/), { target: { value: '5' } });
    // 0.7888 W × 24 h = 18.93 Wh; ÷ 3 h × 1.2 = 7.6 W; 1.58 Ah × 5 ÷ 0.5 = 15.8 Ah.
    expect(screen.getByText('7.6 W')).toBeInTheDocument();
    expect(screen.getByText('15.8 Ah')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('柵線（通電、1 m）の単価'), { target: { value: '10' } });
    expect(screen.getByText(/合計 12,000 円/)).toBeInTheDocument();
    const saved = JSON.parse(window.localStorage.getItem(powerStorageKey) ?? 'null');
    expect(saved.state.settings).toMatchObject({ energizerW: 0.7888, prices: { wire: 10 } });
  });

  it('requires an earth-leakage breaker only for a mains-fed fence', async () => {
    usePowerStore.setState(usePowerStore.getInitialState(), true);
    await open();
    fireEvent.click(screen.getByRole('button', { name: /電源装置・ソーラー・付帯資材・費用/ }));
    expect(screen.queryByText(/漏電遮断器（電流動作型/)).toBeNull();
    fireEvent.click(screen.getByLabelText(/30 V 以上の電源から給電/));
    expect(screen.getByText(/漏電遮断器（電流動作型/)).toBeInTheDocument();
  });
});
