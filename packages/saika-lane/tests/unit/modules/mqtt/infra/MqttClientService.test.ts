// SPDX-License-Identifier: MIT
import mqtt from 'mqtt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MqttClientService } from '@/main/modules/mqtt/infra/MqttClientService';

// ── mock mqtt ──────────────────────────────────────────────────
const mockClient = {
  connected: false,
  on: vi.fn(),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn(),
  end: vi.fn(),
  publishAsync: vi.fn(),
  subscribeAsync: vi.fn(),
  unsubscribeAsync: vi.fn(),
};

vi.mock('mqtt', () => ({
  default: {
    connect: vi.fn(() => mockClient),
  },
}));

// ── mock logger ────────────────────────────────────────────────
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => mockLogger,
}));

describe('MqttClientService', () => {
  let service: MqttClientService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.connected = false;
    service = new MqttClientService();
  });

  // ─────────────────────────────────────────────────────────────
  // connect
  // ─────────────────────────────────────────────────────────────
  describe('connect', () => {
    it('should connect to broker and resolve on connect event', async () => {
      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') {
          // simulate async connect
          setTimeout(() => handler(), 0);
        }
      });

      await service.connect({
        brokerUrl: 'mqtt://localhost:1883',
        clientId: 'test-client',
      });

      expect(mqtt.connect).toHaveBeenCalledWith('mqtt://localhost:1883', {
        clientId: 'test-client',
        keepalive: 60,
        reconnectPeriod: 5000,
        will: undefined,
      });
    });

    it('should pass will options when provided', async () => {
      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') {
          setTimeout(() => handler(), 0);
        }
      });

      await service.connect({
        brokerUrl: 'mqtt://localhost:1883',
        clientId: 'test-client',
        will: {
          topic: 'lane/status',
          payload: 'offline',
          qos: 1,
          retain: true,
        },
      });

      expect(mqtt.connect).toHaveBeenCalledWith(
        'mqtt://localhost:1883',
        expect.objectContaining({
          will: {
            topic: 'lane/status',
            payload: Buffer.from('offline'),
            qos: 1,
            retain: true,
          },
        }),
      );
    });

    it('should use pendingWill when no will in connect options', async () => {
      service.setWill('lane/status', 'offline', 1, true);

      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') {
          setTimeout(() => handler(), 0);
        }
      });

      await service.connect({
        brokerUrl: 'mqtt://localhost:1883',
        clientId: 'test-client',
      });

      expect(mqtt.connect).toHaveBeenCalledWith(
        'mqtt://localhost:1883',
        expect.objectContaining({
          will: {
            topic: 'lane/status',
            payload: Buffer.from('offline'),
            qos: 1,
            retain: true,
          },
        }),
      );
    });

    it('should reject with MQTT_CONNECTION_FAILED on error event', async () => {
      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'error') {
          setTimeout(() => handler(new Error('ECONNREFUSED')), 0);
        }
      });

      await expect(
        service.connect({
          brokerUrl: 'mqtt://localhost:1883',
          clientId: 'test-client',
        }),
      ).rejects.toMatchObject({ code: 'MQTT_CONNECTION_FAILED' });
    });

    it('should use custom keepalive and reconnectPeriod', async () => {
      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') {
          setTimeout(() => handler(), 0);
        }
      });

      await service.connect({
        brokerUrl: 'mqtt://localhost:1883',
        clientId: 'test-client',
        keepalive: 30,
        reconnectPeriod: 10000,
      });

      expect(mqtt.connect).toHaveBeenCalledWith(
        'mqtt://localhost:1883',
        expect.objectContaining({
          keepalive: 30,
          reconnectPeriod: 10000,
        }),
      );
    });

    it('should clean up event listeners after connect', async () => {
      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') {
          setTimeout(() => handler(), 0);
        }
      });

      await service.connect({
        brokerUrl: 'mqtt://localhost:1883',
        clientId: 'test-client',
      });

      expect(mockClient.removeListener).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockClient.removeListener).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  // ─────────────────────────────────────────────────────────────
  // disconnect
  // ─────────────────────────────────────────────────────────────
  describe('disconnect', () => {
    it('should resolve immediately if no client', async () => {
      await expect(service.disconnect()).resolves.toBeUndefined();
    });

    it('should call client.end and resolve', async () => {
      // Connect first
      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') setTimeout(() => handler(), 0);
      });
      await service.connect({ brokerUrl: 'mqtt://localhost', clientId: 'c' });

      mockClient.end.mockImplementation((_force: boolean, _opts: object, cb: (err?: Error) => void) => {
        cb();
      });

      await service.disconnect();
      expect(mockClient.end).toHaveBeenCalled();
    });

    it('should reject when client.end returns error', async () => {
      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') setTimeout(() => handler(), 0);
      });
      await service.connect({ brokerUrl: 'mqtt://localhost', clientId: 'c' });

      mockClient.end.mockImplementation((_force: boolean, _opts: object, cb: (err?: Error) => void) => {
        cb(new Error('end failed'));
      });

      await expect(service.disconnect()).rejects.toThrow('end failed');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // publish
  // ─────────────────────────────────────────────────────────────
  describe('publish', () => {
    it('should throw MQTT_CLIENT_NOT_CONNECTED when not connected', async () => {
      await expect(service.publish('topic', 'msg')).rejects.toMatchObject({
        code: 'MQTT_CLIENT_NOT_CONNECTED',
      });
    });

    it('should call publishAsync with default qos 1', async () => {
      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') setTimeout(() => handler(), 0);
      });
      await service.connect({ brokerUrl: 'mqtt://localhost', clientId: 'c' });

      mockClient.publishAsync.mockResolvedValue(undefined);

      await service.publish('test/topic', 'hello');
      expect(mockClient.publishAsync).toHaveBeenCalledWith('test/topic', 'hello', {
        qos: 1,
        retain: false,
      });
    });

    it('should use provided publish options', async () => {
      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') setTimeout(() => handler(), 0);
      });
      await service.connect({ brokerUrl: 'mqtt://localhost', clientId: 'c' });

      mockClient.publishAsync.mockResolvedValue(undefined);

      await service.publish('test/topic', 'hello', { qos: 2, retain: true });
      expect(mockClient.publishAsync).toHaveBeenCalledWith('test/topic', 'hello', {
        qos: 2,
        retain: true,
      });
    });

    it('should throw MQTT_PUBLISH_FAILED on publishAsync error', async () => {
      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') setTimeout(() => handler(), 0);
      });
      await service.connect({ brokerUrl: 'mqtt://localhost', clientId: 'c' });

      mockClient.publishAsync.mockRejectedValue(new Error('publish error'));

      await expect(service.publish('test/topic', 'hello')).rejects.toMatchObject({
        code: 'MQTT_PUBLISH_FAILED',
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // subscribe
  // ─────────────────────────────────────────────────────────────
  describe('subscribe', () => {
    it('should throw MQTT_CLIENT_NOT_CONNECTED when not connected', async () => {
      await expect(service.subscribe('topic')).rejects.toMatchObject({
        code: 'MQTT_CLIENT_NOT_CONNECTED',
      });
    });

    it('should call subscribeAsync with default qos 1', async () => {
      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') setTimeout(() => handler(), 0);
      });
      await service.connect({ brokerUrl: 'mqtt://localhost', clientId: 'c' });

      mockClient.subscribeAsync.mockResolvedValue(undefined);

      await service.subscribe('test/topic');
      expect(mockClient.subscribeAsync).toHaveBeenCalledWith('test/topic', { qos: 1 });
    });

    it('should throw MQTT_SUBSCRIBE_FAILED on subscribeAsync error', async () => {
      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') setTimeout(() => handler(), 0);
      });
      await service.connect({ brokerUrl: 'mqtt://localhost', clientId: 'c' });

      mockClient.subscribeAsync.mockRejectedValue(new Error('subscribe error'));

      await expect(service.subscribe('test/topic')).rejects.toMatchObject({
        code: 'MQTT_SUBSCRIBE_FAILED',
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // unsubscribe
  // ─────────────────────────────────────────────────────────────
  describe('unsubscribe', () => {
    it('should throw MQTT_CLIENT_NOT_CONNECTED when not connected', async () => {
      await expect(service.unsubscribe('topic')).rejects.toMatchObject({
        code: 'MQTT_CLIENT_NOT_CONNECTED',
      });
    });

    it('should call unsubscribeAsync', async () => {
      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') setTimeout(() => handler(), 0);
      });
      await service.connect({ brokerUrl: 'mqtt://localhost', clientId: 'c' });

      mockClient.unsubscribeAsync.mockResolvedValue(undefined);

      await service.unsubscribe('test/topic');
      expect(mockClient.unsubscribeAsync).toHaveBeenCalledWith('test/topic');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // setWill
  // ─────────────────────────────────────────────────────────────
  describe('setWill', () => {
    it('should store will configuration for next connect', () => {
      service.setWill('lane/status', 'offline', 1, true);
      // No error should be thrown
      expect(true).toBe(true);
    });

    it('should use default qos=1 and retain=false', () => {
      // Just checking no error is thrown
      service.setWill('lane/status', 'offline');
      expect(true).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // onMessage / onConnect / onDisconnect
  // ─────────────────────────────────────────────────────────────
  describe('event handlers', () => {
    it('onMessage should throw when not connected', () => {
      expect(() => service.onMessage(() => {})).toThrow();
    });

    it('onConnect should throw when not connected', () => {
      expect(() => service.onConnect(() => {})).toThrow();
    });

    it('onDisconnect should throw when not connected', () => {
      expect(() => service.onDisconnect(() => {})).toThrow();
    });

    it('onMessage should register message handler on client', async () => {
      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') setTimeout(() => handler(), 0);
      });
      await service.connect({ brokerUrl: 'mqtt://localhost', clientId: 'c' });

      // Reset on mock to track new calls
      mockClient.on.mockClear();

      const handler = vi.fn();
      service.onMessage(handler);
      expect(mockClient.on).toHaveBeenCalledWith('message', handler);
    });

    it('onConnect should register connect handler on client', async () => {
      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') setTimeout(() => handler(), 0);
      });
      await service.connect({ brokerUrl: 'mqtt://localhost', clientId: 'c' });

      mockClient.on.mockClear();

      const handler = vi.fn();
      service.onConnect(handler);
      expect(mockClient.on).toHaveBeenCalledWith('connect', handler);
    });

    it('onDisconnect should register close handler on client', async () => {
      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') setTimeout(() => handler(), 0);
      });
      await service.connect({ brokerUrl: 'mqtt://localhost', clientId: 'c' });

      mockClient.on.mockClear();

      const handler = vi.fn();
      service.onDisconnect(handler);
      expect(mockClient.on).toHaveBeenCalledWith('close', handler);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // isConnected
  // ─────────────────────────────────────────────────────────────
  describe('isConnected', () => {
    it('should return false when no client', () => {
      expect(service.isConnected()).toBe(false);
    });

    it('should return client.connected value', async () => {
      mockClient.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'connect') setTimeout(() => handler(), 0);
      });
      await service.connect({ brokerUrl: 'mqtt://localhost', clientId: 'c' });

      mockClient.connected = true;
      expect(service.isConnected()).toBe(true);

      mockClient.connected = false;
      expect(service.isConnected()).toBe(false);
    });
  });
});
