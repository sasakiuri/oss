// SPDX-License-Identifier: MIT
/**
 * Connection management store
 *
 * @description
 * Target connection state management using Zustand.
 * - Connection status (connected / disconnected)
 * - Connection ID
 * - Serial port name
 * - Target manufacturer
 * - Selected device ID
 */

import { create } from 'zustand';

import type { ConnectionStatus, TargetManufacturer } from '@/shared/ipc/contracts';

/**
 * Connection store state
 */
interface ConnectionState {
  /** Connection status */
  status: ConnectionStatus;
  /** Connection ID (null when disconnected) */
  connectionId: string | null;
  /** Serial port name (null when disconnected) */
  portName: string | null;
  /** Target manufacturer name (null when disconnected) */
  manufacturer: TargetManufacturer | null;
  /** Selected device ID (null when not selected) */
  selectedDeviceId: string | null;
}

/**
 * Connection store actions
 */
interface ConnectionActions {
  /**
   * Set connection status
   * @param status - Connection status (connected | disconnected)
   */
  setStatus: (status: ConnectionStatus) => void;

  /**
   * Set connection information (called on connection)
   * @param connectionId - Connection ID
   * @param portName - Serial port name (null if not specified)
   * @param manufacturer - Target manufacturer name (optional)
   * @param deviceId - Device ID (optional)
   */
  setConnection: (
    connectionId: string,
    portName: string | null,
    manufacturer?: TargetManufacturer,
    deviceId?: string,
  ) => void;

  /**
   * Set selected device ID
   * @param deviceId - Device ID (null when not selected)
   */
  setSelectedDeviceId: (deviceId: string | null) => void;

  /**
   * Disconnect (reset state to initial values)
   */
  disconnect: () => void;
}

/**
 * Initial state of the connection store
 */
const initialState: ConnectionState = {
  status: 'disconnected',
  connectionId: null,
  portName: null,
  manufacturer: null,
  selectedDeviceId: null,
};

/**
 * Connection management store
 *
 * @example
 * ```typescript
 * const { status, setConnection, setSelectedDeviceId, disconnect } = useConnectionStore();
 *
 * // Set device ID
 * setSelectedDeviceId('device-123');
 *
 * // Connect (including device ID)
 * setConnection('conn-123', '/dev/ttyUSB0', 'SIUS', 'device-123');
 *
 * // Disconnect (selectedDeviceId is also cleared)
 * disconnect();
 *
 * // Change status only
 * setStatus('disconnected');
 * ```
 */
export const useConnectionStore = create<ConnectionState & ConnectionActions>((set) => ({
  ...initialState,

  setStatus: (status) => {
    set({ status });
  },

  setConnection: (connectionId, portName, manufacturer, deviceId) => {
    set({
      status: 'connected',
      connectionId,
      portName,
      manufacturer: manufacturer ?? null,
      selectedDeviceId: deviceId ?? null,
    });
  },

  setSelectedDeviceId: (deviceId) => {
    set({ selectedDeviceId: deviceId });
  },

  disconnect: () => {
    set(initialState);
  },
}));
