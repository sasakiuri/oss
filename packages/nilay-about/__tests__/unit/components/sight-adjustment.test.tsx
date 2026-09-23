import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useSightAdjustmentStore } from '@/app/(standalone)/labs/sight-adjustment/_store';
import { SightAdjustmentClient } from '@/app/(standalone)/labs/sight-adjustment/sight-adjustment-client';
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

// Renders the tool and waits until the saved state has been read and the form is no longer busy.
async function renderLoaded() {
  const view = render(<SightAdjustmentClient />);
  await waitFor(() => expect(view.container.querySelector('[aria-busy="true"]')).toBeNull());
  return view;
}

describe('announcing a sight adjustment', () => {
  beforeEach(() => {
    // persist writes on every set, so the reset comes first and the clear leaves storage truly empty.
    useSightAdjustmentStore.setState(useSightAdjustmentStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('has both regions on the page before there is anything to say', () => {
    const { container } = render(<SightAdjustmentClient />);
    // Rendered with the defaults, and held busy until the saved settings are read.
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(
      screen.getByLabelText('射距離', { exact: false }),
    );
    const regions = spokenRegions();
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(region).toBeEmptyDOMElement();
      expect(region).toHaveAttribute('lang', 'ja');
    }
  });

  it('names no direction when there is nothing to turn', async () => {
    await renderLoaded();
    await screen.findByLabelText('射距離', { exact: false });
    // 2 mm at 100 m is 0.28 of a 1/4 MOA click, which rounds to none.
    act(() => {
      useSightAdjustmentStore.getState().setVertical({ direction: 'low', value: 0 });
      useSightAdjustmentStore.getState().setHorizontal({ direction: 'right', value: 0.2 });
    });
    expect(screen.getAllByText('調整なし')).toHaveLength(2);
    expect(screen.queryByText(/^(UP|LEFT)$/)).toBeNull();
    expect(screen.getByText('計算値 0.28 クリック。丸めで約 2 mm 右に残ります。')).toBeInTheDocument();
    const summary = spokenRegions()[1];
    if (!summary) throw new Error('Expected the settled summary region.');
    await waitFor(() => expect(summary.textContent).toBe('上下は調整なし、左右は調整なし。'), { timeout: 2000 });
  });

  it('keeps the notice out of the summary, so a new result does not repeat it', async () => {
    await renderLoaded();
    await screen.findByLabelText('射距離', { exact: false });
    const [notice, summary] = spokenRegions();
    if (!notice || !summary) throw new Error('Expected the two spoken regions.');
    act(() => reportDiscardedSave(storageKey));
    await waitFor(() => expect(notice).toHaveTextContent(discardedSaveMessage('ja')));
    await waitFor(() => expect(summary.textContent).toContain('UP 7 クリック'), { timeout: 2000 });
    // The summary carries the result alone: an atomic region holding both would read the notice
    // out again every time a figure changes.
    expect(summary.textContent).not.toContain('読み取れなかった');
  });

  it('says nothing about another tool losing its saved data', async () => {
    reportDiscardedSave('nilay-labs-hunting-hours-v1');
    await renderLoaded();
    await screen.findByLabelText('射距離', { exact: false });
    expect(screen.queryByText(/読み取れなかったため/)).toBeNull();
  });
});

describe('laying out a sight adjustment', () => {
  beforeEach(() => {
    useSightAdjustmentStore.setState(useSightAdjustmentStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('takes the direction of each error from a pair of choices beside it', async () => {
    await renderLoaded();
    await screen.findByLabelText('射距離', { exact: false });
    expect(screen.getByRole('radio', { name: '下' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: '上' }));
    expect(useSightAdjustmentStore.getState().vertical).toEqual({ direction: 'high', value: 5 });
    expect(screen.getByText('DOWN')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '左' }));
    expect(screen.getByText('RIGHT')).toBeInTheDocument();
  });

  it('offers the one error unit in both error fields', async () => {
    await renderLoaded();
    await screen.findByLabelText('射距離', { exact: false });
    const pickers = screen.getAllByLabelText('ズレの単位（上下・左右共通）');
    expect(pickers).toHaveLength(2);
    fireEvent.change(pickers[1]!, { target: { value: 'inch' } });
    expect(useSightAdjustmentStore.getState().offsetUnit).toBe('inch');
    for (const picker of pickers) expect(picker).toHaveValue('inch');
  });

  it('states the helper answers while their sections are closed, and opens one that is wrong', async () => {
    await renderLoaded();
    const incline = await screen.findByRole('button', { name: /傾斜射撃の水平距離/ });
    expect(incline).toHaveAttribute('aria-expanded', 'false');
    expect(incline).toHaveTextContent('斜距離 100 m・30° → 水平距離 86.6 m');
    expect(screen.getByRole('button', { name: /この距離での実寸/ })).toHaveTextContent(
      '100 m で 1 MOA = 29.09 mm・1 mil = 100 mm・1 クリック = 7.27 mm',
    );
    act(() => useSightAdjustmentStore.getState().setSlant({ value: 100, angleDegrees: 120 }));
    expect(incline).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('-90 から 90 の範囲で入力してください。')).toBeVisible();
  });
});
