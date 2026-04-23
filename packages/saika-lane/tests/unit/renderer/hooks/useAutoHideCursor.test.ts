// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAutoHideCursor } from '@/renderer/presentation/hooks/useAutoHideCursor';

describe('useAutoHideCursor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.documentElement.classList.remove('cursor-hidden');
  });

  it('hides the cursor after the idle timeout while active', () => {
    renderHook(() => useAutoHideCursor(true, 5000));

    expect(document.documentElement).not.toHaveClass('cursor-hidden');

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(document.documentElement).toHaveClass('cursor-hidden');
  });

  it('resets the idle timer when mouse activity occurs', () => {
    renderHook(() => useAutoHideCursor(true, 5000));

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove'));
    });

    expect(document.documentElement).not.toHaveClass('cursor-hidden');

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(document.documentElement).not.toHaveClass('cursor-hidden');

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(document.documentElement).toHaveClass('cursor-hidden');
  });

  it('shows the cursor again when activity occurs after hiding', () => {
    renderHook(() => useAutoHideCursor(true, 5000));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(document.documentElement).toHaveClass('cursor-hidden');

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove'));
    });

    expect(document.documentElement).not.toHaveClass('cursor-hidden');
  });

  it('does not hide the cursor while inactive', () => {
    renderHook(() => useAutoHideCursor(false, 5000));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(document.documentElement).not.toHaveClass('cursor-hidden');
  });

  it('removes the hidden cursor class when deactivated', () => {
    const { rerender } = renderHook(({ isActive }) => useAutoHideCursor(isActive, 5000), {
      initialProps: { isActive: true },
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(document.documentElement).toHaveClass('cursor-hidden');

    rerender({ isActive: false });

    expect(document.documentElement).not.toHaveClass('cursor-hidden');
  });
});
