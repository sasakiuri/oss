// SPDX-License-Identifier: MIT
/**
 * MQTT connection management store
 *
 * @description
 * MQTT connection state management using Zustand.
 * - Connection status (connected / connecting / disconnected)
 * - MQTT settings (brokerUrl, laneAlias, autoConnect, laneId)
 * - Connect/disconnect actions
 */

import { create } from 'zustand';

import type { MqttSettings, MqttStatus } from '@/shared/ipc/contracts';

/**
 * MQTT store state
 */
interface MqttState {
  /** MQTT connection status */
  status: MqttStatus['status'];
  /** MQTT settings (null when not loaded) */
  settings: MqttSettings | null;
  /** Error message (only on error) */
  error: string | null;
  /** Loading flag */
  isLoading: boolean;
}

/**
 * MQTT store actions
 */
interface MqttActions {
  /** Set connection status */
  setStatus: (status: MqttStatus['status']) => void;
  /** Set settings */
  setSettings: (settings: MqttSettings) => void;
  /** Set error */
  setError: (error: string | null) => void;
  /** Set loading state */
  setLoading: (isLoading: boolean) => void;
  /** Reset store */
  reset: () => void;
}

/**
 * Initial state of the MQTT store
 */
const initialState: MqttState = {
  status: 'disconnected',
  settings: null,
  error: null,
  isLoading: false,
};

/**
 * MQTT connection management store
 */
export const useMqttStore = create<MqttState & MqttActions>((set) => ({
  ...initialState,

  setStatus: (status) => {
    set({ status, error: null });
  },

  setSettings: (settings) => {
    set({ settings });
  },

  setError: (error) => {
    set({ error });
  },

  setLoading: (isLoading) => {
    set({ isLoading });
  },

  reset: () => {
    set(initialState);
  },
}));
