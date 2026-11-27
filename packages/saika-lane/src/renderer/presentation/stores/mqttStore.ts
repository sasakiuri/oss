// SPDX-License-Identifier: MIT
import { create } from 'zustand';

import type { MqttStatus } from '@/shared/ipc/contracts';

interface MqttState {
  status: MqttStatus['status'];
  /** Error message (only on error) */
  error: string | null;
  isLoading: boolean;
}

interface MqttActions {
  setStatus: (status: MqttStatus['status']) => void;
  setError: (error: string | null) => void;
  setLoading: (isLoading: boolean) => void;
}

const initialState: MqttState = {
  status: 'disconnected',
  error: null,
  isLoading: false,
};

export const useMqttStore = create<MqttState & MqttActions>((set) => ({
  ...initialState,

  setStatus: (status) => {
    set({ status, error: null });
  },

  setError: (error) => {
    set({ error });
  },

  setLoading: (isLoading) => {
    set({ isLoading });
  },
}));
