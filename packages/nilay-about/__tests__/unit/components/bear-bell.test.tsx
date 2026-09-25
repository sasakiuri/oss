import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BEAR_BELL_STORAGE_KEY, useBearBellStore } from '@/app/(standalone)/labs/bear-bell/_store';
import { BearBellClient } from '@/app/(standalone)/labs/bear-bell/bear-bell-client';
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

// A stand-in for Web Audio that records each oscillator started, which is each partial of a ring.
const started: number[] = [];
class FakeAudioContext {
  state = 'suspended';
  currentTime = 0;
  destination = {};
  onstatechange: (() => void) | null = null;
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
  createDynamicsCompressor() {
    return { connect: () => undefined };
  }
  createGain() {
    const param = {
      value: 0,
      setValueAtTime: () => undefined,
      linearRampToValueAtTime: () => undefined,
      setTargetAtTime: () => undefined,
    };
    return { gain: param, connect: () => undefined };
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { value: 0 },
      connect: () => undefined,
      start: (at: number) => started.push(at),
      stop: () => undefined,
    };
  }
}

const saved = () => JSON.parse(window.localStorage.getItem(BEAR_BELL_STORAGE_KEY) ?? 'null');

const renderReady = async () => {
  const { container } = render(<BearBellClient />);
  await waitFor(() => expect(container.querySelector('[aria-busy]')).toHaveAttribute('aria-busy', 'false'));
};

describe('the bear bell', () => {
  beforeEach(() => {
    started.length = 0;
    vi.stubGlobal('AudioContext', FakeAudioContext);
    useBearBellStore.setState(useBearBellStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
    useLanguageStore.setState({ language: 'ja' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('rings at once and then at the interval until stopped', async () => {
    await renderReady();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '鳴らす' }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Shown on screen and in the status region read out.
    expect(screen.getAllByText(/鳴らしています（約 3 秒ごと）/)).toHaveLength(2);
    const firstRing = started.length;
    expect(firstRing).toBeGreaterThan(0);
    act(() => vi.advanceTimersByTime(3000));
    expect(started.length).toBe(firstRing * 2);
    fireEvent.click(screen.getByRole('button', { name: '止める' }));
    act(() => vi.advanceTimersByTime(9000));
    expect(started.length).toBe(firstRing * 2);
    expect(screen.getAllByText('止まっています。')).toHaveLength(2);
  });

  it('says so when the browser has no Web Audio', async () => {
    vi.stubGlobal('AudioContext', undefined);
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: '1 回だけ鳴らす' }));
    expect(await screen.findByText(/Web Audio 非対応/)).toBeInTheDocument();
  });

  it('always states that a locked screen can stop the sound', async () => {
    await renderReady();
    expect(screen.getByText(/iPhone・iPad の Safari では止まります/)).toBeInTheDocument();
  });

  it('keeps the pre-trip ticks until they are cleared for the next trip', async () => {
    await renderReady();
    fireEvent.click(screen.getByLabelText('早朝・夕方を避ける予定にした'));
    expect(saved().state.settings.checked).toEqual(['hours']);
    expect(screen.getByText('1 / 8 項目を確認済み')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'チェックを外す（次の入山用）' }));
    expect(saved().state.settings.checked).toEqual([]);
  });

  it('keeps the last valid interval while the field is being typed', async () => {
    await renderReady();
    fireEvent.change(screen.getByLabelText(/鳴らす間隔/), { target: { value: '0' } });
    expect(screen.getByText('1 から 60 秒で入力してください。')).toBeInTheDocument();
    expect(saved().state.settings.intervalSeconds).toBe(3);
    fireEvent.change(screen.getByLabelText(/鳴らす間隔/), { target: { value: '8' } });
    expect(saved().state.settings.intervalSeconds).toBe(8);
  });
});
