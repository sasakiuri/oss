// SPDX-License-Identifier: MIT
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { Audience } from '../../src/renderer/Audience';
import type { AudienceState } from '../../src/shared/model';
import { publishedSnapshot, screenConfig, snapshot } from '../fixtures';

let value: AudienceState;
let changed: () => void;
let monotonic: number;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10000);
  monotonic = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => monotonic);
  changed = () => {};
  value = {
    config: { ...screenConfig(), view: 'final' },
    entries: [{ snapshot: publishedSnapshot(), state: 'live', receivedAt: Date.now(), error: null }],
    identifyUntil: 0,
    saved: false,
  };
  window.vista = {
    getState: vi.fn(),
    command: vi.fn(),
    discover: vi.fn(),
    getAudience: vi.fn(async () => value),
    rendered: vi.fn(async () => {}),
    onChange: (callback) => {
      changed = callback;
      return () => {};
    },
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function receive() {
  const entry = value.entries[0]!;
  const now = Date.now();
  value = {
    ...value,
    entries: [{ ...entry, receivedAt: now, snapshot: { ...entry.snapshot, capturedAt: now } }],
  };
  changed();
}

it('keeps publication confirmed when a new snapshot arrives between clock ticks', async () => {
  await act(async () => {
    render(<Audience />);
  });
  expect(screen.getByText('Competition ranking · Official')).toBeInTheDocument();
  await act(async () => {
    monotonic += 100;
    await vi.advanceTimersByTimeAsync(100);
  });
  await act(async () => receive());
  expect(screen.getByText('Competition ranking · Official')).toBeInTheDocument();
  expect(screen.queryByText(/publication unconfirmed/)).not.toBeInTheDocument();
});

it('keeps a running clock confirmed when a new snapshot arrives between clock ticks', async () => {
  const current = snapshot();
  current.clock = {
    generation: 'clock-one',
    revision: 1,
    state: 'running',
    remainingMs: 60000,
    sampledAt: Date.now(),
    label: 'Match time',
  };
  value = { ...value, entries: [{ ...value.entries[0]!, snapshot: current }] };
  const { container } = await act(async () => render(<Audience />));
  expect(container.querySelector('.audience-clock')).toHaveClass('confirmed');
  await act(async () => {
    monotonic += 100;
    await vi.advanceTimersByTimeAsync(100);
  });
  await act(async () => receive());
  expect(container.querySelector('.audience-clock')).toHaveClass('confirmed');
  expect(screen.queryByText('Clock unconfirmed')).not.toBeInTheDocument();
});

it.each([-2000, 2000])('requires fresh confirmation after a %d ms wall-clock jump', async (jump) => {
  await act(async () => {
    render(<Audience />);
  });
  await act(async () => {
    vi.setSystemTime(Date.now() + jump);
    monotonic += 250;
    await vi.advanceTimersByTimeAsync(250);
  });
  expect(screen.queryByText('Competition ranking · Official')).not.toBeInTheDocument();
  expect(screen.getByText(/publication unconfirmed/)).toBeInTheDocument();
  await act(async () => changed());
  expect(screen.queryByText('Competition ranking · Official')).not.toBeInTheDocument();
  await act(async () => {
    monotonic += 1;
    await vi.advanceTimersByTimeAsync(1);
  });
  await act(async () => receive());
  expect(screen.getByText('Competition ranking · Official')).toBeInTheDocument();
});
