// SPDX-License-Identifier: MIT

import { create } from 'zustand';

import type { ConnectionStatus, TargetManufacturer } from '@/shared/ipc/contracts';

interface ConnectionState {
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

interface ConnectionActions {
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

  setSelectedDeviceId: (deviceId: string | null) => void;

  /**
   * Disconnect (reset state to initial values)
   */
  disconnect: () => void;
}

const initialState: ConnectionState = {
  status: 'disconnected',
  connectionId: null,
  portName: null,
  manufacturer: null,
  selectedDeviceId: null,
};

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
