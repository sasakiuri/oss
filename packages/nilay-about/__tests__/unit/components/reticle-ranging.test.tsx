import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useReticleRangingStore } from '@/app/(standalone)/labs/reticle-ranging/_store';
import { ReticleRangingClient } from '@/app/(standalone)/labs/reticle-ranging/reticle-ranging-client';
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
  const view = render(<ReticleRangingClient />);
  await waitFor(() => expect(view.container.querySelector('[aria-busy="true"]')).toBeNull());
  return view;
}

describe('announcing a reticle ranging', () => {
  beforeEach(() => {
    // persist writes on every set, so the reset comes first and the clear leaves storage truly empty.
    useReticleRangingStore.setState(useReticleRangingStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('has both regions on the page before there is anything to say', () => {
    const { container } = render(<ReticleRangingClient />);
    // Rendered with the defaults, and held busy until the saved settings are read.
    expect(container.querySelector('[aria-busy="true"]')).toContainElement(
      screen.getByLabelText('対象の実寸', { exact: false }),
    );
    const regions = spokenRegions();
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(region).toBeEmptyDOMElement();
      expect(region).toHaveAttribute('lang', 'ja');
    }
  });

  it('ranges the target the form describes and follows a change of direction', async () => {
    await renderLoaded();
    await screen.findByLabelText('対象の実寸', { exact: false });
    // A 1 m target that covers 2 mil is 500 m away, which is 546.8 yd.
    expect(screen.getByText('500 m')).toBeInTheDocument();
    expect(screen.getByText('546.8 yd')).toBeInTheDocument();
    act(() => useReticleRangingStore.getState().setSolveFor('apparent'));
    // The same triangle read the other way round has to give back the reading it started from.
    expect(screen.getByText('2 mil')).toBeInTheDocument();
    expect(screen.getByText('6.88 MOA')).toBeInTheDocument();
    // The answer is headed by what it is, over the two values it came from.
    expect(screen.getByRole('heading', { name: 'レティクルの読み値' })).toBeInTheDocument();
    expect(screen.getByText('実寸 100 cm・距離 500 m')).toBeInTheDocument();
  });

  it('says at the field when a reading is too large to range from', async () => {
    await renderLoaded();
    const reading = await screen.findByLabelText('レティクルの読み値', { exact: false });
    // Half a turn is π rad, 3 141.6 mil: past it there is no triangle, and both values are still there.
    act(() => useReticleRangingStore.getState().setApparent({ value: 5000, unit: 'mil' }));
    expect(reading).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByText('読み値が大きすぎます。3,140 mil 未満で入力してください。')).toHaveLength(2);
    expect(screen.queryByText('必要な 2 つの値を入力してください。')).toBeNull();
    // On SFP the limit moves with the magnification, and the message says so.
    act(() => {
      useReticleRangingStore.getState().setApparent({ value: 2, unit: 'mil' });
      useReticleRangingStore.getState().setFocalPlane('sfp');
      useReticleRangingStore.getState().setMagnification({ calibration: 10, used: 0.001 });
    });
    expect(screen.getAllByText(/この倍率では 0.314 mil 未満/)).toHaveLength(2);
    act(() => useReticleRangingStore.getState().setMagnification({ calibration: 10, used: 10 }));
    expect(reading).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByText('500 m')).toBeInTheDocument();
  });

  it('keeps the notice out of the summary, so a new result does not repeat it', async () => {
    await renderLoaded();
    await screen.findByLabelText('対象の実寸', { exact: false });
    const [notice, summary] = spokenRegions();
    if (!notice || !summary) throw new Error('Expected the two spoken regions.');
    act(() => reportDiscardedSave(storageKey));
    await waitFor(() => expect(notice).toHaveTextContent(discardedSaveMessage('ja')));
    await waitFor(() => expect(summary.textContent).toContain('推定距離は 500 m'), { timeout: 2000 });
    // The summary carries the result alone: an atomic region holding both would read the notice
    // out again every time a figure changes.
    expect(summary.textContent).not.toContain('読み取れなかった');
  });

  it('says nothing about another tool losing its saved data', async () => {
    reportDiscardedSave('nilay-labs-sight-adjustment-v1');
    await renderLoaded();
    await screen.findByLabelText('対象の実寸', { exact: false });
    expect(screen.queryByText(/読み取れなかったため/)).toBeNull();
  });
});

describe('laying out a reticle ranging', () => {
  beforeEach(() => {
    useReticleRangingStore.setState(useReticleRangingStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('keeps the focal plane closed for FFP and states it, and opens it for SFP', async () => {
    const { unmount } = await renderLoaded();
    const toggle = await screen.findByRole('button', { name: /レティクル/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('FFP・倍率による補正なし');
    expect(screen.queryByRole('radio', { name: 'SFP（第二焦点面）' })).toBeNull();
    unmount();
    // A reader who ranges through a second focal plane changes the magnification at the scope, so
    // the section opens with the page once the saved focal plane is read.
    useReticleRangingStore.setState(useReticleRangingStore.getInitialState(), true);
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        state: {
          settings: {
            solveFor: 'distance',
            targetSize: { value: 100, unit: 'cm' },
            apparent: { value: 2, unit: 'mil' },
            distance: { value: 500, unit: 'm' },
            focalPlane: 'sfp',
            magnification: { calibration: 10, used: 10 },
          },
        },
        version: 0,
      }),
    );
    // The first render has the initial FFP; the saved SFP arrives after it.
    const { container } = render(<ReticleRangingClient />);
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());
    expect(useReticleRangingStore.getState().focalPlane).toBe('sfp');
    const sfpToggle = screen.getByRole('button', { name: /レティクル/ });
    expect(sfpToggle).toHaveAttribute('aria-expanded', 'true');
    expect(sfpToggle).toHaveTextContent('SFP・10 × で正しい目盛りを 10 × で使用');
    expect(screen.getByLabelText('実際に使った倍率', { exact: false })).toBeVisible();
  });

  it('opens the reticle when the magnification makes the reading too large at SFP', async () => {
    act(() => useReticleRangingStore.getState().setFocalPlane('sfp'));
    await renderLoaded();
    const toggle = await screen.findByRole('button', { name: /レティクル/ });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // The limit comes from the magnification, so the field that fixes it has to be in view.
    act(() => useReticleRangingStore.getState().setMagnification({ calibration: 10, used: 0.001 }));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('実際に使った倍率', { exact: false })).toBeVisible();
  });

  it('sets the unit of the answer beside it and keeps the typed values as they were', async () => {
    await renderLoaded();
    await screen.findByLabelText('対象の実寸', { exact: false });
    // Solving for the distance, there is no distance field: its unit is chosen with the answer.
    expect(screen.queryByLabelText('距離', { exact: false, selector: 'input[type=number]' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'yd' }));
    expect(screen.getByText('546.8 yd')).toBeInTheDocument();
    expect(screen.getByText('500 m')).toBeInTheDocument();
    expect(useReticleRangingStore.getState().distance).toEqual({ value: 500, unit: 'yd' });
    expect(useReticleRangingStore.getState().targetSize).toEqual({ value: 100, unit: 'cm' });
  });

  it('states what a misread costs while that section is closed', async () => {
    await renderLoaded();
    const toggle = await screen.findByRole('button', { name: /読み違えたときの距離/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('±0.1 mil の読み違いで 476.2 m – 526.3 m（最大 5.3 %）');
  });
});
