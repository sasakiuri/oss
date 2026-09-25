import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useShotTimerStore } from '@/app/(standalone)/labs/shot-timer/_store';
import { ShotTimerClient } from '@/app/(standalone)/labs/shot-timer/shot-timer-client';
import { useStorageStatus } from '@/lib/browser-storage';

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

describe('shot timer', () => {
  beforeEach(() => {
    useShotTimerStore.setState(useShotTimerStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('keeps a complete set of settings and leaves a half-typed one out of storage', () => {
    useShotTimerStore.getState().edit({ par: 2.5, thresholdDb: -20 });
    useShotTimerStore.getState().edit({ minDelay: Number.NaN });
    const saved = JSON.parse(window.localStorage.getItem(storageKey)!);
    expect(saved.state.settings).toMatchObject({ par: 2.5, thresholdDb: -20, minDelay: 2 });
  });

  it('refuses a shortest delay longer than the longest', async () => {
    render(<ShotTimerClient />);
    fireEvent.change(await screen.findByLabelText(/^最短 \(秒\)/), { target: { value: '9' } });
    expect(screen.getByRole('button', { name: 'スタート' })).toBeDisabled();
    expect(screen.getByText('最短 ≤ 最長、0〜60 秒にしてください。')).toBeInTheDocument();
  });

  it('says so when the browser cannot play sound, instead of starting silently', async () => {
    vi.stubGlobal('AudioContext', undefined);
    render(<ShotTimerClient />);
    fireEvent.click(await screen.findByRole('button', { name: 'スタート' }));
    expect(await screen.findByText('このブラウザーでは音を鳴らせません。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'スタート' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
