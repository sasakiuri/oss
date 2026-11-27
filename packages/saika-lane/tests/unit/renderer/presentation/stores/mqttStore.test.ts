// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it } from 'vitest';

import { useMqttStore } from '@/renderer/presentation/stores/mqttStore';

describe('mqttStore', () => {
  beforeEach(() => {
    const { reset } = useMqttStore.getState();
    reset();
  });

  describe('initial state', () => {
    it('status is disconnected', () => {
      expect(useMqttStore.getState().status).toBe('disconnected');
    });

    it('settings is null', () => {
      expect(useMqttStore.getState().settings).toBeNull();
    });

    it('error is null', () => {
      expect(useMqttStore.getState().error).toBeNull();
    });

    it('isLoading is false', () => {
      expect(useMqttStore.getState().isLoading).toBe(false);
    });
  });

  describe('setStatus', () => {
    it('can change status to connected', () => {
      useMqttStore.getState().setStatus('connected');
      expect(useMqttStore.getState().status).toBe('connected');
    });

    it('can change status to connecting', () => {
      useMqttStore.getState().setStatus('connecting');
      expect(useMqttStore.getState().status).toBe('connecting');
    });

    it('clears error when status changes', () => {
      useMqttStore.getState().setError('some error');
      useMqttStore.getState().setStatus('connected');
      expect(useMqttStore.getState().error).toBeNull();
    });
  });

  describe('setSettings', () => {
    it('can save settings', () => {
      const settings = {
        enabled: true,
        brokerUrl: 'mqtt://localhost:1883',
        laneAlias: 'Lane 1',
        autoConnect: true,
        laneId: 'uuid-1',
      };
      useMqttStore.getState().setSettings(settings);
      expect(useMqttStore.getState().settings).toEqual(settings);
    });
  });

  describe('setError', () => {
    it('can set error', () => {
      useMqttStore.getState().setError('Connection failed');
      expect(useMqttStore.getState().error).toBe('Connection failed');
    });

    it('can clear error', () => {
      useMqttStore.getState().setError('Connection failed');
      useMqttStore.getState().setError(null);
      expect(useMqttStore.getState().error).toBeNull();
    });
  });

  describe('setLoading', () => {
    it('can set loading state', () => {
      useMqttStore.getState().setLoading(true);
      expect(useMqttStore.getState().isLoading).toBe(true);
    });

    it('can clear loading state', () => {
      useMqttStore.getState().setLoading(true);
      useMqttStore.getState().setLoading(false);
      expect(useMqttStore.getState().isLoading).toBe(false);
    });
  });

  describe('reset', () => {
    it('resets all state to initial values', () => {
      useMqttStore.getState().setStatus('connected');
      useMqttStore.getState().setSettings({
        enabled: true,
        brokerUrl: 'mqtt://localhost',
        laneAlias: '',
        autoConnect: false,
        laneId: 'uuid',
      });
      useMqttStore.getState().setError('error');
      useMqttStore.getState().setLoading(true);

      useMqttStore.getState().reset();

      const state = useMqttStore.getState();
      expect(state.status).toBe('disconnected');
      expect(state.settings).toBeNull();
      expect(state.error).toBeNull();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('immutability', () => {
    it('previous state object is not mutated by setStatus', () => {
      const before = useMqttStore.getState();
      useMqttStore.getState().setStatus('connected');
      const after = useMqttStore.getState();

      expect(after).not.toBe(before);
      expect(before.status).toBe('disconnected');
      expect(after.status).toBe('connected');
    });
  });
});
