import { act, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useRecoilStore } from '@/app/(standalone)/labs/recoil/_store';
import { RecoilClient } from '@/app/(standalone)/labs/recoil/recoil-client';
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

describe('announcing a recoil comparison', () => {
  beforeEach(() => {
    // persist writes on every set, so the reset comes first and the clear leaves storage truly empty.
    useRecoilStore.setState(useRecoilStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('has both regions on the page before there is anything to say', () => {
    const { container } = render(<RecoilClient />);
    // Rendered with the defaults, and held busy until the saved settings are read.
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(
      screen.getAllByLabelText('銃の重量', { exact: false })[0]!,
    );
    const regions = spokenRegions();
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(region).toBeEmptyDOMElement();
      expect(region).toHaveAttribute('lang', 'ja');
    }
  });

  it('puts both conditions in one row and states the difference between them', async () => {
    render(<RecoilClient />);
    // Both conditions carry this label, so the wait is for the pair rather than for one of them.
    await screen.findAllByLabelText('銃の重量', { exact: false });
    // The SAAMI worked example against a .308 Win load, the two defaults the tool opens on.
    expect(screen.getByText('条件 A の反動エネルギー').parentElement).toHaveTextContent('40.9 J30.16 ft-lb');
    expect(screen.getByText('条件 B の反動エネルギー').parentElement).toHaveTextContent('21.42 J15.8 ft-lb');
    const summary = spokenRegions()[1]!;
    await waitFor(() =>
      expect(summary).toHaveTextContent('条件 B の自由反動エネルギーは、条件 A より 47.6% 小さくなります。'),
    );
    act(() => useRecoilStore.getState().copyLoad('a'));
    // The same load on both sides has to leave nothing to tell apart.
    await waitFor(() => expect(summary).toHaveTextContent('条件 A と条件 B の自由反動エネルギーは、ほぼ同じです。'));
  });

  it('keeps the notice out of the summary, so a new result does not repeat it', async () => {
    render(<RecoilClient />);
    // Both conditions carry this label, so the wait is for the pair rather than for one of them.
    await screen.findAllByLabelText('銃の重量', { exact: false });
    const [notice, summary] = spokenRegions();
    if (!notice || !summary) throw new Error('Expected the two spoken regions.');
    act(() => reportDiscardedSave(storageKey));
    await waitFor(() => expect(notice).toHaveTextContent(discardedSaveMessage('ja')));
    await waitFor(() => expect(summary.textContent).toContain('条件 A は 40.9 J'), { timeout: 2000 });
    // The summary carries the result alone: an atomic region holding both would read the notice
    // out again every time a figure changes.
    expect(summary.textContent).not.toContain('読み取れなかった');
  });

  it('says nothing about another tool losing its saved data', async () => {
    reportDiscardedSave('nilay-labs-sight-adjustment-v1');
    render(<RecoilClient />);
    // Both conditions carry this label, so the wait is for the pair rather than for one of them.
    await screen.findAllByLabelText('銃の重量', { exact: false });
    expect(screen.queryByText(/読み取れなかったため/)).toBeNull();
  });

  it('gives the energy of each condition, then how much B differs from A', async () => {
    render(<RecoilClient />);
    await screen.findAllByLabelText('銃の重量', { exact: false });
    const results = screen.getByRole('region', { name: '自由反動' });
    const energyA = within(results).getByText('条件 A の反動エネルギー').parentElement!;
    expect(energyA).toHaveTextContent('40.9 J');
    expect(energyA).toHaveTextContent('30.16 ft-lb、反動速度 5.08 m/s（16.7 fps）');
    const comparison = within(results).getByText('B の反動エネルギー（A 比）').parentElement!;
    expect(within(comparison).getByText('-47.6%')).toBeInTheDocument();
    expect(within(comparison).getByText('反動速度 -30.1%')).toBeInTheDocument();
    // A condition that cannot be worked out leaves nothing to compare, and its card says what it waits for.
    act(() => useRecoilStore.getState().setLoad('a', { gunMass: NaN }));
    expect(within(results).queryByText('-47.6%')).toBeNull();
    expect(within(energyA).getByText('—')).toBeInTheDocument();
    const cardA = document.getElementById('condition-a')!.closest('.rounded-md') as HTMLElement;
    expect(within(cardA).getByText('銃の重量、発射物の重量、初速を入力してください。')).toBeInTheDocument();
  });

  it('offers each unit inside its field, and a change there rewrites both conditions', async () => {
    render(<RecoilClient />);
    await screen.findAllByLabelText('銃の重量', { exact: false });
    // No separate card of unit settings: every weight and velocity field carries its own picker.
    expect(screen.queryByRole('heading', { name: '単位' })).toBeNull();
    const pickers = screen.getAllByRole('combobox', { name: '銃の重量の単位' });
    expect(pickers).toHaveLength(2);
    act(() => useRecoilStore.getState().setGunMassUnit('lb'));
    for (const picker of pickers) expect(picker).toHaveValue('lb');
    const [gunA, gunB] = screen.getAllByRole('spinbutton', { name: /^銃の重量/ });
    expect(gunA).toHaveValue(7);
    expect(gunB).toHaveValue(7.5);
  });
});
