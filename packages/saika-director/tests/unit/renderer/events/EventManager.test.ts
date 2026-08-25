import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ElectronEventBus } from '@/renderer/events/ElectronEventBus';

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

// ---------------------------------------------------------------------------
// Mock window.electronAPI.on
// ---------------------------------------------------------------------------

/**
 * Creates a mock for window.electronAPI.on where each event name
 * returns a subscribe function that captures the handler and returns
 * an unsubscribe stub.
 */
function createMockElectronOn() {
  const ipcUnsubscribes: Array<ReturnType<typeof vi.fn>> = [];

  const handler = {
    get(_target: unknown, _eventName: string) {
      return (callback: (...args: unknown[]) => void) => {
        // Store the callback for testing if needed
        void callback;
        const unsub = vi.fn();
        ipcUnsubscribes.push(unsub);
        return unsub;
      };
    },
  };

  return {
    on: new Proxy({}, handler),
    ipcUnsubscribes,
  };
}

describe('ElectronEventBus', () => {
  let bus: ElectronEventBus;
  let mockOn: ReturnType<typeof createMockElectronOn>;

  beforeEach(() => {
    bus = new ElectronEventBus();
    mockOn = createMockElectronOn();

    // Set up the global window.electronAPI mock
    (globalThis as Record<string, unknown>).window = {
      electronAPI: {
        on: mockOn.on,
      },
    };
  });

  describe('subscribe', () => {
    it('should register an event handler and track the subscription', () => {
      const handler = vi.fn();

      bus.subscribe('timerTick', handler);

      expect(bus.getSubscriptionCount('timerTick')).toBe(1);
      expect(bus.getSubscriptionCount()).toBe(1);
    });

    it('should return an unsubscribe function', () => {
      const handler = vi.fn();

      const unsubscribe = bus.subscribe('timerTick', handler);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should call window.electronAPI.on[event] with the handler', () => {
      const onTimerTick = vi.fn().mockReturnValue(vi.fn());
      (globalThis as Record<string, unknown>).window = {
        electronAPI: {
          on: { timerTick: onTimerTick },
        },
      };

      const handler = vi.fn();
      bus.subscribe('timerTick', handler);

      expect(onTimerTick).toHaveBeenCalledWith(handler);
    });
  });

  describe('unsubscribe (returned function)', () => {
    it('should remove the subscription from tracking on unsubscribe', () => {
      const handler = vi.fn();
      const unsubscribe = bus.subscribe('timerTick', handler);

      expect(bus.getSubscriptionCount('timerTick')).toBe(1);

      unsubscribe();

      expect(bus.getSubscriptionCount('timerTick')).toBe(0);
      expect(bus.getSubscriptionCount()).toBe(0);
    });

    it('should call the IPC unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = bus.subscribe('timerTick', handler);

      unsubscribe();

      // The proxy-based mock stores unsubscribe fns
      expect(mockOn.ipcUnsubscribes[0]).toHaveBeenCalledOnce();
    });

    it('should be safe to call twice (double unsubscribe)', () => {
      const handler = vi.fn();
      const unsubscribe = bus.subscribe('timerTick', handler);

      unsubscribe();
      unsubscribe(); // second call should not throw

      expect(bus.getSubscriptionCount('timerTick')).toBe(0);
      // IPC unsubscribe should only be called once due to the `cleaned` guard
      expect(mockOn.ipcUnsubscribes[0]).toHaveBeenCalledTimes(1);
    });

    it('should clean up the event key from the map when last subscription is removed', () => {
      const handler = vi.fn();
      const unsubscribe = bus.subscribe('timerTick', handler);

      unsubscribe();

      // Internal map should no longer have the event key
      expect(bus.getSubscriptionCount('timerTick')).toBe(0);
      expect(bus.getSubscriptionCount()).toBe(0);
    });
  });

  describe('multiple subscribers to same event', () => {
    it('should track multiple subscriptions independently', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      bus.subscribe('timerTick', handler1);
      bus.subscribe('timerTick', handler2);
      bus.subscribe('timerTick', handler3);

      expect(bus.getSubscriptionCount('timerTick')).toBe(3);
      expect(bus.getSubscriptionCount()).toBe(3);
    });

    it('should only remove the specific subscription when unsubscribed', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsub1 = bus.subscribe('timerTick', handler1);
      bus.subscribe('timerTick', handler2);

      unsub1();

      expect(bus.getSubscriptionCount('timerTick')).toBe(1);
    });
  });

  describe('subscriptions across different events', () => {
    it('should track subscriptions per event name', () => {
      bus.subscribe('timerTick', vi.fn());
      bus.subscribe('timerExpired', vi.fn());
      bus.subscribe('timerTick', vi.fn());

      expect(bus.getSubscriptionCount('timerTick')).toBe(2);
      expect(bus.getSubscriptionCount('timerExpired')).toBe(1);
      expect(bus.getSubscriptionCount()).toBe(3);
    });
  });

  describe('getSubscriptionCount', () => {
    it('should return 0 for an event with no subscriptions', () => {
      expect(bus.getSubscriptionCount('timerTick')).toBe(0);
    });

    it('should return 0 for total when no subscriptions exist', () => {
      expect(bus.getSubscriptionCount()).toBe(0);
    });

    it('should return correct count for a specific event', () => {
      bus.subscribe('timerTick', vi.fn());
      bus.subscribe('timerTick', vi.fn());

      expect(bus.getSubscriptionCount('timerTick')).toBe(2);
    });

    it('should return correct total across all events', () => {
      bus.subscribe('timerTick', vi.fn());
      bus.subscribe('timerExpired', vi.fn());
      bus.subscribe('laneConnected', vi.fn());

      expect(bus.getSubscriptionCount()).toBe(3);
    });
  });

  describe('unsubscribeAll', () => {
    it('should remove all subscriptions', () => {
      bus.subscribe('timerTick', vi.fn());
      bus.subscribe('timerExpired', vi.fn());
      bus.subscribe('laneConnected', vi.fn());

      expect(bus.getSubscriptionCount()).toBe(3);

      bus.unsubscribeAll();

      expect(bus.getSubscriptionCount()).toBe(0);
      expect(bus.getSubscriptionCount('timerTick')).toBe(0);
      expect(bus.getSubscriptionCount('timerExpired')).toBe(0);
      expect(bus.getSubscriptionCount('laneConnected')).toBe(0);
    });

    it('should call IPC unsubscribe for every active subscription', () => {
      bus.subscribe('timerTick', vi.fn());
      bus.subscribe('timerExpired', vi.fn());

      bus.unsubscribeAll();

      expect(mockOn.ipcUnsubscribes[0]).toHaveBeenCalledOnce();
      expect(mockOn.ipcUnsubscribes[1]).toHaveBeenCalledOnce();
    });

    it('should be safe to call when no subscriptions exist', () => {
      expect(() => bus.unsubscribeAll()).not.toThrow();
      expect(bus.getSubscriptionCount()).toBe(0);
    });

    it('should be safe to call multiple times', () => {
      bus.subscribe('timerTick', vi.fn());

      bus.unsubscribeAll();
      bus.unsubscribeAll();

      expect(bus.getSubscriptionCount()).toBe(0);
    });
  });
});
