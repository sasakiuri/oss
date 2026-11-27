// SPDX-License-Identifier: MIT
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConnectionEvents } from '@/renderer/presentation/hooks/useConnectionEvents';
import { useConnectionNotificationStore } from '@/renderer/presentation/stores/connectionNotificationStore';
import { useConnectionStore } from '@/renderer/presentation/stores/connectionStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';

import { emit, installMockElectronAPI, type MockedElectronAPI } from '../../../../helpers/mockElectronAPI';

describe('useConnectionEvents', () => {
  let api: MockedElectronAPI;

  beforeEach(() => {
    useSessionStore.getState().resetSession();
    useConnectionStore.getState().disconnect();
    useConnectionNotificationStore.getState().dismiss();
    api = installMockElectronAPI();
  });

  describe('subscription registration', () => {
    it('subscribes to connectionStatusChanged on mount', () => {
      renderHook(() => useConnectionEvents());

      expect(api.on.connectionStatusChanged).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes on unmount', () => {
      const unsubscribe = vi.fn();
      api.on.connectionStatusChanged.mockReturnValue(unsubscribe);

      const { unmount } = renderHook(() => useConnectionEvents());
      unmount();

      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('connected event', () => {
    it('updates the store with connection info', () => {
      useConnectionStore.getState().setSelectedDeviceId('MT201');

      renderHook(() => useConnectionEvents());

      emit('connectionStatusChanged', {
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
      expect(sessState.deviceId).toBe('MT201');
    });

    it('ignores connected events without manufacturer', () => {
      renderHook(() => useConnectionEvents());

      emit('connectionStatusChanged', {
        connectionId: 'conn-1',
        status: 'connected',
      });

      expect(useConnectionStore.getState().status).toBe('disconnected');
    });
  });

  describe('disconnected event', () => {
    it('resets the store', () => {
      useConnectionStore.getState().setConnection('conn-1', '/dev/ttyUSB0', 'KOHTO', 'MT201');
      useSessionStore.getState().setDeviceId('MT201');

      renderHook(() => useConnectionEvents());

      emit('connectionStatusChanged', {
        connectionId: 'conn-1',
        status: 'disconnected',
        reason: 'Device removed',
      });

      const connState = useConnectionStore.getState();
      expect(connState.status).toBe('disconnected');
      expect(connState.connectionId).toBeNull();

      const sessState = useSessionStore.getState();
      expect(sessState.deviceId).toBeNull();
    });

    it('shows a warning notification for unexpected disconnects', () => {
      renderHook(() => useConnectionEvents());

      emit('connectionStatusChanged', {
        connectionId: 'conn-1',
        status: 'disconnected',
        reason: 'USB device disconnected unexpectedly',
      });

      expect(useConnectionNotificationStore.getState().notification).toMatchObject({
        title: 'Target Disconnected',
        message: 'USB device disconnected unexpectedly',
      });
    });

    it('clears an unexpected disconnect warning after a later reconnection succeeds', () => {
      renderHook(() => useConnectionEvents());

      emit('connectionStatusChanged', {
        connectionId: 'conn-1',
        status: 'disconnected',
        reason: 'USB device disconnected unexpectedly',
      });

      expect(useConnectionNotificationStore.getState().notification).toMatchObject({
        title: 'Target Disconnected',
      });

      emit('connectionStatusChanged', {
        connectionId: 'conn-2',
        status: 'connected',
        manufacturer: 'KOHTO',
        portPath: '/dev/ttyUSB1',
      });

      expect(useConnectionNotificationStore.getState().notification).toBeNull();
    });

    it('does not show a warning notification for user-requested disconnects', () => {
      renderHook(() => useConnectionEvents());

      emit('connectionStatusChanged', {
        connectionId: 'conn-1',
        status: 'disconnected',
        reason: 'User requested disconnection',
      });

      expect(useConnectionNotificationStore.getState().notification).toBeNull();
    });
  });
});
