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
 * returns a subscribe function that returns an unsubscribe stub.
 */
function createMockElectronOn() {
  const ipcUnsubscribes: Array<ReturnType<typeof vi.fn>> = [];

  const handler = {
    get(_target: unknown, _eventName: string) {
      return () => {
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
    it('should return an unsubscribe function', () => {
      const unsubscribe = bus.subscribe('laneTimerTick', vi.fn());

      expect(typeof unsubscribe).toBe('function');
    });

    it('should call window.electronAPI.on[event] with the handler', () => {
      const onLaneTimerTick = vi.fn().mockReturnValue(vi.fn());
      (globalThis as Record<string, unknown>).window = {
        electronAPI: {
          on: { laneTimerTick: onLaneTimerTick },
        },
      };

      const handler = vi.fn();
      bus.subscribe('laneTimerTick', handler);

      expect(onLaneTimerTick).toHaveBeenCalledWith(handler);
    });
  });

  describe('unsubscribe (returned function)', () => {
    it('should call the IPC unsubscribe function', () => {
      const unsubscribe = bus.subscribe('laneTimerTick', vi.fn());

      unsubscribe();

      expect(mockOn.ipcUnsubscribes[0]).toHaveBeenCalledOnce();
    });

    it('should be safe to call twice (double unsubscribe)', () => {
      const unsubscribe = bus.subscribe('laneTimerTick', vi.fn());

      unsubscribe();
      unsubscribe(); // second call should not throw

      // IPC unsubscribe should only be called once due to the `cleaned` guard
      expect(mockOn.ipcUnsubscribes[0]).toHaveBeenCalledTimes(1);
    });

    it('should only release the listener of the subscription it belongs to', () => {
      const unsub1 = bus.subscribe('laneTimerTick', vi.fn());
      bus.subscribe('laneTimerTick', vi.fn());
      bus.subscribe('laneTimerExpired', vi.fn());

      unsub1();

      expect(mockOn.ipcUnsubscribes[0]).toHaveBeenCalledOnce();
      expect(mockOn.ipcUnsubscribes[1]).not.toHaveBeenCalled();
      expect(mockOn.ipcUnsubscribes[2]).not.toHaveBeenCalled();
    });
  });
});
