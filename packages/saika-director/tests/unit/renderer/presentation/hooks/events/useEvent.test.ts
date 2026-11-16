import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import React from 'react';
import { useEvent } from '@/renderer/presentation/hooks/useEvent';
import { EventBusProvider } from '@/renderer/events/EventBusProvider';
import { TestEventBus } from '../../../../../helpers/renderer/TestEventBus';
import type { EventName } from '@/renderer/events/EventBus';

// Suppress Logger output in tests
vi.mock('@/shared/logging', () => ({
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

    renderHook(() => useEvent('laneTimerTick', handler), { wrapper });

    expect(testBus.getSubscriptionCount('laneTimerTick')).toBe(1);
  });

  it('should unsubscribe on unmount', () => {
    const handler = vi.fn();

    const { unmount } = renderHook(() => useEvent('laneTimerTick', handler), { wrapper });

    expect(testBus.getSubscriptionCount('laneTimerTick')).toBe(1);

    unmount();

    expect(testBus.getSubscriptionCount('laneTimerTick')).toBe(0);
  });

  it('should NOT re-subscribe when only the handler reference changes', () => {
    const subscribeSpy = vi.spyOn(testBus, 'subscribe');

    const { rerender } = renderHook(({ handler }: { handler: () => void }) => useEvent('laneTimerTick', handler), {
      initialProps: { handler: vi.fn() },
      wrapper,
    });

    expect(subscribeSpy).toHaveBeenCalledTimes(1);

    // Provide a new handler reference
    rerender({ handler: vi.fn() });

    // Should NOT re-subscribe: the stable wrapper calls the latest handler
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('should use stable wrapper that delegates to the latest handler', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const { rerender } = renderHook(
      ({ handler }: { handler: (data: unknown) => void }) => useEvent('laneTimerTick', handler as never),
      { initialProps: { handler: handler1 }, wrapper },
    );

    // Simulate an event firing via TestEventBus
    const testData = { laneId: 'lane-1', remainingTime: 100, phase: 'ACTIVE' as const };
    testBus.emit('laneTimerTick', testData);
    expect(handler1).toHaveBeenCalledWith(testData);

    // Update the handler (no re-subscribe due to stable wrapper)
    rerender({ handler: handler2 });

    // The same subscription should now delegate to handler2
    testBus.emit('laneTimerTick', testData);
    expect(handler2).toHaveBeenCalledWith(testData);
  });

  it('should re-subscribe when event name changes', () => {
    const subscribeSpy = vi.spyOn(testBus, 'subscribe');
    const handler = vi.fn();

    const { rerender } = renderHook(({ event }: { event: EventName }) => useEvent(event, handler as never), {
      initialProps: { event: 'laneTimerTick' as EventName },
      wrapper,
    });

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(subscribeSpy).toHaveBeenCalledWith('laneTimerTick', expect.any(Function));

    rerender({ event: 'laneTimerExpired' as EventName });

    expect(subscribeSpy).toHaveBeenCalledTimes(2);
    expect(subscribeSpy).toHaveBeenLastCalledWith('laneTimerExpired', expect.any(Function));
    // Old event should be cleaned up
    expect(testBus.getSubscriptionCount('laneTimerTick')).toBe(0);
    expect(testBus.getSubscriptionCount('laneTimerExpired')).toBe(1);
  });

  it('should throw when used outside EventBusProvider', () => {
    expect(() => {
      renderHook(() => useEvent('laneTimerTick', vi.fn()));
    }).toThrow('useEventBus must be used within EventBusProvider');
  });
});
