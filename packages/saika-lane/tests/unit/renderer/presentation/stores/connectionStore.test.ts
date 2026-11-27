// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it } from 'vitest';

import { useConnectionStore } from '@/renderer/presentation/stores/connectionStore';

describe('connectionStore', () => {
  beforeEach(() => {
    useConnectionStore.getState().disconnect();
  });

  it('starts disconnected without a connection or device', () => {
    expect(useConnectionStore.getState()).toMatchObject({
      status: 'disconnected',
      connectionId: null,
      selectedDeviceId: null,
    });
  });

  describe('setConnection', () => {
    it('marks the store connected with the connection and device', () => {
      useConnectionStore.getState().setConnection('conn-123', 'MT201');

      expect(useConnectionStore.getState()).toMatchObject({
        status: 'connected',
        connectionId: 'conn-123',
        selectedDeviceId: 'MT201',
      });
    });

    it('clears the device when none is given', () => {
      useConnectionStore.getState().setConnection('conn-123', 'MT201');
      useConnectionStore.getState().setConnection('conn-456');

      expect(useConnectionStore.getState()).toMatchObject({
        status: 'connected',
        connectionId: 'conn-456',
        selectedDeviceId: null,
      });
    });

    it('can set empty string as connection ID', () => {
      useConnectionStore.getState().setConnection('');

      expect(useConnectionStore.getState().connectionId).toBe('');
    });
  });

  describe('disconnect', () => {
    it('resets the connection state', () => {
      useConnectionStore.getState().setConnection('conn-123', 'MT201');

      useConnectionStore.getState().disconnect();

      expect(useConnectionStore.getState()).toMatchObject({
        status: 'disconnected',
        connectionId: null,
        selectedDeviceId: null,
      });
    });

    it('can be called repeatedly and when not connected', () => {
      const { disconnect } = useConnectionStore.getState();

      disconnect();
      disconnect();

      expect(useConnectionStore.getState()).toMatchObject({ status: 'disconnected', connectionId: null });
    });
  });

  it('connect -> disconnect -> reconnect flow works correctly', () => {
    const { setConnection, disconnect } = useConnectionStore.getState();

    setConnection('conn-123');
    expect(useConnectionStore.getState()).toMatchObject({ status: 'connected', connectionId: 'conn-123' });

    disconnect();
    expect(useConnectionStore.getState()).toMatchObject({ status: 'disconnected', connectionId: null });

    setConnection('conn-456');
    expect(useConnectionStore.getState()).toMatchObject({ status: 'connected', connectionId: 'conn-456' });
  });

  it('replaces the state object instead of mutating it', () => {
    const before = useConnectionStore.getState();

    useConnectionStore.getState().setConnection('conn-123');

    const after = useConnectionStore.getState();
    expect(after).not.toBe(before);
    expect(before.status).toBe('disconnected');
    expect(after.status).toBe('connected');
  });
});
