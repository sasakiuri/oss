import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useShotDangerStore } from '@/app/(standalone)/labs/shot-danger/_store';
import { ShotDangerClient } from '@/app/(standalone)/labs/shot-danger/shot-danger-client';
import { discardedSaveMessage } from '@/components/labs';
import { useStorageStatus } from '@/lib/browser-storage';
import { useLanguageStore } from '@/store';

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

const loaded = () => waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
const distanceX = () => screen.getByText('Distance X（出典の表）').parentElement!;

describe('the shooting danger area', () => {
  beforeEach(() => {
    useShotDangerStore.setState(useShotDangerStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  it('takes Distance X from the pamphlet’s table for the chosen ammunition', async () => {
    render(<ShotDangerClient />);
    await loaded();
    expect(distanceX()).toHaveTextContent('1,073');
    fireEvent.change(screen.getByLabelText('弾（出典の表の行）'), { target: { value: '22-lr' } });
    expect(distanceX()).toHaveTextContent('1,400');
    expect(screen.getByText('射座を決めると地図に範囲を描きます。')).toBeInTheDocument();
  });

  it('offers neither a calculated range nor the reduced 2° dispersion', async () => {
    render(<ShotDangerClient />);
    await loaded();
    expect(screen.queryByRole('button', { name: '「最大到達距離の計算」の入力を使う' })).toBeNull();
    expect(screen.queryByRole('radio', { name: '2°' })).toBeNull();
    const options = Array.from(screen.getByLabelText<HTMLSelectElement>('弾（出典の表の行）').options, (o) => o.value);
    expect(options).toEqual(['12-gauge-slug', '22-lr']);
  });

  it('says it has let go of settings saved in the earlier shape', async () => {
    const earlier = {
      projectile: {},
      firing: { latitude: 35.5, longitude: 138.5 },
      bearing: 90,
      dispersion: 2,
    };
    window.localStorage.setItem(storageKey, JSON.stringify({ state: { settings: earlier }, version: 0 }));
    render(<ShotDangerClient />);
    await loaded();
    expect(useShotDangerStore.getState().firing).toBeNull();
    expect(screen.getAllByText(discardedSaveMessage('ja')).length).toBeGreaterThan(0);
  });
});
