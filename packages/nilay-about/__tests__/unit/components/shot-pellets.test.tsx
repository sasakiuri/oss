import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useShotPelletsStore } from '@/app/(standalone)/labs/shot-pellets/_store';
import { ShotPelletsClient } from '@/app/(standalone)/labs/shot-pellets/shot-pellets-client';
import { discardedSaveMessage } from '@/components/labs';
import { reportDiscardedSave, useStorageStatus } from '@/lib/browser-storage';

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

// Two sr-only paragraphs: the discarded-save notice first and the settled summary last, kept apart
// because a status region is atomic and sharing one would repeat the notice on every change.
const spokenRegions = () =>
  screen.getAllByRole('status').filter((node) => node.tagName === 'P' && node.className.includes('sr-only'));

describe('announcing a pellet comparison', () => {
  beforeEach(() => {
    // persist writes on every set, so the reset comes first and the clear leaves storage truly empty.
    useShotPelletsStore.setState(useShotPelletsStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('has both regions on the page before there is anything to say', () => {
    const { container } = render(<ShotPelletsClient />);
    // Rendered with the defaults, and held busy until the saved settings are read.
    const busy = container.querySelector('[aria-busy="true"]');
    for (const field of screen.getAllByLabelText('粒の直径', { exact: false })) expect(busy).toContainElement(field);
    const regions = spokenRegions();
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(region).toBeEmptyDOMElement();
      expect(region).toHaveAttribute('lang', 'ja');
    }
  });

  it('weighs the pellet, counts the charge and states the difference between the two loads', async () => {
    render(<ShotPelletsClient />);
    // Both conditions carry this label, so the wait is for the pair rather than for one of them.
    await screen.findAllByLabelText('粒の直径', { exact: false });
    // 2.41 mm lead against the same size in steel: the steel pellet is lighter, so the charge
    // holds more of them and each one arrives with less energy.
    const results = screen.getByRole('region', { name: '計算結果' });
    expect(within(results).getByText('条件 A', { selector: 'p' }).parentElement).toHaveTextContent('338粒');
    expect(within(results).getByText('条件 B', { selector: 'p' }).parentElement).toHaveTextContent('485粒');
    expect(
      within(results).getByText(
        /^条件 A 比で、条件 B は粒数 \+43\.6%、1 粒の重量 -30\.4%、35 m での 1 粒のエネルギー -\d+(\.\d)?%。$/,
      ),
    ).toBeInTheDocument();
  });

  it('puts every distance of the table in a row with both loads against it', async () => {
    render(<ShotPelletsClient />);
    await screen.findAllByLabelText('粒の直径', { exact: false });
    // The table is an extra behind a closed section, whose heading states the range it covers.
    const toggle = screen.getByRole('button', { name: /距離ごとの 1 粒/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('5 m 刻みで 50 m まで');
    fireEvent.click(toggle);
    const table = screen.getByRole('table', { name: '距離ごとの残存速度と 1 粒のエネルギー' });
    // A 50 m range in 5 m steps: ten rows, and the last of them is the longest distance.
    expect(within(table).getAllByRole('row')).toHaveLength(11);
    const last = within(table).getByRole('row', { name: /^50 m/ });
    expect(within(last).getAllByRole('cell')[0]).not.toHaveTextContent('—');
  });

  it('refuses to calculate a load that is still being typed, and says which field it wants', async () => {
    render(<ShotPelletsClient />);
    await screen.findAllByLabelText('粒の直径', { exact: false });
    act(() => useShotPelletsStore.getState().setLoad('a', { diameter: NaN }));
    expect(screen.getByText('粒の直径・材質の密度・装弾量・初速を入力してください。')).toBeInTheDocument();
    expect(screen.getByText('両方の条件を入力すると比べられます。')).toBeInTheDocument();
  });

  it('warns about a load outside the range of a real one without refusing to calculate it', async () => {
    render(<ShotPelletsClient />);
    await screen.findAllByLabelText('粒の直径', { exact: false });
    act(() => useShotPelletsStore.getState().setLoad('a', { muzzleSpeed: 2000 }));
    expect(screen.getByText(/実在の装弾の範囲外の入力があります/)).toBeInTheDocument();
    // The figures are still there, because the arithmetic holds; only the input is unreal.
    const results = screen.getByRole('region', { name: '計算結果' });
    expect(within(results).getByText('条件 A', { selector: 'p' }).parentElement).toHaveTextContent('338粒');
  });

  it('names its sources and does not claim the Japanese numbering follows the same rule', async () => {
    render(<ShotPelletsClient />);
    await screen.findAllByLabelText('粒の直径', { exact: false });
    expect(screen.getByText(/SHOT SIZE/)).toBeInTheDocument();
    expect(screen.getByText(/mcgs\.txt/)).toBeInTheDocument();
    expect(screen.getByText(/号数がこの式に従うかは未確認です/)).toBeInTheDocument();
    expect(screen.getByText(/9\/16 インチ/)).toBeInTheDocument();
    expect(screen.getByText(/獲物への効果は判定しません/)).toBeInTheDocument();
  });

  it('keeps the notice out of the summary, so a new result does not repeat it', async () => {
    render(<ShotPelletsClient />);
    await screen.findAllByLabelText('粒の直径', { exact: false });
    const [notice, summary] = spokenRegions();
    act(() => reportDiscardedSave(storageKey));
    await waitFor(() => expect(notice).toHaveTextContent(discardedSaveMessage('ja')));
    await waitFor(() => expect(summary?.textContent).toContain('条件 A は 338 粒'), { timeout: 2000 });
    // The summary carries the result alone: an atomic region holding both would read the notice
    // out again every time a figure changes.
    expect(summary?.textContent).not.toContain('読み取れなかった');
  });

  it('says nothing about another tool losing its saved data', async () => {
    reportDiscardedSave('nilay-labs-shot-pattern-v1');
    render(<ShotPelletsClient />);
    await screen.findAllByLabelText('粒の直径', { exact: false });
    expect(screen.queryByText(/読み取れなかったため/)).toBeNull();
  });

  it('tells the reader when this browser cannot save the settings', async () => {
    useStorageStatus.setState({ available: false, discarded: [] });
    render(<ShotPelletsClient />);
    await screen.findAllByLabelText('粒の直径', { exact: false });
    // Said where it is seen, not only in the notes, which start closed.
    expect(
      screen.getAllByText(/このブラウザーでは設定を保存できません/).filter((node) => !node.closest('[hidden]')),
    ).toHaveLength(1);
  });

  it('names the shot number the diameter stands for, and drops it once the diameter is its own', async () => {
    render(<ShotPelletsClient />);
    await screen.findAllByLabelText('粒の直径', { exact: false });
    const [menuA] = screen.getAllByLabelText('号数');
    // 2.41 mm is the hundredth-of-a-millimetre reading of No. 7.5, 0.095 inch.
    expect(menuA).toHaveValue('7.5');
    act(() => useShotPelletsStore.getState().applyShotNumber('a', 4));
    expect(menuA).toHaveValue('4');
    act(() => useShotPelletsStore.getState().setLoad('a', { diameter: 3.1 }));
    expect(menuA).toHaveValue('');
  });

  it('says beside the step that the table stops short of the longest distance', async () => {
    render(<ShotPelletsClient />);
    await screen.findAllByLabelText('粒の直径', { exact: false });
    expect(screen.queryByText(/行までで/)).toBeNull();
    act(() => useShotPelletsStore.getState().setStep(1));
    act(() => useShotPelletsStore.getState().setMaxRange(200));
    expect(
      screen.getByText('表は 40 行までで、40 m で終わります。200 m まで表示するには刻みを大きくしてください。'),
    ).toBeInTheDocument();
  });

  it('marks a temperature the settings will not keep', async () => {
    render(<ShotPelletsClient />);
    await screen.findAllByLabelText('粒の直径', { exact: false });
    const atmosphere = useShotPelletsStore.getState().atmosphere;
    act(() => useShotPelletsStore.getState().setAtmosphere({ ...atmosphere, temperature: { value: 70, unit: 'c' } }));
    expect(screen.getByText('-60 から 60 °C の範囲で入力してください。')).toBeInTheDocument();
  });
  it('leads with the count and one pellet of each load at the distance the reader shoots', async () => {
    render(<ShotPelletsClient />);
    await screen.findAllByLabelText('粒の直径', { exact: false });
    const results = screen.getByRole('region', { name: '計算結果' });
    const lead = within(results).getByText('条件 A', { selector: 'p' }).parentElement!;
    expect(lead).toHaveTextContent(/35 m で 1 粒 1\.4 J \/ 1\.04 ft-lb（銃口の 21%）/);
    const before = lead.textContent;
    expect(within(results).getByRole('row', { name: /^35 m での速度/ })).toHaveTextContent('184 m/s / 604 fps');
    act(() => useShotPelletsStore.getState().setReferenceDistance(20));
    expect(lead).toHaveTextContent(/20 m で 1 粒/);
    expect(lead.textContent).not.toBe(before);
    // The distance unit reads the number anew rather than converting it, as the table settings do.
    act(() => useShotPelletsStore.getState().setDistanceUnit('yd'));
    expect(screen.getByRole('spinbutton', { name: /^エネルギーを見る距離/ })).toHaveValue(20);
    expect(within(results).getByText(/20 yd での 1 粒のエネルギー/)).toBeInTheDocument();
  });

  it('offers the load units inside their fields, and a change there rewrites both loads', async () => {
    render(<ShotPelletsClient />);
    await screen.findAllByLabelText('粒の直径', { exact: false });
    expect(screen.queryByRole('heading', { name: '単位' })).toBeNull();
    const pickers = screen.getAllByRole('combobox', { name: '初速の単位' });
    expect(pickers).toHaveLength(2);
    fireEvent.change(pickers[1]!, { target: { value: 'fps' } });
    for (const picker of pickers) expect(picker).toHaveValue('fps');
    for (const field of screen.getAllByRole('spinbutton', { name: /^初速/ })) expect(field).toHaveValue(1312);
  });

  it('keeps the air closed until it needs the reader, and says what it assumes', async () => {
    render(<ShotPelletsClient />);
    await screen.findAllByLabelText('粒の直径', { exact: false });
    const toggle = screen.getByRole('button', { name: /大気/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('15 °C・1,013.25 hPa・現地の気圧');
    const atmosphere = useShotPelletsStore.getState().atmosphere;
    act(() => useShotPelletsStore.getState().setAtmosphere({ ...atmosphere, temperature: { value: 70, unit: 'c' } }));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('-60 から 60 °C の範囲で入力してください。')).toBeVisible();
  });
});
