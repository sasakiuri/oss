// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it } from 'vitest';

import { useConnectionStore } from '@/renderer/presentation/stores/connectionStore';
import type { ConnectionStatus } from '@/shared/ipc/contracts';

describe('connectionStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    const { disconnect } = useConnectionStore.getState();
    disconnect();
  });

  describe('initial state', () => {
    it('status is disconnected', () => {
      const { status } = useConnectionStore.getState();
      expect(status).toBe('disconnected');
    });

    it('connectionId is null', () => {
      const { connectionId } = useConnectionStore.getState();
      expect(connectionId).toBeNull();
    });

    it('portName is null', () => {
      const { portName } = useConnectionStore.getState();
      expect(portName).toBeNull();
    });

    it('manufacturer is null', () => {
      const { manufacturer } = useConnectionStore.getState();
      expect(manufacturer).toBeNull();
    });
  });

  describe('setStatus', () => {
    it('can change status to connected', () => {
      const { setStatus } = useConnectionStore.getState();

      setStatus('connected');

      const { status } = useConnectionStore.getState();
      expect(status).toBe('connected');
    });

    it('can change status to disconnected', () => {
      const { setStatus } = useConnectionStore.getState();

      setStatus('connected');
      setStatus('disconnected');

      const { status } = useConnectionStore.getState();
      expect(status).toBe('disconnected');
    });

    it('does not change other state when status is changed', () => {
      const { setStatus, setConnection } = useConnectionStore.getState();

      setConnection('conn-123', '/dev/ttyUSB0', 'SIUS');
      const beforeState = useConnectionStore.getState();

      setStatus('disconnected');

      const afterState = useConnectionStore.getState();
      expect(afterState.connectionId).toBe(beforeState.connectionId);
      expect(afterState.portName).toBe(beforeState.portName);
      expect(afterState.manufacturer).toBe(beforeState.manufacturer);
    });
  });

  describe('setConnection', () => {
    it('can set connection info', () => {
      const { setConnection } = useConnectionStore.getState();

      setConnection('conn-123', '/dev/ttyUSB0', 'SIUS');

      const state = useConnectionStore.getState();
      expect(state.status).toBe('connected');
      expect(state.connectionId).toBe('conn-123');
      expect(state.portName).toBe('/dev/ttyUSB0');
      expect(state.manufacturer).toBe('SIUS');
    });

    it('can update connection info', () => {
      const { setConnection } = useConnectionStore.getState();

      setConnection('conn-123', '/dev/ttyUSB0', 'SIUS');
      setConnection('conn-456', '/dev/ttyUSB1', 'MEYTON');

      const state = useConnectionStore.getState();
      expect(state.status).toBe('connected');
      expect(state.connectionId).toBe('conn-456');
      expect(state.portName).toBe('/dev/ttyUSB1');
      expect(state.manufacturer).toBe('MEYTON');
    });

    it('automatically sets status to connected when setConnection is called', () => {
      const { setConnection, disconnect } = useConnectionStore.getState();

      disconnect();
      expect(useConnectionStore.getState().status).toBe('disconnected');

      setConnection('conn-123', '/dev/ttyUSB0', 'SIUS');

      const { status } = useConnectionStore.getState();
      expect(status).toBe('connected');
    });

    it('can set connection info without manufacturer name', () => {
      const { setConnection } = useConnectionStore.getState();

      setConnection('conn-789', '/dev/ttyUSB2', undefined);

      const state = useConnectionStore.getState();
      expect(state.status).toBe('connected');
      expect(state.connectionId).toBe('conn-789');
      expect(state.portName).toBe('/dev/ttyUSB2');
      expect(state.manufacturer).toBeNull();
    });
  });

  describe('disconnect', () => {
    it('can reset connection state', () => {
      const { setConnection, disconnect } = useConnectionStore.getState();

      // Set connection state
      setConnection('conn-123', '/dev/ttyUSB0', 'SIUS');

      // Execute disconnect
      disconnect();

      // Verify reset to initial state
      const state = useConnectionStore.getState();
      expect(state.status).toBe('disconnected');
      expect(state.connectionId).toBeNull();
      expect(state.portName).toBeNull();
      expect(state.manufacturer).toBeNull();
    });

    it('can call disconnect multiple times without issues', () => {
      const { disconnect } = useConnectionStore.getState();

      disconnect();
      disconnect();
      disconnect();

      const state = useConnectionStore.getState();
      expect(state.status).toBe('disconnected');
      expect(state.connectionId).toBeNull();
      expect(state.portName).toBeNull();
      expect(state.manufacturer).toBeNull();
    });

    it('can call disconnect when not connected without issues', () => {
      const { disconnect } = useConnectionStore.getState();

      // Execute disconnect in initial state (not connected)
      disconnect();

      const state = useConnectionStore.getState();
      expect(state.status).toBe('disconnected');
      expect(state.connectionId).toBeNull();
      expect(state.portName).toBeNull();
      expect(state.manufacturer).toBeNull();
    });
  });

  describe('integration scenarios', () => {
    it('connect -> disconnect -> reconnect flow works correctly', () => {
      const { setConnection, disconnect } = useConnectionStore.getState();

      // First connection
      setConnection('conn-123', '/dev/ttyUSB0', 'SIUS');

      let state = useConnectionStore.getState();
      expect(state.status).toBe('connected');
      expect(state.connectionId).toBe('conn-123');
      expect(state.portName).toBe('/dev/ttyUSB0');
      expect(state.manufacturer).toBe('SIUS');

      // Disconnect
      disconnect();

      state = useConnectionStore.getState();
      expect(state.status).toBe('disconnected');
      expect(state.connectionId).toBeNull();
      expect(state.portName).toBeNull();
      expect(state.manufacturer).toBeNull();

      // Reconnect (with different connection info)
      setConnection('conn-456', '/dev/ttyUSB1', 'MEYTON');

      state = useConnectionStore.getState();
      expect(state.status).toBe('connected');
      expect(state.connectionId).toBe('conn-456');
      expect(state.portName).toBe('/dev/ttyUSB1');
      expect(state.manufacturer).toBe('MEYTON');
    });

    it('scenario of changing only status while connected', () => {
      const { setConnection, setStatus } = useConnectionStore.getState();

      // Connect
      setConnection('conn-123', '/dev/ttyUSB0', 'SIUS');

      // Change only status (connection info is preserved)
      setStatus('disconnected');

      const state = useConnectionStore.getState();
      expect(state.status).toBe('disconnected');
      expect(state.connectionId).toBe('conn-123');
      expect(state.portName).toBe('/dev/ttyUSB0');
      expect(state.manufacturer).toBe('SIUS');
    });

    it('scenario of switching between multiple target manufacturers', () => {
      const { setConnection, disconnect } = useConnectionStore.getState();

      // Connect to SIUS target
      setConnection('conn-sius', '/dev/ttyUSB0', 'SIUS');
      expect(useConnectionStore.getState().manufacturer).toBe('SIUS');

      disconnect();

      // Connect to Meyton target
      setConnection('conn-meyton', '/dev/ttyUSB1', 'MEYTON');
      expect(useConnectionStore.getState().manufacturer).toBe('MEYTON');

      disconnect();

      // Connect to DISAG target
      setConnection('conn-disag', '/dev/ttyUSB2', 'DISAG');
      expect(useConnectionStore.getState().manufacturer).toBe('DISAG');
    });
  });

  describe('type safety', () => {
    it('ConnectionStatus only accepts "connected" or "disconnected"', () => {
      const { setStatus } = useConnectionStore.getState();

      // Checked at TypeScript compile time,
      // this is a type definition verification, not a runtime test
      const validStatuses: ConnectionStatus[] = ['connected', 'disconnected'];

      validStatuses.forEach((status) => {
        setStatus(status);
        const { status: currentStatus } = useConnectionStore.getState();
        expect(currentStatus).toBe(status);
      });
    });

    it('setConnection parameters have correct types', () => {
      const { setConnection } = useConnectionStore.getState();

      // Type-checked at TypeScript compile time
      setConnection('conn-123', '/dev/ttyUSB0', 'SIUS');

      const state = useConnectionStore.getState();
      expect(typeof state.connectionId).toBe('string');
      expect(typeof state.portName).toBe('string');
      expect(typeof state.manufacturer).toBe('string');
    });

    it('handles null and undefined values correctly', () => {
      const { disconnect } = useConnectionStore.getState();

      disconnect();

      const state = useConnectionStore.getState();
      expect(state.connectionId).toBeNull();
      expect(state.portName).toBeNull();
      expect(state.manufacturer).toBeNull();
    });
  });

  describe('immutability', () => {
    it('previous state object is not mutated when state is changed via setConnection', () => {
      const { setConnection } = useConnectionStore.getState();

      const stateBefore = useConnectionStore.getState();

      setConnection('conn-123', '/dev/ttyUSB0', 'SIUS');

      const stateAfter = useConnectionStore.getState();

      // Verify object references differ (immutability)
      expect(stateAfter).not.toBe(stateBefore);
      expect(stateBefore.status).toBe('disconnected');
      expect(stateAfter.status).toBe('connected');
    });

    it('previous state object is not mutated when state is changed via disconnect', () => {
      const { setConnection, disconnect } = useConnectionStore.getState();

      setConnection('conn-123', '/dev/ttyUSB0', 'SIUS');
      const stateBefore = useConnectionStore.getState();

      disconnect();

      const stateAfter = useConnectionStore.getState();

      // Verify object references differ (immutability)
      expect(stateAfter).not.toBe(stateBefore);
      expect(stateBefore.status).toBe('connected');
      expect(stateAfter.status).toBe('disconnected');
    });
  });

  describe('edge cases', () => {
    it('can set empty string as connection ID', () => {
      const { setConnection } = useConnectionStore.getState();

      setConnection('', '/dev/ttyUSB0', 'SIUS');

      const { connectionId } = useConnectionStore.getState();
      expect(connectionId).toBe('');
    });

    it('can set empty string as port name', () => {
      const { setConnection } = useConnectionStore.getState();

      setConnection('conn-123', '', 'SIUS');

      const { portName } = useConnectionStore.getState();
      expect(portName).toBe('');
    });

    it('can omit manufacturer name', () => {
      const { setConnection } = useConnectionStore.getState();

      setConnection('conn-123', '/dev/ttyUSB0');

      const { manufacturer } = useConnectionStore.getState();
      expect(manufacturer).toBeNull();
    });

    it('can set connection info with special characters', () => {
      const { setConnection } = useConnectionStore.getState();

      setConnection('conn-123-special-chars', '/dev/tty.usbserial-unicode', 'SIUS');

      const state = useConnectionStore.getState();
      expect(state.connectionId).toBe('conn-123-special-chars');
      expect(state.portName).toBe('/dev/tty.usbserial-unicode');
      expect(state.manufacturer).toBe('SIUS');
    });
  });
});
