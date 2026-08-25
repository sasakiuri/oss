import { create } from 'zustand';

interface ConnectionState {
  isConnected: boolean;
  connectedChannels: number[];

  setConnected: (channels: number[]) => void;
  setDisconnected: () => void;
  addChannel: (channel: number) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  isConnected: false,
  connectedChannels: [],

  setConnected: (channels) => set({ isConnected: true, connectedChannels: channels }),
  setDisconnected: () => set({ isConnected: false, connectedChannels: [] }),
  addChannel: (channel) =>
    set((state) => ({
      connectedChannels: state.connectedChannels.includes(channel)
        ? state.connectedChannels
        : [...state.connectedChannels, channel].sort((a, b) => a - b),
      isConnected: true,
    })),
}));
