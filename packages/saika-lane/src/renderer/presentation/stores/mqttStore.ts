// SPDX-License-Identifier: MIT
import { create } from 'zustand';

import type { MqttSettings, MqttStatus } from '@/shared/ipc/contracts';

interface MqttState {
  status: MqttStatus['status'];
  /** MQTT settings (null when not loaded) */
  settings: MqttSettings | null;
  /** Error message (only on error) */
  error: string | null;
  isLoading: boolean;
}

interface MqttActions {
  setStatus: (status: MqttStatus['status']) => void;
  setSettings: (settings: MqttSettings) => void;
  setError: (error: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  reset: () => void;
}

const initialState: MqttState = {
  status: 'disconnected',
  settings: null,
  error: null,
  isLoading: false,
};

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
