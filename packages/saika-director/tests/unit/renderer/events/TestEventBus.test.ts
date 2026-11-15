import { describe, it, expect, vi } from 'vitest';
import { TestEventBus } from '@/renderer/events/TestEventBus';

describe('TestEventBus', () => {
  it('should subscribe and emit events', () => {
    const bus = new TestEventBus();
    const handler = vi.fn();

    bus.subscribe('laneTimerTick', handler);
    bus.emit('laneTimerTick', { laneId: 'lane-1', remainingTime: 100, phase: 'ACTIVE' });

    expect(handler).toHaveBeenCalledWith({ laneId: 'lane-1', remainingTime: 100, phase: 'ACTIVE' });
  });

  it('should return unsubscribe function that removes the handler', () => {
    const bus = new TestEventBus();
    const handler = vi.fn();

    const unsubscribe = bus.subscribe('laneTimerTick', handler);
    unsubscribe();

    bus.emit('laneTimerTick', { laneId: 'lane-1', remainingTime: 50, phase: 'ACTIVE' });

    expect(handler).not.toHaveBeenCalled();
    expect(bus.getSubscriptionCount('laneTimerTick')).toBe(0);
  });

  it('should track subscription counts', () => {
    const bus = new TestEventBus();

    bus.subscribe('laneTimerTick', vi.fn());
    bus.subscribe('laneTimerTick', vi.fn());
    bus.subscribe('laneTimerExpired', vi.fn());

    expect(bus.getSubscriptionCount('laneTimerTick')).toBe(2);
    expect(bus.getSubscriptionCount('laneTimerExpired')).toBe(1);
    expect(bus.getSubscriptionCount()).toBe(3);
  });

  it('should unsubscribe all handlers', () => {
    const bus = new TestEventBus();

    bus.subscribe('laneTimerTick', vi.fn());
    bus.subscribe('laneTimerExpired', vi.fn());

    bus.unsubscribeAll();

    expect(bus.getSubscriptionCount()).toBe(0);
  });

  it('should emit to multiple handlers for the same event', () => {
    const bus = new TestEventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.subscribe('laneTimerTick', handler1);
    bus.subscribe('laneTimerTick', handler2);

    bus.emit('laneTimerTick', { laneId: 'lane-1', remainingTime: 30, phase: 'ACTIVE' });

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
  });

  it('should not emit to handlers of different events', () => {
    const bus = new TestEventBus();
    const tickHandler = vi.fn();
    const expiredHandler = vi.fn();

    bus.subscribe('laneTimerTick', tickHandler);
    bus.subscribe('laneTimerExpired', expiredHandler);

    bus.emit('laneTimerTick', { laneId: 'lane-1', remainingTime: 10, phase: 'ACTIVE' });

    expect(tickHandler).toHaveBeenCalledOnce();
    expect(expiredHandler).not.toHaveBeenCalled();
  });
});
