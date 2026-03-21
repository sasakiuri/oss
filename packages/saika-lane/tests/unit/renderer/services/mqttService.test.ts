// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mqttService } from '@/renderer/services/mqttService';
import type { ConnectMqttInput, MqttSettings, MqttStatus } from '@/shared/ipc/contracts';

// Mock window.electronAPI.mqtt
const mockMqttApi = {
  connectMqtt: vi.fn(),
  disconnectMqtt: vi.fn(),
  getMqttStatus: vi.fn(),
  saveMqttSettings: vi.fn(),
  getMqttSettings: vi.fn(),
};

Object.defineProperty(globalThis, 'window', {
  value: {
    electronAPI: {
      mqtt: mockMqttApi,
    },
  },
  writable: true,
});

describe('mqttService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('connectMqtt', () => {
    it('resolves on success', async () => {
      mockMqttApi.connectMqtt.mockResolvedValue({ success: true });

      const input: ConnectMqttInput = { brokerUrl: 'mqtt://localhost:1883' };
      await expect(mqttService.connectMqtt(input)).resolves.toBeUndefined();
      expect(mockMqttApi.connectMqtt).toHaveBeenCalledWith(input);
    });

    it('throws ServiceError on failure', async () => {
      mockMqttApi.connectMqtt.mockResolvedValue({
        success: false,
        error: { code: 'MQTT_CONNECTION_FAILED', message: 'Connection refused' },
      });

      await expect(mqttService.connectMqtt({ brokerUrl: 'mqtt://bad-host' })).rejects.toThrow('Connection refused');
    });
  });

  describe('disconnectMqtt', () => {
    it('resolves on success', async () => {
      mockMqttApi.disconnectMqtt.mockResolvedValue({ success: true });

      await expect(mqttService.disconnectMqtt()).resolves.toBeUndefined();
      expect(mockMqttApi.disconnectMqtt).toHaveBeenCalled();
    });
  });

  describe('getMqttStatus', () => {
    it('returns MqttStatus', async () => {
      const expected: MqttStatus = { status: 'connected', brokerUrl: 'mqtt://localhost', laneId: 'uuid-1' };
      mockMqttApi.getMqttStatus.mockResolvedValue({ success: true, data: expected });

      const result = await mqttService.getMqttStatus();
      expect(result).toEqual(expected);
    });
  });

  describe('saveMqttSettings', () => {
    it('resolves on success', async () => {
      mockMqttApi.saveMqttSettings.mockResolvedValue({ success: true });

      const settings: MqttSettings = {
        enabled: true,
        brokerUrl: 'mqtt://localhost:1883',
        laneAlias: 'Lane 1',
        autoConnect: true,
        laneId: 'uuid-1',
      };

      await expect(mqttService.saveMqttSettings(settings)).resolves.toBeUndefined();
      expect(mockMqttApi.saveMqttSettings).toHaveBeenCalledWith(settings);
    });
  });

  describe('getMqttSettings', () => {
    it('returns MqttSettings', async () => {
      const expected: MqttSettings = {
        enabled: false,
        brokerUrl: '',
        laneAlias: '',
        autoConnect: false,
        laneId: 'uuid-1',
      };
      mockMqttApi.getMqttSettings.mockResolvedValue({ success: true, data: expected });

      const result = await mqttService.getMqttSettings();
      expect(result).toEqual(expected);
    });
  });
});
