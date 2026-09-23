import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SNARE_GAUGE_STORAGE_KEY, useSnareGaugeStore } from '@/app/(standalone)/labs/snare-gauge/_store';
import { SnareGaugeClient } from '@/app/(standalone)/labs/snare-gauge/snare-gauge-client';
import { discardedSaveMessage } from '@/components/labs';
import { useStorageStatus } from '@/lib/browser-storage';
import { useLanguageStore } from '@/store';

// Only the shared chrome is stubbed: it needs the Next.js app router, which a unit
// render has not mounted. The notice and its wording stay real.
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

const prefectureSelect = () => screen.findByLabelText('狩猟をする都道府県');
const leadFigure = () => screen.getByText(/^(輪の直径（|Loop diameter \()/).nextElementSibling;
const conditionalFigure = () => screen.getByText(/^(条件つきの緩和|Relaxed, under conditions)$/).nextElementSibling;

describe('the snare gauge', () => {
  beforeEach(() => {
    // A day inside every plan period in the data, so no expiry notice depends on the clock.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 23, 12));
    useLanguageStore.setState({ language: 'ja' });
    useSnareGaugeStore.setState(useSnareGaugeStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens on the national rule for boar', async () => {
    const { container } = render(<SnareGaugeClient />);
    // Rendered with the defaults and held busy until the saved choice is read.
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(screen.getByLabelText('狩猟をする都道府県'));
    expect(await prefectureSelect()).toHaveValue('national');
    expect(leadFigure()).toHaveTextContent('12 cm 以下');
    expect(screen.getByText('4 mm 以上')).toBeInTheDocument();
    expect(screen.getAllByText('装着が必要')).toHaveLength(2);
    expect(screen.getByRole('img', { name: '12 cm のゲージの印刷プレビュー' })).toBeInTheDocument();
  });

  it('leads with the statute and lists a prefecture’s relaxation as conditional, with its source and check date', async () => {
    render(<SnareGaugeClient />);
    fireEvent.change(await prefectureSelect(), { target: { value: 'chiba' } });
    expect(leadFigure()).toHaveTextContent('12 cm 以下');
    expect(conditionalFigure()).toHaveTextContent('15 cm 以下');
    expect(screen.getByText('状態：区域・条件に当たる場合')).toBeInTheDocument();
    expect(screen.getByText('足くくりわなに限る').parentElement).toHaveTextContent('条件：足くくりわなに限る');
    expect(
      screen.getByRole('link', { name: '千葉県「イノシシ及びニホンジカの狩猟規制緩和のお知らせ」' }),
    ).toHaveAttribute('href', 'http://www.pref.chiba.lg.jp/shizen/choujuu/syuryou/h29henkouten.html');
    expect(screen.getByText('出典（確認日 2026-09-23）')).toBeInTheDocument();
    // The gauge stays at the statute's size until the reader picks the relaxed one.
    expect(useSnareGaugeStore.getState().gaugeMm).toBe(120);
    expect(screen.getByRole('radio', { name: '12 cm' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: '20 cm' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: '15 cm' }));
    expect(useSnareGaugeStore.getState().gaugeMm).toBe(150);
    expect(screen.getByRole('img', { name: '15 cm のゲージの印刷プレビュー' })).toBeInTheDocument();
  });

  it('says no gauge is needed where the limit is lifted', async () => {
    render(<SnareGaugeClient />);
    fireEvent.change(await prefectureSelect(), { target: { value: 'ibaraki' } });
    expect(leadFigure()).toHaveTextContent('12 cm 以下');
    expect(conditionalFigure()).toHaveTextContent('上限なし');
    expect(screen.getByText(/上限なし（ゲージ不要）/)).toBeInTheDocument();
    expect(screen.getByText(/上限なしの緩和に当たる場合、ゲージは不要です/)).toBeInTheDocument();
  });

  it('keeps other mammals on the national rule in a prefecture that relaxes it', async () => {
    render(<SnareGaugeClient />);
    fireEvent.change(await prefectureSelect(), { target: { value: 'chiba' } });
    fireEvent.click(screen.getByRole('radio', { name: 'その他の獣類' }));
    expect(leadFigure()).toHaveTextContent('12 cm 以下');
    expect(screen.getByText(/県の緩和はイノシシ・ニホンジカが対象です/)).toBeInTheDocument();
    expect(screen.getAllByText('法令の定めなし')).toHaveLength(2);
    expect(useSnareGaugeStore.getState().gaugeMm).toBe(120);
  });

  it('drops a relaxation whose plan has ended, and says to ask the prefecture', async () => {
    vi.setSystemTime(new Date(2027, 3, 1, 12));
    render(<SnareGaugeClient />);
    fireEvent.change(await prefectureSelect(), { target: { value: 'ibaraki' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      '緩和の根拠の計画は 2027-03-31 までのため、法令の基準で表示しています。',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('茨城県に確認してください');
    expect(leadFigure()).toHaveTextContent('12 cm 以下');
    expect(screen.queryByText('条件つきの緩和')).toBeNull();
    expect(screen.getByText('状態：計画の期間が過ぎています')).toBeInTheDocument();
    expect(screen.queryByText(/上限なしの緩和に当たる場合/)).toBeNull();
  });

  it('drops a lapsed gauge size at midnight in Japan on a page left open', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    // 23:59 on 31 March 2027 in Japan: the last day of Okayama's plan.
    vi.setSystemTime(new Date('2027-03-31T14:59:00Z'));
    render(<SnareGaugeClient />);
    fireEvent.change(await prefectureSelect(), { target: { value: 'okayama' } });
    fireEvent.click(screen.getByRole('radio', { name: '15 cm' }));
    expect(screen.getByRole('img', { name: '15 cm のゲージの印刷プレビュー' })).toBeInTheDocument();
    act(() => {
      vi.setSystemTime(new Date('2027-03-31T15:00:10Z'));
      vi.advanceTimersByTime(30000);
    });
    expect(screen.getByRole('img', { name: '12 cm のゲージの印刷プレビュー' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '15 cm' })).toBeNull();
    await waitFor(() => expect(useSnareGaugeStore.getState().gaugeMm).toBe(120));
    expect(screen.getByRole('alert')).toHaveTextContent('2027-03-31 まで');
  });

  it('checks the date again when printing, and prints nothing with a gauge that lapsed at midnight', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    // 23:59:50 on 31 March 2027 in Japan: the last seconds of Okayama's plan.
    vi.setSystemTime(new Date('2027-03-31T14:59:50Z'));
    render(<SnareGaugeClient />);
    fireEvent.change(await prefectureSelect(), { target: { value: 'okayama' } });
    fireEvent.click(screen.getByRole('radio', { name: '15 cm' }));
    // 00:00:05 on 1 April in Japan, before the 30-second timer has run.
    vi.setSystemTime(new Date('2027-03-31T15:00:05Z'));
    fireEvent.click(screen.getByRole('button', { name: '印刷する' }));
    expect(printSpy).not.toHaveBeenCalled();
    expect(useSnareGaugeStore.getState().gaugeMm).toBe(120);
    expect(screen.getByText(/印刷せずに 12 cm に戻しました/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '12 cm のゲージの印刷プレビュー' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '印刷する' }));
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it('puts a lapsed gauge back to 12 cm before the browser’s own print command prints', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2027-03-31T14:59:50Z'));
    const { container } = render(<SnareGaugeClient />);
    fireEvent.change(await prefectureSelect(), { target: { value: 'okayama' } });
    fireEvent.click(screen.getByRole('radio', { name: '15 cm' }));
    const printedCircle = () => container.querySelector('svg[width="210mm"] circle');
    expect(printedCircle()).toHaveAttribute('r', '75');
    // 00:00:05 on 1 April in Japan: Ctrl/Cmd+P fires beforeprint, and the timer has not run.
    vi.setSystemTime(new Date('2027-03-31T15:00:05Z'));
    window.dispatchEvent(new Event('beforeprint'));
    // Checked straight after the event, as the browser lays out the print right then.
    expect(printedCircle()).toHaveAttribute('r', '60');
    expect(useSnareGaugeStore.getState().gaugeMm).toBe(120);
    await waitFor(() => expect(screen.getByText(/印刷する内容を 12 cm のゲージに切り替えました/)).toBeInTheDocument());
  });

  it('leaves a gauge that still applies alone when the browser prints', async () => {
    const { container } = render(<SnareGaugeClient />);
    fireEvent.change(await prefectureSelect(), { target: { value: 'okayama' } });
    fireEvent.click(screen.getByRole('radio', { name: '15 cm' }));
    window.dispatchEvent(new Event('beforeprint'));
    expect(container.querySelector('svg[width="210mm"] circle')).toHaveAttribute('r', '75');
    expect(useSnareGaugeStore.getState().gaugeMm).toBe(150);
  });

  it('reads the date on each render, not only when the timer runs', async () => {
    vi.setSystemTime(new Date('2027-03-31T14:59:50Z'));
    render(<SnareGaugeClient />);
    fireEvent.change(await prefectureSelect(), { target: { value: 'okayama' } });
    expect(screen.getByRole('radio', { name: '15 cm' })).toBeInTheDocument();
    vi.setSystemTime(new Date('2027-03-31T15:00:05Z'));
    // Any render after midnight, such as a change of species, shows the lapsed plan.
    fireEvent.click(screen.getByRole('radio', { name: 'ニホンジカ' }));
    expect(screen.queryByRole('radio', { name: '15 cm' })).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('2027-03-31 まで');
  });

  it('shows a dated relaxation as outside its period on a day outside it', async () => {
    render(<SnareGaugeClient />);
    fireEvent.change(await prefectureSelect(), { target: { value: 'nagano' } });
    fireEvent.click(screen.getByRole('radio', { name: 'ニホンジカ' }));
    expect(leadFigure()).toHaveTextContent('12 cm 以下');
    expect(screen.queryByText('条件つきの緩和')).toBeNull();
    expect(screen.getByText('状態：期間外')).toBeInTheDocument();
    expect(screen.getByText('12月15日から翌年3月15日まで（計画期間の各狩猟期）')).toBeInTheDocument();
  });

  it('does not apply Tochigi’s relaxation to deer, where its documents disagree', async () => {
    render(<SnareGaugeClient />);
    fireEvent.change(await prefectureSelect(), { target: { value: 'tochigi' } });
    fireEvent.click(screen.getByRole('radio', { name: 'ニホンジカ' }));
    expect(leadFigure()).toHaveTextContent('12 cm 以下');
    expect(screen.queryByText('条件つきの緩和')).toBeNull();
    expect(screen.getByText('状態：資料が食い違うため適用しません')).toBeInTheDocument();
  });

  it('offers a choice of gauge only when there is more than one size', async () => {
    render(<SnareGaugeClient />);
    await prefectureSelect();
    expect(screen.queryByRole('group', { name: 'ゲージの内径' })).toBeNull();
    expect(screen.queryByText(/20 cm の円は用紙の端近くまであり/)).toBeNull();
    fireEvent.change(await prefectureSelect(), { target: { value: 'yamanashi' } });
    expect(screen.getByRole('group', { name: 'ゲージの内径' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '20 cm' }));
    expect(screen.getByText(/20 cm の円は用紙の端近くまであり/)).toBeInTheDocument();
  });

  it('goes back to the defaults on reset', async () => {
    render(<SnareGaugeClient />);
    fireEvent.change(await prefectureSelect(), { target: { value: 'yamanashi' } });
    expect(screen.getByText('状態：期間は毎年決まります（判定しません）')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '20 cm' }));
    expect(useSnareGaugeStore.getState().gaugeMm).toBe(200);
    fireEvent.click(screen.getByRole('button', { name: '入力を初期値に戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '初期値に戻す' }));
    expect(useSnareGaugeStore.getState()).toMatchObject({ prefecture: 'national', species: 'boar', gaugeMm: 120 });
    expect(await prefectureSelect()).toHaveValue('national');
  });

  it('is read in the language of the interface, and keeps prefectural quotes in Japanese', async () => {
    render(<SnareGaugeClient />);
    fireEvent.change(await prefectureSelect(), { target: { value: 'chiba' } });
    act(() => useLanguageStore.getState().setLanguage('en'));
    expect(screen.getByLabelText('Prefecture where you hunt')).toHaveValue('chiba');
    expect(leadFigure()).toHaveTextContent('12 cm or less');
    expect(conditionalFigure()).toHaveTextContent('15 cm or less');
    // Only the prefecture's wording is marked as Japanese; the English label around it is not.
    const area = screen.getByText('県内（引用した記載に区域の限定なし）');
    expect(area).toHaveAttribute('lang', 'ja');
    expect(area.parentElement).toHaveTextContent('Area: 県内（引用した記載に区域の限定なし）');
    expect(area.parentElement?.closest('[lang]')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Prefectural details are quoted in Japanese.')).toBeVisible();
    expect(screen.getByText(/足くくりわなに限り、直径が15cm以下/).closest('[lang]')).toHaveAttribute('lang', 'ja');
    for (const region of spokenRegions()) expect(region).toHaveAttribute('lang', 'en');
  });

  it('restores a saved choice', async () => {
    window.localStorage.setItem(
      SNARE_GAUGE_STORAGE_KEY,
      JSON.stringify({ state: { settings: { prefecture: 'okayama', species: 'deer', gaugeMm: 150 } }, version: 0 }),
    );
    render(<SnareGaugeClient />);
    expect(await prefectureSelect()).toHaveValue('okayama');
    expect(screen.getByRole('radio', { name: 'ニホンジカ' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '15 cm' })).toBeChecked();
  });

  it('owns up to saved data it cannot read and opens on the defaults', async () => {
    window.localStorage.setItem(
      SNARE_GAUGE_STORAGE_KEY,
      JSON.stringify({ state: { settings: { prefecture: 'atlantis', species: 'boar', gaugeMm: 120 } }, version: 0 }),
    );
    render(<SnareGaugeClient />);
    expect(await prefectureSelect()).toHaveValue('national');
    expect(screen.getAllByText(discardedSaveMessage('ja')).length).toBeGreaterThan(0);
    await waitFor(() => expect(spokenRegions()[0]).toHaveTextContent(discardedSaveMessage('ja')));
  });

  it('brings a saved gauge size that does not apply back in line', async () => {
    window.localStorage.setItem(
      SNARE_GAUGE_STORAGE_KEY,
      JSON.stringify({ state: { settings: { prefecture: 'national', species: 'boar', gaugeMm: 200 } }, version: 0 }),
    );
    render(<SnareGaugeClient />);
    await prefectureSelect();
    expect(useSnareGaugeStore.getState().gaugeMm).toBe(120);
  });
});
