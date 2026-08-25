import { describe, it, expect, vi } from 'vitest';
import { TestEventBus } from '@/renderer/events/TestEventBus';

describe('TestEventBus', () => {
  it('should subscribe and emit events', () => {
    const bus = new TestEventBus();
    const handler = vi.fn();

    bus.subscribe('timerTick', handler);
    bus.emit('timerTick', { remainingTime: 100, phase: 'ACTIVE' });

    expect(handler).toHaveBeenCalledWith({ remainingTime: 100, phase: 'ACTIVE' });
  });

  it('should return unsubscribe function that removes the handler', () => {
    const bus = new TestEventBus();
    const handler = vi.fn();

    const unsubscribe = bus.subscribe('timerTick', handler);
    unsubscribe();

    bus.emit('timerTick', { remainingTime: 50, phase: 'ACTIVE' });

    expect(handler).not.toHaveBeenCalled();
    expect(bus.getSubscriptionCount('timerTick')).toBe(0);
  });

  it('should track subscription counts', () => {
    const bus = new TestEventBus();

    bus.subscribe('timerTick', vi.fn());
    bus.subscribe('timerTick', vi.fn());
    bus.subscribe('timerExpired', vi.fn());

    expect(bus.getSubscriptionCount('timerTick')).toBe(2);
    expect(bus.getSubscriptionCount('timerExpired')).toBe(1);
    expect(bus.getSubscriptionCount()).toBe(3);
  });

  it('should unsubscribe all handlers', () => {
    const bus = new TestEventBus();

    bus.subscribe('timerTick', vi.fn());
    bus.subscribe('timerExpired', vi.fn());

    bus.unsubscribeAll();

    expect(bus.getSubscriptionCount()).toBe(0);
  });

  it('should emit to multiple handlers for the same event', () => {
    const bus = new TestEventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.subscribe('timerTick', handler1);
    bus.subscribe('timerTick', handler2);

    bus.emit('timerTick', { remainingTime: 30, phase: 'ACTIVE' });

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
  });

  it('should not emit to handlers of different events', () => {
    const bus = new TestEventBus();
    const tickHandler = vi.fn();
    const expiredHandler = vi.fn();

    bus.subscribe('timerTick', tickHandler);
    bus.subscribe('timerExpired', expiredHandler);

    bus.emit('timerTick', { remainingTime: 10, phase: 'ACTIVE' });

    expect(tickHandler).toHaveBeenCalledOnce();
    expect(expiredHandler).not.toHaveBeenCalled();
  });
});
