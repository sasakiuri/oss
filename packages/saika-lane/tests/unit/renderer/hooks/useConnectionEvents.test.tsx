// SPDX-License-Identifier: MIT
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useConnectionEvents } from '@/renderer/presentation/hooks/useConnectionEvents';
import { useConnectionStore } from '@/renderer/presentation/stores/connectionStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import type { ConnectionStatusChangedEventPayload } from '@/shared/ipc/contracts';

const mockOnConnectionStatusChanged = vi.fn();

describe('useConnectionEvents', () => {
  beforeEach(() => {
    useSessionStore.getState().resetSession();
    useConnectionStore.getState().disconnect();
    vi.clearAllMocks();

    mockOnConnectionStatusChanged.mockReturnValue(vi.fn());

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: {
        on: {
          connectionStatusChanged: mockOnConnectionStatusChanged,
        },
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'electronAPI');
  });

  describe('subscription registration', () => {
    it('subscribes to connectionStatusChanged on mount', () => {
      renderHook(() => useConnectionEvents());

      expect(mockOnConnectionStatusChanged).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes on unmount', () => {
      const unsubscribe = vi.fn();
      mockOnConnectionStatusChanged.mockReturnValue(unsubscribe);

      const { unmount } = renderHook(() => useConnectionEvents());
      unmount();

      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('connected event', () => {
    it('updates the store with connection info', () => {
      useConnectionStore.getState().setSelectedDeviceId('MT201');

      renderHook(() => useConnectionEvents());

      const callback = mockOnConnectionStatusChanged.mock.calls[0]![0] as (
        event: ConnectionStatusChangedEventPayload,
      ) => void;

      callback({
        connectionId: 'conn-1',
        status: 'connected',
        manufacturer: 'KOHTO',
        portPath: '/dev/ttyUSB0',
      });

      const connState = useConnectionStore.getState();
      expect(connState.status).toBe('connected');
      expect(connState.connectionId).toBe('conn-1');
      expect(connState.portName).toBe('/dev/ttyUSB0');
      expect(connState.manufacturer).toBe('KOHTO');

      const sessState = useSessionStore.getState();
      expect(sessState.manufacturer).toBe('KOHTO');
      expect(sessState.deviceId).toBe('MT201');
    });

    it('ignores connected events without manufacturer', () => {
      renderHook(() => useConnectionEvents());

      const callback = mockOnConnectionStatusChanged.mock.calls[0]![0] as (
        event: ConnectionStatusChangedEventPayload,
      ) => void;

      callback({
        connectionId: 'conn-1',
        status: 'connected',
      });

      expect(useConnectionStore.getState().status).toBe('disconnected');
    });
  });

  describe('disconnected event', () => {
    it('resets the store', () => {
      useConnectionStore.getState().setConnection('conn-1', '/dev/ttyUSB0', 'KOHTO', 'MT201');
      useSessionStore.getState().setDeviceInfo('KOHTO', 'MT201');

      renderHook(() => useConnectionEvents());

      const callback = mockOnConnectionStatusChanged.mock.calls[0]![0] as (
        event: ConnectionStatusChangedEventPayload,
      ) => void;

      callback({
        connectionId: 'conn-1',
        status: 'disconnected',
        reason: 'Device removed',
      });

      const connState = useConnectionStore.getState();
      expect(connState.status).toBe('disconnected');
      expect(connState.connectionId).toBeNull();

      const sessState = useSessionStore.getState();
      expect(sessState.manufacturer).toBeNull();
      expect(sessState.deviceId).toBeNull();
    });
  });
});
