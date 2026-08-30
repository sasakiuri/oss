import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSystemEvents } from '@/renderer/presentation/hooks/useSystemEvents';
import { useTimerStore } from '@/renderer/presentation/stores/system/timer.store';
import { useConnectionStore } from '@/renderer/presentation/stores/system/connection.store';
import { useDebugStore } from '@/renderer/presentation/stores/system/debug.store';
import { useNotificationStore } from '@/renderer/presentation/stores/ui/notifications.store';

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
    useNotificationStore.setState({ notifications: [] });
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
      expect(capturedHandlers.has('competitionAnnouncementDue')).toBe(true);
      expect(capturedHandlers.has('firingWindowViolationDetected')).toBe(true);
      expect(capturedHandlers.has('timerTick')).toBe(true);
      expect(capturedHandlers.has('timerExpired')).toBe(true);
      expect(capturedHandlers.has('debugLog')).toBe(true);
      expect(capturedHandlers.has('mqttConnectionError')).toBe(true);
    });
  });

  describe('competitionAnnouncementDue event', () => {
    it('shows a semantic CRO reminder without controlling scoring or audio', () => {
      const { fireEvent } = renderSystemEvents();

      fireEvent('competitionAnnouncementDue', {
        competitionId: '11111111-1111-4111-8111-111111111111',
        competitionTypeId: 'AR60',
        rulePackId: 'ISSF:2026:AR60:QUALIFICATION',
        phase: 'MATCH',
        remainingSeconds: 600,
        dueAt: '2026-08-29T01:00:00.000Z',
      });

      expect(useNotificationStore.getState().notifications.at(-1)).toMatchObject({
        type: 'warning',
        message: 'AR60: CRO reminder — announce 10 minutes remaining in the match',
      });
    });
  });

  describe('firingWindowViolationDetected event', () => {
    it('warns that Jury review is required without implying an automatic decision', () => {
      const { fireEvent } = renderSystemEvents();

      fireEvent('firingWindowViolationDetected', {
        id: '99999999-9999-4999-8999-999999999999',
        competitionId: '11111111-1111-4111-8111-111111111111',
        laneId: '22222222-2222-4222-8222-222222222222',
        sessionId: '33333333-3333-4333-8333-333333333333',
        shotId: '44444444-4444-4444-8444-444444444444',
        observationId: '55555555-5555-4555-8555-555555555555',
        shotMode: 'MATCH',
        policyRuleId: 'issf.6.11.1.3.after-match-stop',
        kind: 'AFTER_MATCH_STOP',
        ruleReference: '6.11.1.3',
        reviewGuidance: 'Review shot identification and the required miss.',
        timestampSource: 'FIRED_AT',
        clockToleranceMilliseconds: 0,
        evaluatedShotAt: '2026-08-30T01:00:02.000Z',
        firedAt: '2026-08-30T01:00:02.000Z',
        receivedAt: '2026-08-30T01:00:02.010Z',
        observedAt: '2026-08-30T01:00:02.020Z',
        decisiveBoundaryId: '66666666-6666-4666-8666-666666666666',
        detectedAt: '2026-08-30T01:00:02.030Z',
      });

      expect(useNotificationStore.getState().notifications.at(-1)).toMatchObject({
        type: 'warning',
        message: expect.stringMatching(/Rule 6\.11\.1\.3.*Detection only; no score or decision was changed/),
      });
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
