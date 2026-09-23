import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  initialLoadDevelopmentSettings,
  storageKey,
  useLoadDevelopmentStore,
} from '@/app/(standalone)/labs/load-development/_store';
import { LoadDevelopmentClient } from '@/app/(standalone)/labs/load-development/load-development-client';
import { discardedSaveMessage } from '@/components/labs';
import { reportDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
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

const onPage = (text: string) =>
  screen.queryAllByText(text, { exact: false }).filter((node) => !node.className.includes('sr-only'));

/*
 * The opening series, worked by hand. Velocity means 790.33, 798.33, 803.33, 805.33, 806.67, 816:
 * changes 8, 5, 2, 1.33, 9.33, so within 5 m/s from 40.3 to 41.2 gr. Pooled SD √(105.33 / 12) = 2.96
 * on 12 degrees of freedom; t(0.975, 12) = 2.179, so every change carries ± 2.179 × 2.96 × √(2/3)
 * = ± 5.27 and none of them is shown to be within 5.
 */
const velocityRun = '40.3 gr 〜 41.2 gr では、隣り合う段の平均初速の差が 5 m/s 以内です。';
const unsupported = '95 % 区間がこの幅を超える段があり、この発数では小さいとは言えません。';

/** The tool renders at once; this waits until the saved series has been read and the form is live. */
const settle = () => waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());

describe('reading a load development series', () => {
  beforeEach(() => {
    useLoadDevelopmentStore.setState(useLoadDevelopmentStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  it('has both regions on the page before there is anything to say', () => {
    const { container } = render(<LoadDevelopmentClient />);
    // Rendered with the defaults, and held busy until the saved series is read.
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(
      screen.getByLabelText('段 1の初速', { exact: false }),
    );
    const regions = spokenRegions();
    expect(regions).toHaveLength(2);
    for (const region of regions) expect(region).toBeEmptyDOMElement();
  });

  it('finds the flat stretch on the averages and says the shots do not show it', async () => {
    render(<LoadDevelopmentClient />);
    await settle();
    // The stretch leads, with the verdict and the pooled deviation it rests on under it.
    const velocityFigure = screen.getByText('平均初速の差が 5 m/s 以内の段').parentElement!;
    expect(velocityFigure).toHaveTextContent('40.3 gr 〜 41.2 gr');
    expect(within(velocityFigure).getByText(unsupported)).toBeInTheDocument();
    expect(within(velocityFigure).getByText('段の中の SD 3 m/s（自由度 12）')).toBeInTheDocument();
    // The height of the centre moves 8, 3.67, −0.33, 0 and 12.33 mm.
    expect(screen.getByText('着弾の高さの中心の差が 5 mm 以内の段').parentElement).toHaveTextContent(
      '40.3 gr 〜 41.2 gr',
    );
  });

  it('lists every adjacent change with its interval and reading', async () => {
    render(<LoadDevelopmentClient />);
    await settle();
    const table = screen.getByRole('table', { name: '隣り合う段の初速の差' });
    const row = within(table).getByRole('row', { name: /^40\.6 gr → 40\.9 gr/ });
    expect(within(row).getByText('+2 m/s')).toBeInTheDocument();
    // 2 ± 5.27.
    expect(within(row).getByText('−3.3 m/s 〜 +7.3 m/s')).toBeInTheDocument();
    expect(within(row).getByText('この発数では判断できない')).toBeInTheDocument();
  });

  it('reads the stretch as supported once the threshold is wider than the noise', async () => {
    render(<LoadDevelopmentClient />);
    await settle();
    act(() => useLoadDevelopmentStore.getState().setVelocityThreshold(20));
    await waitFor(() => expect(onPage('95 % 区間もすべてその内側にあります。').length).toBeGreaterThan(0));
  });

  it('refuses to judge chance with one shot a step', async () => {
    render(<LoadDevelopmentClient />);
    await settle();
    act(() => {
      const { steps, updateStep } = useLoadDevelopmentStore.getState();
      for (const step of steps) updateStep(step.id, { velocities: step.velocities.split('\n')[0] ?? '' });
    });
    await waitFor(() => expect(onPage('各段 1 発のため、ばらつきとは比べられません。')).toHaveLength(1));
    expect(screen.getAllByText('区間なし（各段 1 発）').length).toBeGreaterThan(0);
  });

  it('adds and removes steps, and names what it could not read', async () => {
    const user = userEvent.setup();
    render(<LoadDevelopmentClient />);
    await settle();
    await user.click(screen.getByRole('button', { name: '段を追加' }));
    // The new step carries on the spacing of the last two.
    expect(useLoadDevelopmentStore.getState().steps.at(-1)).toMatchObject({ id: 's7', value: 41.8 });
    await user.type(screen.getByLabelText('段 7の初速', { exact: false }), '820 abc');
    expect(screen.getByText('読み取れない値: abc')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '段 7を削除' }));
    expect(useLoadDevelopmentStore.getState().steps).toHaveLength(6);
  });

  it('stops on two steps with the same value', async () => {
    render(<LoadDevelopmentClient />);
    await settle();
    act(() => useLoadDevelopmentStore.getState().updateStep('s2', { value: 40 }));
    expect(onPage('同じ段階値の段が 2 つ以上あります。段階値を直してください。').length).toBeGreaterThan(0);
    expect(screen.queryByRole('table', { name: '隣り合う段の初速の差' })).not.toBeInTheDocument();
  });

  it('compares whole group centres when both coordinates are recorded', async () => {
    const user = userEvent.setup();
    render(<LoadDevelopmentClient />);
    await settle();
    await user.click(within(screen.getByRole('group', { name: '着弾の記録' })).getByText('横と高さ'));
    expect(screen.getAllByText(/「右 上」として読み取れない行/).length).toBeGreaterThan(0);
    act(() => {
      const { steps, updateStep } = useLoadDevelopmentStore.getState();
      steps.forEach((step, index) => updateStep(step.id, { impacts: `0 ${index * 10}\n2 ${index * 10}` }));
    });
    const table = await screen.findByRole('table', { name: '隣り合う段の群の中心の移動' });
    expect(within(table).getAllByText('10 mm')).toHaveLength(5);
  });

  it('goes back to the defaults on reset', async () => {
    const user = userEvent.setup();
    render(<LoadDevelopmentClient />);
    await settle();
    act(() => useLoadDevelopmentStore.getState().removeStep('s6'));
    await user.click(screen.getByRole('button', { name: /リセット|初期値/ }));
    const confirm = screen.queryAllByRole('button', { name: /リセット|初期値に戻す/ }).at(-1);
    if (confirm) await user.click(confirm);
    await waitFor(() => expect(useLoadDevelopmentStore.getState().steps).toEqual(initialLoadDevelopmentSettings.steps));
  });

  it('switches to English, law text excepted', async () => {
    render(<LoadDevelopmentClient />);
    await settle();
    act(() => useLanguageStore.setState({ language: 'en' }));
    expect(
      screen.getByText('Steps where the change in average velocity is within 5 m/s').parentElement,
    ).toHaveTextContent('40.3 gr to 41.2 gr');
    expect(screen.getByText('The provisions are quoted in the original Japanese.')).toBeInTheDocument();
  });

  it('quotes the provisions on making cartridges with the date they were read', async () => {
    render(<LoadDevelopmentClient />);
    await settle();
    expect(
      screen.getByText(/射的練習の用に供するために当該練習者が製造する場合には、一日につき実包又は空包百個以下/),
    ).toBeInTheDocument();
    expect(screen.getByText(/2026-09-23 に e-Gov 法令検索で確認/)).toBeInTheDocument();
  });

  it('owns up to a saved series it could not read', async () => {
    reportDiscardedSave(storageKey);
    render(<LoadDevelopmentClient />);
    await waitFor(() => expect(spokenRegions()[0]).toHaveTextContent(discardedSaveMessage('ja')));
  });

  it('throws away a corrupt save and opens on the defaults', async () => {
    window.localStorage.setItem(storageKey, JSON.stringify({ state: { settings: { steps: 'x' } }, version: 0 }));
    render(<LoadDevelopmentClient />);
    await settle();
    expect(useLoadDevelopmentStore.getState().steps).toEqual(initialLoadDevelopmentSettings.steps);
    await waitFor(() => expect(spokenRegions()[0]).toHaveTextContent(discardedSaveMessage('ja')));
  });

  const twoSteps = (first: string, second: string) =>
    act(() => {
      const state = useLoadDevelopmentStore.getState();
      for (const step of state.steps.slice(2)) state.removeStep(step.id);
      state.updateStep('s1', { velocities: first });
      state.updateStep('s2', { velocities: second });
    });

  it('does not judge a change against readings that all happened to agree', async () => {
    render(<LoadDevelopmentClient />);
    await settle();
    twoSteps('800\n800', '803\n803');
    await waitFor(() => expect(onPage('段の中のばらつきが 0 のため、判定しません。').length).toBeGreaterThan(0));
    const table = screen.getByRole('table', { name: '隣り合う段の初速の差' });
    expect(within(table).getByText('判定しない（段の中のばらつきが 0）')).toBeInTheDocument();
    expect(within(table).queryByText('小さい（区間も内側）')).toBeNull();
  });

  it('writes an undecided interval so that it does not look inside the threshold', async () => {
    render(<LoadDevelopmentClient />);
    await settle();
    // Pooled SD √0.5 on 2 degrees of freedom: 2 ± 4.303 × 0.7071 = −1.042 to 5.042 against 5.
    twoSteps('800\n801', '802\n803');
    const table = await screen.findByRole('table', { name: '隣り合う段の初速の差' });
    await waitFor(() => expect(within(table).getByText('−1.1 m/s 〜 +5.1 m/s')).toBeInTheDocument());
    expect(within(table).getByText('この発数では判断できない')).toBeInTheDocument();
  });

  it('keeps the spoken summary in step with the language, and marks the law links in it', async () => {
    vi.useFakeTimers();
    try {
      render(<LoadDevelopmentClient />);
      await vi.waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
      act(() => vi.advanceTimersByTime(700));
      expect(spokenRegions()[1]).toHaveTextContent(`${velocityRun}${unsupported}`);
      act(() => useLanguageStore.setState({ language: 'en' }));
      // Switched at once, without waiting for the next settle.
      expect(spokenRegions()[1]).toHaveAttribute('lang', 'en');
      expect(spokenRegions()[1]).toHaveTextContent('From 40.3 gr to 41.2 gr');
      // Inside the folded law section, so found by its text; its own lang overrides the quoted Japanese.
      expect(screen.getByText('Explosives Control Act (e-Gov)').closest('a')).toHaveAttribute('lang', 'en');
    } finally {
      vi.useRealTimers();
    }
  });
});
