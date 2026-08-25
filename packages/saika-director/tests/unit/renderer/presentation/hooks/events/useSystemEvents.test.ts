import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSystemEvents } from '@/renderer/presentation/hooks/useSystemEvents';
import { useTimerStore } from '@/renderer/presentation/stores/system/timer.store';
import { useConnectionStore } from '@/renderer/presentation/stores/system/connection.store';
import { useDebugStore } from '@/renderer/presentation/stores/system/debug.store';

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

const { getControlState } = vi.hoisted(() => ({
  getControlState: vi.fn(),
}));

vi.mock('@/renderer/services', () => ({
  mqttService: { getControlState },
}));

// ---------------------------------------------------------------------------
// Mock useEvent to capture event handlers
// ---------------------------------------------------------------------------

type EventCallback = (data: unknown) => void;
const capturedHandlers = new Map<string, EventCallback>();

vi.mock('@/renderer/presentation/hooks/useEvent', () => ({
  useEvent: (event: string, handler: EventCallback) => {
    capturedHandlers.set(event, handler);
  },
}));

describe('useSystemEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedHandlers.clear();
    getControlState.mockImplementation(() => new Promise(() => {}));

    // Reset stores to initial state
    useTimerStore.setState({
      remainingTime: 0,
      phase: 'IDLE',
      isRunning: false,
    });
    useConnectionStore.setState({
      isConnected: false,
      connectedChannels: [],
    });
    useDebugStore.setState({
      entries: [],
      isVisible: false,
      activeTab: 'ALL',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper to render the hook and return an event firing utility.
   */
  function renderSystemEvents() {
    renderHook(() => useSystemEvents());
    return {
      fireEvent: (eventName: string, data: unknown) => {
        const handler = capturedHandlers.get(eventName);
        if (!handler) throw new Error(`No handler captured for event: ${eventName}`);
        act(() => {
          handler(data);
        });
      },
    };
  }

  describe('event subscriptions', () => {
    it('should subscribe to all system events', () => {
      renderSystemEvents();

      expect(capturedHandlers.has('laneConnected')).toBe(true);
      expect(capturedHandlers.has('mqttControlStateChanged')).toBe(true);
      expect(capturedHandlers.has('timerTick')).toBe(true);
      expect(capturedHandlers.has('timerExpired')).toBe(true);
      expect(capturedHandlers.has('debugLog')).toBe(true);
      expect(capturedHandlers.has('mqttConnectionError')).toBe(true);
    });
  });

  describe('timerTick event', () => {
    it('should update timer store with remaining time and phase', () => {
      const { fireEvent } = renderSystemEvents();

      fireEvent('timerTick', { remainingTime: 250, phase: 'ACTIVE' });

      const state = useTimerStore.getState();
      expect(state.remainingTime).toBe(250);
      expect(state.phase).toBe('ACTIVE');
      expect(state.isRunning).toBe(true);
    });

    it('should set isRunning to false when remainingTime is 0', () => {
      const { fireEvent } = renderSystemEvents();

      fireEvent('timerTick', { remainingTime: 0, phase: 'ACTIVE' });

      const state = useTimerStore.getState();
      expect(state.remainingTime).toBe(0);
      expect(state.isRunning).toBe(false);
    });

    it('should update phase on timer tick', () => {
      const { fireEvent } = renderSystemEvents();

      fireEvent('timerTick', { remainingTime: 300, phase: 'ACTIVE' });

      expect(useTimerStore.getState().phase).toBe('ACTIVE');
    });
  });

  describe('timerExpired event', () => {
    it('should set remaining time to 0 and isRunning to false', () => {
      // First set a running timer
      useTimerStore.setState({ remainingTime: 10, phase: 'ACTIVE', isRunning: true });

      const { fireEvent } = renderSystemEvents();

      fireEvent('timerExpired', { phase: 'ACTIVE' });

      const state = useTimerStore.getState();
      expect(state.remainingTime).toBe(0);
      expect(state.phase).toBe('ACTIVE');
      expect(state.isRunning).toBe(false);
    });

    it('should update the phase when timer expires', () => {
      const { fireEvent } = renderSystemEvents();

      fireEvent('timerExpired', { phase: 'ACTIVE' });

      expect(useTimerStore.getState().phase).toBe('ACTIVE');
    });
  });

  describe('laneConnected event', () => {
    it('should add channel to connected channels', () => {
      const { fireEvent } = renderSystemEvents();

      fireEvent('laneConnected', { channel: 3 });

      const state = useConnectionStore.getState();
      expect(state.connectedChannels).toContain(3);
      expect(state.isConnected).toBe(true);
    });

    it('should accumulate multiple channels', () => {
      const { fireEvent } = renderSystemEvents();

      fireEvent('laneConnected', { channel: 1 });
      fireEvent('laneConnected', { channel: 3 });
      fireEvent('laneConnected', { channel: 2 });

      const state = useConnectionStore.getState();
      // Channels should be sorted per the store implementation
      expect(state.connectedChannels).toEqual([1, 2, 3]);
    });

    it('should not duplicate channels', () => {
      const { fireEvent } = renderSystemEvents();

      fireEvent('laneConnected', { channel: 1 });
      fireEvent('laneConnected', { channel: 1 });

      const state = useConnectionStore.getState();
      expect(state.connectedChannels).toEqual([1]);
    });
  });

  describe('mqttControlStateChanged event', () => {
    it('should hydrate the connection store from the current MQTT state on mount', async () => {
      getControlState.mockResolvedValue({
        success: true,
        data: {
          connected: true,
          lanes: [
            { firingPointNumber: 2, hardware: { connection: { status: 'connected' } } },
            { firingPointNumber: 4, hardware: { connection: { status: 'disconnected' } } },
          ],
        },
      });

      renderSystemEvents();

      await waitFor(() => {
        expect(useConnectionStore.getState()).toMatchObject({
          isConnected: true,
          connectedChannels: [2],
        });
      });
      expect(getControlState).toHaveBeenCalledTimes(1);
    });

    it('should not overwrite a live event with an older initial query response', async () => {
      let resolveInitialState: (value: unknown) => void = () => {};
      getControlState.mockReturnValue(
        new Promise((resolve) => {
          resolveInitialState = resolve;
        }),
      );
      const { fireEvent } = renderSystemEvents();

      fireEvent('mqttControlStateChanged', {
        connected: true,
        lanes: [{ firingPointNumber: 3, hardware: { connection: { status: 'connected' } } }],
      });

      await act(async () => {
        resolveInitialState({ success: true, data: { connected: false, lanes: [] } });
        await Promise.resolve();
      });

      expect(useConnectionStore.getState()).toMatchObject({
        isConnected: true,
        connectedChannels: [3],
      });
    });

    it('should replace stale channels with the connected lanes from the latest snapshot', () => {
      const { fireEvent } = renderSystemEvents();

      fireEvent('laneConnected', { channel: 2 });
      fireEvent('mqttControlStateChanged', {
        connected: true,
        lanes: [
          { firingPointNumber: 3, hardware: { connection: { status: 'connected' } } },
          { firingPointNumber: 2, hardware: { connection: { status: 'disconnected' } } },
          { firingPointNumber: 1, hardware: { connection: { status: 'connected' } } },
          { firingPointNumber: null, hardware: { connection: { status: 'connected' } } },
        ],
      });

      const state = useConnectionStore.getState();
      expect(state.isConnected).toBe(true);
      expect(state.connectedChannels).toEqual([1, 3]);
    });

    it('should represent a broker connection with no connected lanes', () => {
      const { fireEvent } = renderSystemEvents();

      fireEvent('mqttControlStateChanged', { connected: true, lanes: [] });

      const state = useConnectionStore.getState();
      expect(state.isConnected).toBe(true);
      expect(state.connectedChannels).toEqual([]);
    });

    it('should clear connected channels when the broker disconnects', () => {
      const { fireEvent } = renderSystemEvents();

      fireEvent('laneConnected', { channel: 2 });
      fireEvent('mqttControlStateChanged', { connected: false, lanes: [] });

      const state = useConnectionStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.connectedChannels).toEqual([]);
    });
  });

  describe('debugLog event', () => {
    it('should add debug entry to the debug store', () => {
      const { fireEvent } = renderSystemEvents();

      const logEntry = {
        timestamp: Date.now(),
        direction: 'RX' as const,
        raw: 'test raw data',
        parsed: 'test parsed data',
      };

      fireEvent('debugLog', logEntry);

      const state = useDebugStore.getState();
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0]).toEqual(logEntry);
    });

    it('should accumulate multiple debug entries', () => {
      const { fireEvent } = renderSystemEvents();

      fireEvent('debugLog', {
        timestamp: 1000,
        direction: 'TX',
        raw: 'first',
      });
      fireEvent('debugLog', {
        timestamp: 2000,
        direction: 'RX',
        raw: 'second',
      });

      const state = useDebugStore.getState();
      expect(state.entries).toHaveLength(2);
    });
  });
});
