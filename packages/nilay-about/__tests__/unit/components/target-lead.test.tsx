import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useTargetLeadStore } from '@/app/(standalone)/labs/target-lead/_store';
import { TargetLeadClient } from '@/app/(standalone)/labs/target-lead/target-lead-client';
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

describe('announcing a target lead', () => {
  beforeEach(() => {
    // persist writes on every set, so the reset comes first and the clear leaves storage truly empty.
    useTargetLeadStore.setState(useTargetLeadStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('has both regions on the page before there is anything to say', () => {
    const { container } = render(<TargetLeadClient />);
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

  it('shows the flight, the lead and the swing for the shot in the form', async () => {
    render(<TargetLeadClient />);
    await screen.findByLabelText('射距離', { exact: false });
    act(() => {
      // The average-speed model, where the figures below follow from the closed form.
      useTargetLeadStore.getState().setSpeedModel('average');
      useTargetLeadStore.getState().setProjectileSpeed({ value: 350, unit: 'm/s' });
    });
    // 30 m, a projectile averaging 350 m/s and a target crossing square at 60 km/h: the meeting is
    // 0.086 s out, by which time the target has covered 1.43 m, all of it across the line of sight.
    // The unit sits in a span of its own, so the figure is the whole text of its node.
    expect(screen.getByText('0.086')).toBeInTheDocument();
    expect(screen.getByText('86 ms')).toBeInTheDocument();
    // At a square crossing the part across the line of sight is the whole lead, so it is shown once.
    expect(screen.getAllByText('1.43 m')).toHaveLength(1);
    expect(screen.queryByText('視線を横切る分')).toBeNull();
    expect(screen.getByText('2.73°')).toBeInTheDocument();
    expect(screen.getByText('163.8 MOA / 47.64 mil')).toBeInTheDocument();
    expect(screen.getByText('30.03 m')).toBeInTheDocument();
    // Half and half again of the entered range, which is the row the form is asking about.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('入力した距離')).toBeInTheDocument();
    act(() => useTargetLeadStore.getState().setCrossingAngle(0));
    // Head-on the target still covers ground, but none of it crosses the line of sight, so the
    // muzzle stays where it is and the closing target is met inside the range it was measured at.
    expect(screen.getByText('1.36 m')).toBeInTheDocument();
    expect(screen.getByText('0 m')).toBeInTheDocument();
    expect(screen.getByText('0°')).toBeInTheDocument();
    expect(screen.getByText('0.082')).toBeInTheDocument();
    expect(screen.getByText('28.64 m')).toBeInTheDocument();
  });

  it('says so when the shot can never catch the target', async () => {
    render(<TargetLeadClient />);
    await screen.findByLabelText('射距離', { exact: false });
    act(() => useTargetLeadStore.getState().setTargetSpeed({ value: 2000, unit: 'km/h' }));
    expect(screen.getByText(/この弾速では的に追いつきません。/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('points at the fields rather than at two of them when the shot is incomplete', async () => {
    render(<TargetLeadClient />);
    await screen.findByLabelText('射距離', { exact: false });
    // The crossing angle is the field at fault here, not the distance or the projectile speed.
    act(() => useTargetLeadStore.getState().setCrossingAngle(200));
    expect(screen.getByText('0 から 180 の範囲で入力してください。')).toBeInTheDocument();
    expect(screen.getByText('エラーのある欄を直してください。')).toBeInTheDocument();
    expect(screen.getByText('エラーのある欄を直すと表示します。')).toBeInTheDocument();
    // A shot that is never caught has every field right, and its table says why it is missing.
    act(() => {
      useTargetLeadStore.getState().setCrossingAngle(90);
      useTargetLeadStore.getState().setTargetSpeed({ value: 2000, unit: 'km/h' });
    });
    expect(screen.getByText('弾が的に追いつかないため、表はありません。')).toBeInTheDocument();
  });

  it('does not call a hit at the entered range nearer or further', async () => {
    render(<TargetLeadClient />);
    await screen.findByLabelText('射距離', { exact: false });
    act(() => useTargetLeadStore.getState().setTargetSpeed({ value: 0, unit: 'km/h' }));
    expect(screen.getByText('射距離とほぼ同じ')).toBeInTheDocument();
  });

  it('keeps the notice out of the summary, so a new result does not repeat it', async () => {
    render(<TargetLeadClient />);
    await screen.findByLabelText('射距離', { exact: false });
    act(() => {
      // The average-speed model, where the figures below follow from the closed form.
      useTargetLeadStore.getState().setSpeedModel('average');
      useTargetLeadStore.getState().setProjectileSpeed({ value: 350, unit: 'm/s' });
    });
    const [notice, summary] = spokenRegions();
    if (!notice || !summary) throw new Error('Expected the two spoken regions.');
    act(() => reportDiscardedSave(storageKey));
    await waitFor(() => expect(notice).toHaveTextContent(discardedSaveMessage('ja')));
    await waitFor(() => expect(summary.textContent).toContain('リードは 1.43 m'), { timeout: 2000 });
    // The summary carries the result alone: an atomic region holding both would read the notice
    // out again every time a figure changes.
    expect(summary.textContent).not.toContain('読み取れなかった');
  });

  it('says nothing about another tool losing its saved data', async () => {
    reportDiscardedSave('nilay-labs-sight-adjustment-v1');
    render(<TargetLeadClient />);
    await screen.findByLabelText('射距離', { exact: false });
    expect(screen.queryByText(/読み取れなかったため/)).toBeNull();
  });
});

describe('laying out a target lead', () => {
  beforeEach(() => {
    useTargetLeadStore.setState(useTargetLeadStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('keeps the projectile speed and delay closed with their values stated, and opens them when wrong', async () => {
    render(<TargetLeadClient />);
    const toggle = await screen.findByRole('button', { name: /^弾速と発砲の遅れ/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('抗力で計算・2.41 mm・初速 400 m/s・遅れなし');
    act(() => useTargetLeadStore.getState().setDelay(0.02));
    expect(toggle).toHaveTextContent('初速 400 m/s・遅れ 0.02 秒');
    act(() => useTargetLeadStore.getState().setDelay(-1));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('0 以上の数値を入力してください。')).toBeVisible();
  });

  it('opens the section when the projectile speed is wrong', async () => {
    render(<TargetLeadClient />);
    const toggle = await screen.findByRole('button', { name: /^弾速と発砲の遅れ/ });
    act(() => useTargetLeadStore.getState().setProjectileSpeed({ value: 0, unit: 'm/s' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('0 より大きい数値を入力してください。')).toBeVisible();
  });
});

describe('the drag model and a climbing target', () => {
  beforeEach(() => {
    useTargetLeadStore.setState(useTargetLeadStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('holds above for the drop, splits a climbing lead and draws both views', async () => {
    render(<TargetLeadClient />);
    await screen.findByLabelText('的の上昇角', { exact: false });
    const vertical = () => screen.getByText('上下方向', { exact: true }).parentElement as HTMLElement;
    expect(vertical()).toHaveTextContent(/上/);
    expect(vertical()).toHaveTextContent(/落下 .* cm を含む/);
    expect(screen.getByText('到達時の速度')).toBeInTheDocument();
    act(() => useTargetLeadStore.getState().setClimb(-40));
    expect(vertical()).toHaveTextContent(/ m 下/);
    expect(screen.getByRole('img', { name: /射手から見た図/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /真上から見た図/ })).toBeInTheDocument();
    act(() => useTargetLeadStore.getState().setClimb(90));
    expect(screen.getByText('-85 から 85 の範囲で入力してください。')).toBeInTheDocument();
  });
});
