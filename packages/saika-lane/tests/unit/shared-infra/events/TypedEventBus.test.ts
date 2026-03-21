// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- Logger mock ----------

const mockLoggerError = vi.fn();

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: mockLoggerError,
  }),
}));

import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';

// ---------- Event types for tests ----------

interface TestEvent {
  readonly type: 'TestEvent';
  readonly timestamp: number;
  readonly aggregateId: string;
  readonly payload: string;
}

interface AnotherTestEvent {
  readonly type: 'AnotherTestEvent';
  readonly timestamp: number;
  readonly aggregateId: string;
  readonly value: number;
}

// Augment EventRegistry for tests via declare module
declare module '@/main/shared-infra/events/EventBus' {
  interface EventRegistry {
    TestEvent: TestEvent;
    AnotherTestEvent: AnotherTestEvent;
  }
}

// ---------- Helpers ----------

function createTestEvent(payload = 'test-payload'): TestEvent {
  return {
    type: 'TestEvent',
    timestamp: Date.now(),
    aggregateId: 'test-aggregate-1',
    payload,
  };
}

function createAnotherTestEvent(value = 42): AnotherTestEvent {
  return {
    type: 'AnotherTestEvent',
    timestamp: Date.now(),
    aggregateId: 'another-aggregate-1',
    value,
  };
}

// ---------- Tests ----------

describe('TypedEventBus', () => {
  let bus: TypedEventBus;

  beforeEach(() => {
    bus = new TypedEventBus();
    mockLoggerError.mockClear();
  });

  // ============================
  // emit()
  // ============================
  describe('emit()', () => {
    it('calls the registered handler with the correct event', () => {
      const handler = vi.fn();
      bus.on('TestEvent', handler);

      const event = createTestEvent();
      bus.emit(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('calls all handlers registered for the same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      bus.on('TestEvent', handler1);
      bus.on('TestEvent', handler2);
      bus.on('TestEvent', handler3);

      const event = createTestEvent();
      bus.emit(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
      expect(handler3).toHaveBeenCalledWith(event);
    });

    it('does not call handlers registered for a different event type', () => {
      const testHandler = vi.fn();
      const anotherHandler = vi.fn();

      bus.on('TestEvent', testHandler);
      bus.on('AnotherTestEvent', anotherHandler);

      const event = createTestEvent();
      bus.emit(event);

      expect(testHandler).toHaveBeenCalledWith(event);
      expect(anotherHandler).not.toHaveBeenCalled();
    });

    it('does not throw when no handlers are registered', () => {
      const event = createTestEvent();

      expect(() => {
        bus.emit(event);
      }).not.toThrow();
    });

    it('executes synchronously (handlers are already called when emit returns)', () => {
      let handlerCalled = false;
      bus.on('TestEvent', () => {
        handlerCalled = true;
      });

      bus.emit(createTestEvent());

      // Handler should already be executed by the time emit() returns
      expect(handlerCalled).toBe(true);
    });

    it('catches handler errors and logs them (does not propagate)', () => {
      const error = new Error('Handler explosion');
      bus.on('TestEvent', () => {
        throw error;
      });

      // Verify the error does not propagate
      expect(() => {
        bus.emit(createTestEvent());
      }).not.toThrow();

      // Verify the error is logged
      expect(mockLoggerError).toHaveBeenCalled();
    });

    it('executes other handlers even when one handler throws an error', () => {
      const handler1 = vi.fn(() => {
        throw new Error('Handler 1 error');
      });
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      bus.on('TestEvent', handler1);
      bus.on('TestEvent', handler2);
      bus.on('TestEvent', handler3);

      bus.emit(createTestEvent());

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
      expect(mockLoggerError).toHaveBeenCalled();
    });

    it('handler receives the correct event payload', () => {
      let receivedEvent: TestEvent | null = null;
      bus.on('TestEvent', (event) => {
        receivedEvent = event;
      });

      const event = createTestEvent('specific-payload');
      bus.emit(event);

      expect(receivedEvent).not.toBeNull();
      expect(receivedEvent!.type).toBe('TestEvent');
      expect(receivedEvent!.payload).toBe('specific-payload');
      expect(receivedEvent!.aggregateId).toBe('test-aggregate-1');
    });
  });

  // ============================
  // on()
  // ============================
  describe('on()', () => {
    it('returns an unsubscribe function', () => {
      const unsubscribe = bus.on('TestEvent', vi.fn());

      expect(unsubscribe).toBeTypeOf('function');
    });

    it('removes the handler when unsubscribe is called', () => {
      const handler = vi.fn();
      const unsubscribe = bus.on('TestEvent', handler);

      // Called before unsubscribe
      bus.emit(createTestEvent());
      expect(handler).toHaveBeenCalledTimes(1);

      // Not called after unsubscribe
      unsubscribe();
      bus.emit(createTestEvent());
      expect(handler).toHaveBeenCalledTimes(1); // Does not increase
    });

    it('does not throw when unsubscribe is called twice', () => {
      const handler = vi.fn();
      const unsubscribe = bus.on('TestEvent', handler);

      unsubscribe();
      expect(() => {
        unsubscribe();
      }).not.toThrow();
    });

    it('can register multiple subscriptions for the same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.on('TestEvent', handler1);
      bus.on('TestEvent', handler2);

      bus.emit(createTestEvent());

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('can unsubscribe a specific handler while keeping others', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsub1 = bus.on('TestEvent', handler1);
      bus.on('TestEvent', handler2);

      unsub1();

      bus.emit(createTestEvent());

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  // ============================
  // clear()
  // ============================
  describe('clear()', () => {
    it('removes all handlers', () => {
      const testHandler = vi.fn();
      const anotherHandler = vi.fn();

      bus.on('TestEvent', testHandler);
      bus.on('AnotherTestEvent', anotherHandler);

      bus.clear();

      bus.emit(createTestEvent());
      bus.emit(createAnotherTestEvent());

      expect(testHandler).not.toHaveBeenCalled();
      expect(anotherHandler).not.toHaveBeenCalled();
    });

    it('allows registering new handlers after clear', () => {
      const oldHandler = vi.fn();
      const newHandler = vi.fn();

      bus.on('TestEvent', oldHandler);
      bus.clear();
      bus.on('TestEvent', newHandler);

      bus.emit(createTestEvent());

      expect(oldHandler).not.toHaveBeenCalled();
      expect(newHandler).toHaveBeenCalledTimes(1);
    });
  });

  // ============================
  // IEventBus interface conformance
  // ============================
  describe('IEventBus interface conformance', () => {
    it('can be used as an IEventBus', () => {
      // Verify that TypedEventBus satisfies the IEventBus interface
      const eventBus: IEventBus = bus;

      const handler = vi.fn();
      eventBus.on('TestEvent', handler);
      eventBus.emit(createTestEvent());

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
