import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useTwistStabilityStore } from '@/app/(standalone)/labs/twist-stability/_store';
import { TwistStabilityClient } from '@/app/(standalone)/labs/twist-stability/twist-stability-client';
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

/** The value line under the lead figure's label: the factor and its band. */
const stabilityFigure = () => screen.getByText('ジャイロ安定係数 Sg').nextElementSibling;

describe('announcing a stability factor', () => {
  beforeEach(() => {
    // persist writes on every set, so the reset comes first and the clear leaves storage truly empty.
    useTwistStabilityStore.setState(useTwistStabilityStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('has both regions on the page before there is anything to say', () => {
    const { container } = render(<TwistStabilityClient />);
    // Rendered with the defaults, and held busy until the saved settings are read.
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(
      screen.getByRole('spinbutton', { name: /弾頭の直径/ }),
    );
    const regions = spokenRegions();
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(region).toBeEmptyDOMElement();
      expect(region).toHaveAttribute('lang', 'ja');
    }
  });

  it('works the opening bullet through the rule and its two corrections', async () => {
    render(<TwistStabilityClient />);
    await screen.findByLabelText('弾頭の直径', { exact: false });
    // The 168 gr Sierra International of the paper's case 1, from a 12 inch twist at 2800 ft/s.
    expect(stabilityFigure()).toHaveTextContent('1.67');
    expect(screen.getByRole('row', { name: /基準条件の安定係数/ })).toHaveTextContent('1.69');
    // The reference atmosphere is thicker than the Army Standard Metro the rule was fitted at.
    expect(screen.getByRole('row', { name: /大気補正/ })).toHaveTextContent('×0.9868');
    expect(screen.getByText('（十分）')).toBeInTheDocument();
  });

  it('keeps the target field while it is cleared to type a new one', async () => {
    render(<TwistStabilityClient />);
    const target = await screen.findByLabelText(/^目標とする安定係数/);
    fireEvent.change(target, { target: { value: '' } });
    expect(screen.getByLabelText(/^目標とする安定係数/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^目標とする安定係数/), { target: { value: '2' } });
    expect(screen.getByText(/^Sg 2(\.0)? に必要なツイスト/)).toBeInTheDocument();
  });

  it('follows the bullet down into the unstable band', async () => {
    render(<TwistStabilityClient />);
    await screen.findByLabelText('弾頭の直径', { exact: false });
    // The same weight stretched out: the copper bullet case, and the point of the tool.
    act(() => useTwistStabilityStore.getState().setSettings({ length: 45 }));
    expect(screen.getByText('（不安定）')).toBeInTheDocument();
    expect(screen.getByText('安定係数が 1.0 未満です。弾は安定して飛びません。')).toBeInTheDocument();
    // A tighter barrel brings the same bullet back.
    act(() => useTwistStabilityStore.getState().setSettings({ twist: 7 }));
    expect(screen.getByText('（十分）')).toBeInTheDocument();
  });

  it('asks for the missing measurement instead of showing a figure', async () => {
    render(<TwistStabilityClient />);
    await screen.findByLabelText('弾頭の直径', { exact: false });
    act(() => useTwistStabilityStore.getState().setSettings({ mass: NaN }));
    expect(screen.getByText('0 より大きい数値を入力してください。')).toBeInTheDocument();
    expect(screen.getByText('エラーのある欄を直してください。')).toBeInTheDocument();
  });

  it('cautions about a slipped unit and keeps calculating', async () => {
    render(<TwistStabilityClient />);
    await screen.findByLabelText('弾頭の直径', { exact: false });
    // A 31.14 mm bullet entered while the form is reading inches.
    act(() => useTwistStabilityStore.getState().setSettings({ length: 790 }));
    expect(screen.getByText(/実在の弾と銃の範囲外の入力があります/)).toBeInTheDocument();
    expect(stabilityFigure()).not.toHaveTextContent('—');
  });

  it('says when an air rifle sits below the velocity correction', async () => {
    render(<TwistStabilityClient />);
    await screen.findByLabelText('弾頭の直径', { exact: false });
    act(() =>
      useTwistStabilityStore
        .getState()
        .setSettings({ diameter: 4.5, length: 6.5, mass: 0.55, twist: 450, muzzleSpeed: 280 }),
    );
    act(() => useTwistStabilityStore.getState().setTwistUnit('mm'));
    expect(screen.getByText(/初速が音速（1120 fps）未満のため/)).toBeInTheDocument();
  });

  it('settles before it speaks, and keeps the notice out of what it says', async () => {
    render(<TwistStabilityClient />);
    await screen.findByLabelText('弾頭の直径', { exact: false });
    const [notice, summary] = spokenRegions();
    if (!notice || !summary) throw new Error('Expected the two spoken regions.');
    act(() => reportDiscardedSave(storageKey));
    await waitFor(() => expect(notice).toHaveTextContent(discardedSaveMessage('ja')));
    await waitFor(() => expect(summary.textContent).toContain('安定係数 1.67（十分）'), { timeout: 2000 });
    // The summary carries the result alone: an atomic region holding both would read the notice
    // out again every time a figure changes.
    expect(summary.textContent).not.toContain('読み取れなかった');
  });

  it('says nothing about another tool losing its saved data', async () => {
    reportDiscardedSave('nilay-labs-trajectory-v1');
    render(<TwistStabilityClient />);
    await screen.findByLabelText('弾頭の直径', { exact: false });
    expect(screen.queryByText(/読み取れなかったため/)).toBeNull();
  });

  it('points at the trajectory tool for what it does not calculate', async () => {
    render(<TwistStabilityClient />);
    await screen.findByLabelText('弾頭の直径', { exact: false });
    // The notes start closed, with their key caution in the heading.
    fireEvent.click(screen.getByRole('button', { name: /^弾の種類と弾痕での確認/ }));
    expect(screen.getByRole('link', { name: '弾道計算とゼロイン' })).toHaveAttribute('href', '/labs/trajectory');
  });

  it('puts the result straight after the bullet and the barrel, ahead of the air that trims it', async () => {
    render(<TwistStabilityClient />);
    await screen.findByLabelText('弾頭の直径', { exact: false });
    const results = document.getElementById('results')!;
    const atmosphere = document.getElementById('atmosphere')!;
    expect(results.compareDocumentPosition(atmosphere) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leads with the recommended twist beside the factor, for the stability asked for', async () => {
    render(<TwistStabilityClient />);
    await screen.findByLabelText('弾頭の直径', { exact: false });
    expect(screen.getByText('Sg 1.5 に必要なツイスト')).toBeInTheDocument();
    expect(screen.getByText('1:12.67')).toBeInTheDocument();
    expect(screen.getByText('いまの銃は 1:12 inch')).toBeInTheDocument();
    // How long a bullet of the same weight this barrel still holds at the target factor.
    expect(screen.getByText('同じ重量で安定する最大の弾長').nextElementSibling).toHaveTextContent('32.3mm');
    act(() => useTwistStabilityStore.getState().setSettings({ targetStability: 2 }));
    expect(screen.getByText('Sg 2 に必要なツイスト')).toBeInTheDocument();
  });

  it('folds the air away with its values in the heading, and opens it when a value is wrong', async () => {
    render(<TwistStabilityClient />);
    await screen.findByLabelText('弾頭の直径', { exact: false });
    const heading = screen.getByRole('button', { name: /^大気/ });
    expect(heading).toHaveAttribute('aria-expanded', 'false');
    expect(heading).toHaveTextContent('15 °C・1,013.25 hPa・現地で測った気圧');
    expect(screen.queryByRole('spinbutton', { name: /気温/ })).toBeNull();
    act(() =>
      useTwistStabilityStore.getState().setSettings({
        atmosphere: { ...useTwistStabilityStore.getState().atmosphere, temperature: { value: 150, unit: 'c' } },
      }),
    );
    expect(heading).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('spinbutton', { name: /気温/ })).toBeInTheDocument();
  });

  it('converts the bullet when its unit changes inside the field', async () => {
    render(<TwistStabilityClient />);
    await screen.findByLabelText('弾頭の直径', { exact: false });
    fireEvent.change(screen.getByLabelText('弾頭の寸法の単位'), { target: { value: 'inch' } });
    expect(screen.getByRole('spinbutton', { name: /弾頭の直径/ })).toHaveValue(0.3079);
    expect(screen.getByRole('spinbutton', { name: /弾頭の長さ/ })).toHaveValue(1.226);
    expect(screen.getByRole('spinbutton', { name: /弾頭の長さ/ })).toHaveAccessibleName('弾頭の長さ (inch)');
  });

  it('reads a temperature in the unit it is typed in, and states the range in that unit', async () => {
    render(<TwistStabilityClient />);
    await screen.findByLabelText('弾頭の直径', { exact: false });
    const setTemperature = (value: number) =>
      act(() =>
        useTwistStabilityStore.getState().setSettings({
          atmosphere: { ...useTwistStabilityStore.getState().atmosphere, temperature: { value, unit: 'f' } },
        }),
      );
    // 70 °F is a warm day, not a reading past the limit.
    setTemperature(70);
    expect(screen.queryByText('-76 から 140 °F の範囲で入力してください。')).not.toBeInTheDocument();
    setTemperature(150);
    expect(screen.getByText('-76 から 140 °F の範囲で入力してください。')).toBeInTheDocument();
  });
});
