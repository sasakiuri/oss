import { describe, it, expect, beforeEach } from 'vitest';
import { useConnectionStore } from '@/renderer/presentation/stores/system/connection.store';

describe('useConnectionStore', () => {
  beforeEach(() => {
    useConnectionStore.getState().setDisconnected();
  });

  describe('initial state', () => {
    it('should have isConnected as false', () => {
      expect(useConnectionStore.getState().isConnected).toBe(false);
    });

    it('should have empty connectedChannels', () => {
      expect(useConnectionStore.getState().connectedChannels).toEqual([]);
    });
  });

  describe('setConnected', () => {
    it('should set connected with channels', () => {
      useConnectionStore.getState().setConnected([1, 2, 3]);

      const state = useConnectionStore.getState();
      expect(state.isConnected).toBe(true);
      expect(state.connectedChannels).toEqual([1, 2, 3]);
    });

    it('should replace existing channels', () => {
      useConnectionStore.getState().setConnected([1, 2]);
      useConnectionStore.getState().setConnected([3, 4, 5]);

      expect(useConnectionStore.getState().connectedChannels).toEqual([3, 4, 5]);
    });

    it('should handle empty channels while connected', () => {
      useConnectionStore.getState().setConnected([]);

      const state = useConnectionStore.getState();
      expect(state.isConnected).toBe(true);
      expect(state.connectedChannels).toEqual([]);
    });
  });

  describe('setDisconnected', () => {
    it('should set disconnected and clear channels', () => {
      useConnectionStore.getState().setConnected([1, 2, 3]);
      useConnectionStore.getState().setDisconnected();

      const state = useConnectionStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.connectedChannels).toEqual([]);
    });
  });

  describe('addChannel', () => {
    it('should add a new channel', () => {
      useConnectionStore.getState().addChannel(5);

      const state = useConnectionStore.getState();
      expect(state.connectedChannels).toEqual([5]);
      expect(state.isConnected).toBe(true);
    });

    it('should not duplicate existing channel', () => {
      useConnectionStore.getState().addChannel(3);
      useConnectionStore.getState().addChannel(3);

      expect(useConnectionStore.getState().connectedChannels).toEqual([3]);
    });

    it('should maintain sorted order', () => {
      useConnectionStore.getState().addChannel(5);
      useConnectionStore.getState().addChannel(1);
      useConnectionStore.getState().addChannel(3);

      expect(useConnectionStore.getState().connectedChannels).toEqual([1, 3, 5]);
    });

    it('should set isConnected to true', () => {
      expect(useConnectionStore.getState().isConnected).toBe(false);

      useConnectionStore.getState().addChannel(1);

      expect(useConnectionStore.getState().isConnected).toBe(true);
    });

    it('should add to existing channels', () => {
      useConnectionStore.getState().setConnected([1, 3]);
      useConnectionStore.getState().addChannel(2);

      expect(useConnectionStore.getState().connectedChannels).toEqual([1, 2, 3]);
    });
  });
});
