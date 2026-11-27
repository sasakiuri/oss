// SPDX-License-Identifier: MIT

import { create } from 'zustand';

import type { ConnectionStatus } from '@/shared/ipc/contracts';

interface ConnectionState {
  status: ConnectionStatus;
  /** Connection ID (null when disconnected) */
  connectionId: string | null;
  /** Selected device ID (null when not selected) */
  selectedDeviceId: string | null;
}

interface ConnectionActions {
  /**
   * Set connection information (called on connection)
   * @param connectionId - Connection ID
   * @param deviceId - Device ID (optional)
   */
  setConnection: (connectionId: string, deviceId?: string) => void;

  /**
   * Disconnect (reset state to initial values)
   */
  disconnect: () => void;
}

const initialState: ConnectionState = {
  status: 'disconnected',
  connectionId: null,
  selectedDeviceId: null,
};

export const useConnectionStore = create<ConnectionState & ConnectionActions>((set) => ({
  ...initialState,

  setConnection: (connectionId, deviceId) => {
    set({
      status: 'connected',
      connectionId,
      selectedDeviceId: deviceId ?? null,
    });
  },

  disconnect: () => {
    set(initialState);
  },
}));
