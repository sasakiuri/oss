// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetAudioPlaybackForTest } from '@/renderer/presentation/hooks/useAudioPlayback';
import { useEventSubscriptions } from '@/renderer/presentation/hooks/useEventSubscriptions';
import { useConnectionStore } from '@/renderer/presentation/stores/connectionStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import type {
  ConnectionStatusChangedEventPayload,
  ModeSwitchedEventPayload,
  SessionResetEventPayload,
  SessionStartedEventPayload,
  ShotRecordedEventPayload,
} from '@/shared/ipc/contracts';

// Mock shot sound asset
vi.mock('@/assets/sounds/shot.wav', () => ({
  default: 'mock-shot-sound.wav',
}));

// AudioContext mock (useAudioPlayback uses Web Audio API)
const mockStart = vi.fn();
const fakeBuffer = { duration: 1 } as AudioBuffer;
const mockDecodeAudioData = vi.fn().mockResolvedValue(fakeBuffer);

function createMockAudioContext() {
  return {
    state: 'running',
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    destination: {},
    createBufferSource: vi.fn(() => ({
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      start: mockStart,
    })),
    createGain: vi.fn(() => ({
      gain: { value: 1 },
      connect: vi.fn(),
    })),
    decodeAudioData: mockDecodeAudioData,
  };
}

const MockAudioContext = vi.fn().mockImplementation(() => createMockAudioContext());

const mockFetch = vi.fn().mockResolvedValue({
  arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
});

/** Wait for fetch → arrayBuffer → decodeAudioData → bufferRef chain to complete */
async function flushAudioLoad() {
  await vi.waitFor(() => {
    expect(mockDecodeAudioData).toHaveBeenCalled();
  });
  // Flush the final .then that sets bufferRef.current
  await act(async () => {
    await Promise.resolve();
  });
}

// Individual mock functions for each event
const mockOnSessionStarted = vi.fn();
const mockOnModeSwitched = vi.fn();
const mockOnSessionReset = vi.fn();
const mockOnConnectionStatusChanged = vi.fn();
const mockOnShotReceived = vi.fn();
const mockOnShotRecorded = vi.fn();
const mockOnUpdateStateChanged = vi.fn();

describe('useEventSubscriptions', () => {
  beforeEach(() => {
    _resetAudioPlaybackForTest();
    useSessionStore.getState().resetSession();
    useConnectionStore.getState().disconnect();
    vi.clearAllMocks();

    // Default: return unsubscribe function
    mockOnSessionStarted.mockReturnValue(vi.fn());
    mockOnModeSwitched.mockReturnValue(vi.fn());
    mockOnSessionReset.mockReturnValue(vi.fn());
    mockOnConnectionStatusChanged.mockReturnValue(vi.fn());
    mockOnShotReceived.mockReturnValue(vi.fn());
    mockOnShotRecorded.mockReturnValue(vi.fn());
    mockOnUpdateStateChanged.mockReturnValue(vi.fn());

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: {
        updates: {
          getUpdateState: vi.fn(),
          checkForUpdates: vi.fn(),
          quitAndInstall: vi.fn(),
        },
        on: {
          sessionStarted: mockOnSessionStarted,
          modeSwitched: mockOnModeSwitched,
          sessionReset: mockOnSessionReset,
          connectionStatusChanged: mockOnConnectionStatusChanged,
          shotReceived: mockOnShotReceived,
          shotRecorded: mockOnShotRecorded,
          competitionStarted: vi.fn().mockReturnValue(vi.fn()),
          phaseChanged: vi.fn().mockReturnValue(vi.fn()),
          timerTick: vi.fn().mockReturnValue(vi.fn()),
          timerExpired: vi.fn().mockReturnValue(vi.fn()),
          seriesCompleted: vi.fn().mockReturnValue(vi.fn()),
          stageAdvanced: vi.fn().mockReturnValue(vi.fn()),
          competitionFinished: vi.fn().mockReturnValue(vi.fn()),
          logMessage: vi.fn().mockReturnValue(vi.fn()),
          updateStateChanged: mockOnUpdateStateChanged,
        },
      },
    });

    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    _resetAudioPlaybackForTest();
    delete (window as any).electronAPI;
    vi.unstubAllGlobals();
  });

  describe('event subscription registration', () => {
    it('registers all event listeners on mount', () => {
      renderHook(() => useEventSubscriptions());

      expect(mockOnSessionStarted).toHaveBeenCalledTimes(1);
      expect(mockOnModeSwitched).toHaveBeenCalledTimes(1);
      expect(mockOnSessionReset).toHaveBeenCalledTimes(1);
      expect(mockOnConnectionStatusChanged).toHaveBeenCalledTimes(1);
      expect(mockOnShotRecorded).toHaveBeenCalledTimes(1);
      expect(mockOnUpdateStateChanged).toHaveBeenCalledTimes(1);
    });

    it('unregisters all event listeners on unmount', () => {
      const unsubSessionStarted = vi.fn();
      const unsubModeSwitched = vi.fn();
      const unsubSessionReset = vi.fn();
      const unsubConnectionStatusChanged = vi.fn();
      const unsubShotRecorded = vi.fn();
      const unsubUpdateStateChanged = vi.fn();

      mockOnSessionStarted.mockReturnValue(unsubSessionStarted);
      mockOnModeSwitched.mockReturnValue(unsubModeSwitched);
      mockOnSessionReset.mockReturnValue(unsubSessionReset);
      mockOnConnectionStatusChanged.mockReturnValue(unsubConnectionStatusChanged);
      mockOnShotRecorded.mockReturnValue(unsubShotRecorded);
      mockOnUpdateStateChanged.mockReturnValue(unsubUpdateStateChanged);

      const { unmount } = renderHook(() => useEventSubscriptions());

      unmount();

      expect(unsubSessionStarted).toHaveBeenCalledTimes(1);
      expect(unsubModeSwitched).toHaveBeenCalledTimes(1);
      expect(unsubSessionReset).toHaveBeenCalledTimes(1);
      expect(unsubConnectionStatusChanged).toHaveBeenCalledTimes(1);
      expect(unsubShotRecorded).toHaveBeenCalledTimes(1);
      expect(unsubUpdateStateChanged).toHaveBeenCalledTimes(1);
    });
  });

  describe('sessionStarted event', () => {
    it('updates the store on sessionStarted event', () => {
      renderHook(() => useEventSubscriptions());

      const callback = mockOnSessionStarted.mock.calls[0]![0] as (event: SessionStartedEventPayload) => void;

      callback({
        sessionId: 'session-abc',
        discipline: 'AIR_RIFLE_10M',
      });

      const sessionState = useSessionStore.getState();
      expect(sessionState.currentSessionId).toBe('session-abc');
      expect(sessionState.mode).toBe('SIGHTING');
    });
  });

  describe('modeSwitched event', () => {
    it('updates the store on modeSwitched event', () => {
      renderHook(() => useEventSubscriptions());

      const callback = mockOnModeSwitched.mock.calls[0]![0] as (event: ModeSwitchedEventPayload) => void;

      callback({
        sessionId: 'session-abc',
        mode: 'MATCH',
      });

      const sessionState = useSessionStore.getState();
      expect(sessionState.mode).toBe('MATCH');
    });
  });

  describe('sessionReset event', () => {
    it('resets the store on sessionReset event', () => {
      useSessionStore.getState().setSessionId('session-abc');
      useSessionStore.getState().setMode('MATCH');

      renderHook(() => useEventSubscriptions());

      const callback = mockOnSessionReset.mock.calls[0]![0] as (event: SessionResetEventPayload) => void;

      callback({
        sessionId: 'session-abc',
      });

      const sessionState = useSessionStore.getState();
      expect(sessionState.currentSessionId).toBeNull();
      expect(sessionState.mode).toBe('SIGHTING');
      expect(sessionState.shots).toEqual([]);
      expect(sessionState.totalScore).toBe(0);
      expect(sessionState.seriesScores).toEqual([]);
    });
  });

  describe('connectionStatusChanged event', () => {
    it('updates the store on connected event', () => {
      useConnectionStore.getState().setSelectedDeviceId('MT201');

      renderHook(() => useEventSubscriptions());

      const callback = mockOnConnectionStatusChanged.mock.calls[0]![0] as (
        event: ConnectionStatusChangedEventPayload,
      ) => void;

      callback({
        connectionId: 'conn-123',
        status: 'connected',
        manufacturer: 'KOHTO',
        portPath: '/dev/ttyUSB0',
      });

      const connectionState = useConnectionStore.getState();
      expect(connectionState.status).toBe('connected');
      expect(connectionState.connectionId).toBe('conn-123');
      expect(connectionState.portName).toBe('/dev/ttyUSB0');
      expect(connectionState.manufacturer).toBe('KOHTO');

      const sessionState = useSessionStore.getState();
      expect(sessionState.manufacturer).toBe('KOHTO');
      expect(sessionState.deviceId).toBe('MT201');
    });

    it('resets the store on disconnected event', () => {
      useConnectionStore.getState().setConnection('conn-123', '/dev/ttyUSB0', 'KOHTO', 'MT201');
      useSessionStore.getState().setDeviceInfo('KOHTO', 'MT201');

      renderHook(() => useEventSubscriptions());

      const callback = mockOnConnectionStatusChanged.mock.calls[0]![0] as (
        event: ConnectionStatusChangedEventPayload,
      ) => void;

      callback({
        connectionId: 'conn-123',
        status: 'disconnected',
        reason: 'Device removed',
      });

      const connectionState = useConnectionStore.getState();
      expect(connectionState.status).toBe('disconnected');
      expect(connectionState.connectionId).toBeNull();
      expect(connectionState.portName).toBeNull();
      expect(connectionState.manufacturer).toBeNull();

      const sessionState = useSessionStore.getState();
      expect(sessionState.manufacturer).toBeNull();
      expect(sessionState.deviceId).toBeNull();
    });

    it('does not update the store on connected event without manufacturer', () => {
      renderHook(() => useEventSubscriptions());

      const callback = mockOnConnectionStatusChanged.mock.calls[0]![0] as (
        event: ConnectionStatusChangedEventPayload,
      ) => void;

      callback({
        connectionId: 'conn-123',
        status: 'connected',
      });

      const connectionState = useConnectionStore.getState();
      expect(connectionState.status).toBe('disconnected');
      expect(connectionState.connectionId).toBeNull();

      const sessionState = useSessionStore.getState();
      expect(sessionState.manufacturer).toBeNull();
      expect(sessionState.deviceId).toBeNull();
    });
  });

  describe('shotRecorded event', () => {
    it('adds a shot on shotRecorded event', () => {
      renderHook(() => useEventSubscriptions());

      const callback = mockOnShotRecorded.mock.calls[0]![0] as (event: ShotRecordedEventPayload) => void;

      callback({
        sessionId: 'session-abc',
        shot: {
          id: 'shot-1',
          shotNumber: 1,
          x: 0.5,
          y: -0.3,
          score: 10.2,
          timestamp: '2026-02-15T10:00:00Z',
          mode: 'SIGHTING',
          isRecorded: true,
          innerTen: false,
        },
      });

      const sessionState = useSessionStore.getState();
      expect(sessionState.shots).toHaveLength(1);
      expect(sessionState.shots[0]).toEqual({
        id: 'shot-1',
        shotNumber: 1,
        x: 0.5,
        y: -0.3,
        score: 10.2,
        timestamp: '2026-02-15T10:00:00Z',
        mode: 'SIGHTING',
        isRecorded: true,
        innerTen: false,
      });
    });

    it('does not play shot sound on shotRecorded (played on shotReceived instead)', async () => {
      useSessionStore.getState().setDeviceInfo('KOHTO', 'MT201');

      renderHook(() => useEventSubscriptions());
      await flushAudioLoad();

      mockStart.mockClear();

      const callback = mockOnShotRecorded.mock.calls[0]![0] as (event: ShotRecordedEventPayload) => void;

      callback({
        sessionId: 'session-abc',
        shot: {
          id: 'shot-1',
          shotNumber: 1,
          x: 0.5,
          y: -0.3,
          score: 10.2,
          timestamp: '2026-02-15T10:00:00Z',
          mode: 'MATCH',
          isRecorded: true,
          innerTen: false,
        },
      });

      expect(mockStart).not.toHaveBeenCalled();
    });
  });

  describe('shotReceived event (low-latency audio playback)', () => {
    it('plays shot sound for MT201 device', async () => {
      useSessionStore.getState().setDeviceInfo('KOHTO', 'MT201');

      renderHook(() => useEventSubscriptions());
      await flushAudioLoad();

      mockStart.mockClear();

      const callback = mockOnShotReceived.mock.calls[0]![0] as () => void;
      callback();

      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it.each(['DISAG_KT_RDT_ZIE_1_RIFLE', 'DISAG_KT_RDT_ZIE_1_PISTOL'])(
      'plays shot sound for a validated DISAG RedDot hit from %s',
      async (deviceId) => {
        useSessionStore.getState().setDeviceInfo('DISAG', deviceId);

        renderHook(() => useEventSubscriptions());
        await flushAudioLoad();

        mockStart.mockClear();

        const callback = mockOnShotReceived.mock.calls[0]![0] as () => void;
        callback();

        expect(mockStart).toHaveBeenCalledTimes(1);
      },
    );

    it('does not play shot sound for unsupported devices', async () => {
      useSessionStore.getState().setDeviceInfo('SIUS', 'HS10');

      renderHook(() => useEventSubscriptions());
      await flushAudioLoad();

      mockStart.mockClear();

      const callback = mockOnShotReceived.mock.calls[0]![0] as () => void;
      callback();

      expect(mockStart).not.toHaveBeenCalled();
    });
  });
});
