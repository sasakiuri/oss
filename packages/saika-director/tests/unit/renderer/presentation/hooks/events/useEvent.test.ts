import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import React from 'react';
import { useEvent } from '@/renderer/presentation/hooks/useEvent';
import { EventBusProvider } from '@/renderer/events/EventBusProvider';
import { TestEventBus } from '@/renderer/events/TestEventBus';
import type { EventName } from '@/renderer/events/EventBus';

// Suppress Logger output in tests
vi.mock('@/shared/utils/Logger', () => ({
  Logger: {
    create: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe('useEvent', () => {
  let testBus: TestEventBus;

  function wrapper({ children }: { children: ReactNode }) {
    return React.createElement(EventBusProvider, { bus: testBus, children });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    testBus = new TestEventBus();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should subscribe to event on mount', () => {
    const handler = vi.fn();

    renderHook(() => useEvent('timerTick', handler), { wrapper });

    expect(testBus.getSubscriptionCount('timerTick')).toBe(1);
  });

  it('should unsubscribe on unmount', () => {
    const handler = vi.fn();

    const { unmount } = renderHook(() => useEvent('timerTick', handler), { wrapper });

    expect(testBus.getSubscriptionCount('timerTick')).toBe(1);

    unmount();

    expect(testBus.getSubscriptionCount('timerTick')).toBe(0);
  });

  it('should re-subscribe when dependencies change', () => {
    const handler = vi.fn();
    const subscribeSpy = vi.spyOn(testBus, 'subscribe');

    const { rerender } = renderHook(({ dep }: { dep: number }) => useEvent('timerTick', handler, [dep]), {
      initialProps: { dep: 1 },
      wrapper,
    });

    expect(subscribeSpy).toHaveBeenCalledTimes(1);

    // Change the dependency
    rerender({ dep: 2 });

    // Old subscription should be cleaned up, new one created
    expect(subscribeSpy).toHaveBeenCalledTimes(2);
    // Only one active subscription (old cleaned up)
    expect(testBus.getSubscriptionCount('timerTick')).toBe(1);
  });

  it('should NOT re-subscribe when handler reference changes but deps are stable', () => {
    const subscribeSpy = vi.spyOn(testBus, 'subscribe');

    const { rerender } = renderHook(({ handler }: { handler: () => void }) => useEvent('timerTick', handler), {
      initialProps: { handler: vi.fn() },
      wrapper,
    });

    expect(subscribeSpy).toHaveBeenCalledTimes(1);

    // Provide a new handler reference but no deps change
    rerender({ handler: vi.fn() });

    // Should NOT re-subscribe because deps default to []
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('should use stable wrapper that delegates to the latest handler', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const { rerender } = renderHook(
      ({ handler }: { handler: (data: unknown) => void }) => useEvent('timerTick', handler as never),
      { initialProps: { handler: handler1 }, wrapper },
    );

    // Simulate an event firing via TestEventBus
    const testData = { remainingTime: 100, phase: 'ACTIVE' as const };
    testBus.emit('timerTick', testData);
    expect(handler1).toHaveBeenCalledWith(testData);

    // Update the handler (no re-subscribe due to stable wrapper)
    rerender({ handler: handler2 });

    // The same subscription should now delegate to handler2
    testBus.emit('timerTick', testData);
    expect(handler2).toHaveBeenCalledWith(testData);
  });

  it('should re-subscribe when event name changes', () => {
    const subscribeSpy = vi.spyOn(testBus, 'subscribe');
    const handler = vi.fn();

    const { rerender } = renderHook(({ event }: { event: EventName }) => useEvent(event, handler as never), {
      initialProps: { event: 'timerTick' as EventName },
      wrapper,
    });

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(subscribeSpy).toHaveBeenCalledWith('timerTick', expect.any(Function));

    rerender({ event: 'timerExpired' as EventName });

    expect(subscribeSpy).toHaveBeenCalledTimes(2);
    expect(subscribeSpy).toHaveBeenLastCalledWith('timerExpired', expect.any(Function));
    // Old event should be cleaned up
    expect(testBus.getSubscriptionCount('timerTick')).toBe(0);
    expect(testBus.getSubscriptionCount('timerExpired')).toBe(1);
  });

  it('should throw when used outside EventBusProvider', () => {
    expect(() => {
      renderHook(() => useEvent('timerTick', vi.fn()));
    }).toThrow('useEventBus must be used within EventBusProvider');
  });
});
