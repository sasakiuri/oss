import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// --- Mock: Store ---
let mockTimerState = {
  remainingTime: 0,
  phase: 'IDLE' as string,
  isRunning: false,
  setTimer: vi.fn(),
  setExpired: vi.fn(),
  reset: vi.fn(),
};

vi.mock('@/renderer/presentation/stores/system/timer.store', () => ({
  useTimerStore: () => mockTimerState,
}));

import { useTimer } from '@/renderer/presentation/hooks/useTimer';

describe('useTimer', () => {
  it('formats seconds as MM:SS', () => {
    mockTimerState = {
      ...mockTimerState,
      remainingTime: 125,
    };

    const { result } = renderHook(() => useTimer());

    expect(result.current.formatted).toBe('02:05');
  });

  it('formats zero seconds as 00:00', () => {
    mockTimerState = {
      ...mockTimerState,
      remainingTime: 0,
    };

    const { result } = renderHook(() => useTimer());

    expect(result.current.formatted).toBe('00:00');
  });

  it('formats 60 seconds as 01:00', () => {
    mockTimerState = {
      ...mockTimerState,
      remainingTime: 60,
    };

    const { result } = renderHook(() => useTimer());

    expect(result.current.formatted).toBe('01:00');
  });

  it('returns store values unchanged', () => {
    mockTimerState = {
      ...mockTimerState,
      remainingTime: 300,
      phase: 'MATCH',
      isRunning: true,
    };

    const { result } = renderHook(() => useTimer());

    expect(result.current.remainingTime).toBe(300);
    expect(result.current.phase).toBe('MATCH');
    expect(result.current.isRunning).toBe(true);
    expect(result.current.formatted).toBe('05:00');
  });
});
