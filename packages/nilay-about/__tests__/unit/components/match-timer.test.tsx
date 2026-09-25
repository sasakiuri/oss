import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { storageKey, useMatchTimerStore } from '@/app/(standalone)/labs/match-timer/_store';
import { MatchTimerClient } from '@/app/(standalone)/labs/match-timer/match-timer-client';
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

const commandStatus = () => screen.getAllByRole('status').find((node) => node.className.includes('text-lg'))!;

describe('match command timer', () => {
  beforeEach(() => {
    useMatchTimerStore.setState(useMatchTimerStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens on 15 minutes of preparation and lists every command', async () => {
    render(<MatchTimerClient />);
    expect(await screen.findByText('15:00', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/^PREPARATION AND SIGHTING TIME … START（準備・試射時間…開始）/)).toBeInTheDocument();
    expect(screen.getAllByText(/（規則に文言なし）/)).toHaveLength(2);
  });

  it('runs even where the screen cannot be kept on, and says so', async () => {
    vi.stubGlobal('AudioContext', undefined);
    render(<MatchTimerClient />);
    fireEvent.click(await screen.findByRole('button', { name: 'スタート' }));
    expect(await screen.findByText(/画面のスリープを止められません/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '一時停止' })).toBeInTheDocument();
    expect(commandStatus()).toHaveTextContent('PREPARATION AND SIGHTING TIME … START');
    fireEvent.click(screen.getByRole('button', { name: '次の号令へ進む' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(commandStatus()).toHaveTextContent('30 SECONDS');
  });

  it('keeps the event and voice, and a final’s pause, across visits', () => {
    useMatchTimerStore.getState().edit({ program: 'air-final', voice: 'ja', finalGapSeconds: 15 });
    useMatchTimerStore.getState().edit({ finalGapSeconds: Number.NaN });
    expect(JSON.parse(window.localStorage.getItem(storageKey)!).state.settings).toMatchObject({
      program: 'air-final',
      voice: 'ja',
      finalGapSeconds: 15,
    });
  });
});
