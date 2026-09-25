import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useClickVerificationStore } from '@/app/(standalone)/labs/click-verification/_store';
import { ClickVerificationClient } from '@/app/(standalone)/labs/click-verification/click-verification-client';
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

// The two sr-only live regions: the discarded-save notice first, the settled summary last. Looked up by
// selector rather than by role, because a role query walks the whole accessibility tree on every poll.
const spokenRegions = () => [...document.querySelectorAll<HTMLElement>('p.sr-only[role="status"]')];

const leadFigure = () => screen.getByText('補正係数（期待 ÷ 実測）').nextElementSibling as HTMLElement;

// The settled summary is the second of the two sr-only regions above; index 1 must exist by then.
const settledRegion = () => {
  const region = spokenRegions()[1];
  if (!region) throw new Error('The settled summary region was not found.');
  return region;
};

// Renders the tool and waits until the saved state has been read and the form is no longer busy.
async function renderLoaded() {
  const view = render(<ClickVerificationClient />);
  await waitFor(() => expect(view.container.querySelector('[aria-busy="true"]')).toBeNull());
  return view;
}

describe('verifying the click value', () => {
  beforeEach(() => {
    useClickVerificationStore.setState(useClickVerificationStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  it('shows the factor for the defaults and follows a new measurement', async () => {
    await renderLoaded();
    const measuredField = await screen.findByLabelText('実測の移動量', { exact: false });
    // 30 MOA at 100 m is 872.687 mm; 872.687 ÷ 860 = 1.0148, 1.45% short.
    expect(leadFigure()).toHaveTextContent('1.0148');
    expect(screen.getByText('実測は公称より 1.45% 少なく動きました。')).toBeInTheDocument();
    expect(screen.getByText('872.7')).toBeInTheDocument();
    fireEvent.change(measuredField, { target: { value: '900' } });
    // 872.687 ÷ 900 = 0.9697, 3.13% over.
    expect(leadFigure()).toHaveTextContent('0.9697');
    expect(screen.getByText('+3.13')).toBeInTheDocument();
  });

  it('reads the new result out once typing settles', async () => {
    await renderLoaded();
    const measuredField = await screen.findByLabelText('実測の移動量', { exact: false });
    // The summary waits 700 ms after the last keystroke; a fake clock steps over the wait instead of
    // polling through it. It is installed only after loading, which resolves on real promises.
    vi.useFakeTimers();
    try {
      fireEvent.change(measuredField, { target: { value: '900' } });
      act(() => vi.advanceTimersByTime(699));
      expect(settledRegion().textContent).not.toContain('0.9697');
      act(() => vi.advanceTimersByTime(1));
      expect(settledRegion().textContent).toBe('補正係数 0.9697。実測は公称より 3.13% 多く動きました。');
    } finally {
      vi.useRealTimers();
    }
  });

  it('says how to use the factor beside it and warns about a dial that is not whole clicks', async () => {
    await renderLoaded();
    await screen.findByLabelText('実測の移動量', { exact: false });
    // 30 MOA × 1.0148 = 30.44 MOA; the true click is 0.25 × 860 ÷ 872.687 = 0.2464 MOA.
    expect(screen.getByText('必要なダイヤル量に掛けます。30 MOA → 30.44 MOA')).toBeInTheDocument();
    expect(screen.getByText('公称 0.25 MOA・追従率 0.9855')).toBeInTheDocument();
    expect(screen.queryByText(/整数倍ではありません/)).toBeNull();
    act(() => useClickVerificationStore.getState().setDial(30.1));
    expect(screen.getByText(/120.4 クリックになり、クリック値の整数倍ではありません/)).toBeInTheDocument();
  });

  it('keeps the click value in the unit of the dial', async () => {
    await renderLoaded();
    const clickSelect = await screen.findByLabelText('公称クリック値');
    expect(clickSelect).toHaveValue('1/4-moa');
    fireEvent.change(screen.getByLabelText('ダイヤル量の単位'), { target: { value: 'mil' } });
    expect(clickSelect).toHaveValue('0.1-mil');
    expect(screen.queryByRole('option', { name: '1/4 MOA' })).toBeNull();
    // 30 mil at 100 m is 100 000 × tan(0.03) = 3000.9 mm, far more than the 860 mm entered.
    expect(screen.getByText('3,000.9')).toBeInTheDocument();
  });

  it('turns a sideways offset into a tilt', async () => {
    await renderLoaded();
    await screen.findByLabelText('横ずれ（任意）', { exact: false });
    // No offset, no tilt line.
    expect(screen.queryByText(/° 傾いています/)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: '左' }));
    fireEvent.change(screen.getByLabelText('横ずれ（任意）', { exact: false }), { target: { value: '15' } });
    // atan(15 / 860) = 0.99924°.
    expect(screen.getByText(/縦線から左へ約 1° 傾いています。/)).toBeInTheDocument();
  });

  it('explains a missing value and gives no factor', async () => {
    await renderLoaded();
    const field = await screen.findByLabelText('射距離', { exact: false });
    fireEvent.change(field, { target: { value: '' } });
    expect(screen.getAllByText('0 より大きい数値を入力してください。')).toHaveLength(1);
    expect(leadFigure()).toHaveTextContent('—');
    expect(screen.getByRole('button', { name: /縦長標的の印刷/ })).toHaveTextContent(
      'ダイヤル量と距離を入力してください。',
    );
  });

  it('prints the target before there is a measurement', async () => {
    await renderLoaded();
    const measuredField = await screen.findByLabelText('実測の移動量', { exact: false });
    fireEvent.change(measuredField, { target: { value: '' } });
    expect(leadFigure()).toHaveTextContent('—');
    // The target comes from the distance and the dial alone: 872.687 × 1.1 + 30 = 990 mm, five sheets.
    expect(screen.getByText('期待移動量').nextElementSibling).toHaveTextContent('872.7mm');
    const section = screen.getByRole('button', { name: /縦長標的の印刷/ });
    expect(section).toHaveTextContent('高さ 99 cm・A4 5 枚');
    fireEvent.click(section);
    expect(screen.getAllByRole('img', { name: /印刷する標的のプレビュー/ })).toHaveLength(5);
    expect(screen.getByRole('button', { name: '5 枚を印刷する' })).toBeInTheDocument();
  });

  it('keeps the same lengths when a unit is switched', async () => {
    await renderLoaded();
    const measuredField = await screen.findByLabelText('実測の移動量', { exact: false });
    act(() => useClickVerificationStore.getState().setLateral({ value: 15, side: 'right' }));
    const measuredUnit = screen.getAllByLabelText('測定の単位（移動量・横ずれ共通）')[0];
    if (!measuredUnit) throw new Error('No matching label found for 測定の単位（移動量・横ずれ共通）.');
    fireEvent.change(measuredUnit, { target: { value: 'cm' } });
    // 860 mm is 86 cm and 15 mm is 1.5 cm; the factor stays 1.0148 rather than becoming 0.1015.
    expect(measuredField).toHaveValue(86);
    expect(useClickVerificationStore.getState().lateral.value).toBe(1.5);
    expect(leadFigure()).toHaveTextContent('1.0148');
    fireEvent.change(measuredUnit, { target: { value: 'inch' } });
    // 860 ÷ 25.4 = 33.8583 in.
    expect(measuredField).toHaveValue(33.8583);
    expect(leadFigure()).toHaveTextContent('1.0148');
    fireEvent.change(screen.getByLabelText('距離の単位'), { target: { value: 'yd' } });
    // 100 m ÷ 0.9144 = 109.3613 yd.
    expect(screen.getByLabelText('射距離', { exact: false })).toHaveValue(109.3613);
    expect(leadFigure()).toHaveTextContent('1.0148');
    expect(screen.getByText(/縦線から右へ約 1°/)).toBeInTheDocument();
  });

  it('sizes the printed target from the distance and the dial', async () => {
    await renderLoaded();
    const section = await screen.findByRole('button', { name: /縦長標的の印刷/ });
    // 872.687 × 1.1 + 30 = 990.0 mm, five sheets.
    expect(section).toHaveTextContent('高さ 99 cm・A4 5 枚');
    fireEvent.click(section);
    expect(screen.getAllByRole('img', { name: /印刷する標的のプレビュー/ })).toHaveLength(5);
    expect(screen.getByRole('button', { name: '5 枚を印刷する' })).toBeInTheDocument();
    act(() => useClickVerificationStore.getState().setDial(300));
    expect(section).toHaveTextContent('A4 12 枚を超えます');
    expect(screen.getByRole('alert')).toHaveTextContent('印刷用の標的は作りません');
  });

  it('goes back to the defaults on reset', async () => {
    await renderLoaded();
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'ダイヤル量 (MOA)' }), { target: { value: '40' } });
    expect(useClickVerificationStore.getState().dial).toBe(40);
    fireEvent.click(screen.getByRole('button', { name: '入力を初期値に戻す' }));
    fireEvent.click(screen.getByRole('button', { name: '初期値に戻す' }));
    expect(useClickVerificationStore.getState()).toMatchObject({ dial: 30, measured: 860, click: '1/4-moa' });
    expect(leadFigure()).toHaveTextContent('1.0148');
  });

  it('is read in the language of the interface', async () => {
    await renderLoaded();
    await screen.findByLabelText('実測の移動量', { exact: false });
    act(() => useLanguageStore.getState().setLanguage('en'));
    expect(screen.getByText('1.45% less travel than labelled.')).toBeInTheDocument();
    expect(screen.getByLabelText('Measured travel', { exact: false })).toHaveValue(860);
    for (const region of spokenRegions()) expect(region).toHaveAttribute('lang', 'en');
  });

  it('restores saved settings and owns up to unreadable ones', async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        state: {
          settings: {
            distance: { value: 100, unit: 'yd' },
            click: '0.1-mil',
            dial: 10,
            measureUnit: 'cm',
            measured: 90,
            lateral: { value: 0, side: 'right' },
          },
        },
        version: 0,
      }),
    );
    const { unmount } = await renderLoaded();
    expect(await screen.findByLabelText('公称クリック値')).toHaveValue('0.1-mil');
    expect(screen.getByLabelText('実測の移動量', { exact: false })).toHaveValue(90);
    unmount();

    useClickVerificationStore.setState(useClickVerificationStore.getInitialState(), true);
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ state: { settings: { click: '1/3-moa', dial: -1 } }, version: 0 }),
    );
    await renderLoaded();
    expect(await screen.findByLabelText('公称クリック値')).toHaveValue('1/4-moa');
    await waitFor(() => expect(spokenRegions()[0]).toHaveTextContent(discardedSaveMessage('ja')));
  });
});
