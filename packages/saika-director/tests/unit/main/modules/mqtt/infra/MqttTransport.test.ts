// SPDX-License-Identifier: MIT
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { connectMock } = vi.hoisted(() => ({ connectMock: vi.fn() }));

vi.mock('mqtt', () => ({
  default: { connect: connectMock },
}));

import { MqttTransport } from '@/main/modules/mqtt/infra/MqttTransport';

class FakeClient extends EventEmitter {
  connected = false;
  outgoing: Record<number, { volatile: boolean; cb: (error: Error) => void }> = {};
  end = vi.fn((_force: boolean, _options: object, callback: (error?: Error) => void) => callback());
  publishAsync = vi.fn().mockResolvedValue(undefined);
  subscribeAsync = vi.fn().mockResolvedValue(undefined);
}

describe('MqttTransport', () => {
  let client: FakeClient;

  beforeEach(() => {
    client = new FakeClient();
    connectMock.mockReset().mockReturnValue(client);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after the first MQTT connection', async () => {
    const transport = new MqttTransport(100);
    const connecting = transport.connect('mqtt://localhost:1883', 'director-test');

    client.connected = true;
    client.emit('connect');

    await expect(connecting).resolves.toBeUndefined();
    expect(transport.isConnected()).toBe(true);
    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'mqtt',
        hostname: 'localhost',
        port: 1883,
        clientId: 'director-test',
        connectTimeout: 100,
        resubscribe: false,
      }),
    );
  });

  it('uses the standard TLS port for mqtts URLs without an explicit port', async () => {
    const transport = new MqttTransport(100);
    const connecting = transport.connect('mqtts://broker.example', 'director-test');

    client.connected = true;
    client.emit('connect');

    await connecting;
    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'mqtts',
        hostname: 'broker.example',
        port: 8883,
      }),
    );
  });

  it('passes explicit credentials to MQTT.js without embedding them in the broker URL', async () => {
    const transport = new MqttTransport(100);
    const connecting = transport.connect('mqtt://broker.example:1883', 'director-test', {
      username: 'director',
      password: 'secret',
    });

    client.connected = true;
    client.emit('connect');

    await connecting;
    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'broker.example',
        username: 'director',
        password: 'secret',
      }),
    );
  });

  it('rejects unsupported protocols before creating a client', async () => {
    const transport = new MqttTransport(100);

    await expect(transport.connect('https://broker.example', 'director-test')).rejects.toThrow(
      'Invalid MQTT broker URL',
    );
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('rejects unsafe URL components and invalid ports before creating a client', async () => {
    const transport = new MqttTransport(100);

    await expect(transport.connect('mqtt://broker.example/topic', 'director-test')).rejects.toThrow(
      'Invalid MQTT broker URL',
    );
    await expect(transport.connect('mqtt://broker.example:0', 'director-test')).rejects.toThrow(
      'Invalid MQTT broker URL',
    );
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('force-closes and clears a client after an initial connection error', async () => {
    const transport = new MqttTransport(100);
    const connecting = transport.connect('mqtt://missing:1883', 'director-test');

    client.emit('error', new Error('connection refused'));

    await expect(connecting).rejects.toThrow('connection refused');
    expect(client.end).toHaveBeenCalledWith(true, {}, expect.any(Function));
    expect(transport.isConnected()).toBe(false);
  });

  it('times out and cleans up when the client emits no terminal event', async () => {
    vi.useFakeTimers();
    const transport = new MqttTransport(50);
    const connecting = transport.connect('mqtt://silent:1883', 'director-test');
    await Promise.all([expect(connecting).rejects.toThrow('timed out after 50ms'), vi.advanceTimersByTimeAsync(51)]);
    expect(client.end).toHaveBeenCalledWith(true, {}, expect.any(Function));
    expect(transport.isConnected()).toBe(false);
  });

  it('times out a publish when the broker never acknowledges it', async () => {
    vi.useFakeTimers();
    const transport = new MqttTransport(50);
    const connecting = transport.connect('mqtt://localhost:1883', 'director-test');
    client.connected = true;
    client.emit('connect');
    await connecting;
    client.publishAsync.mockImplementation(() => new Promise(() => {}));

    const publishing = transport.publish('saika/test', '{}', { qos: 1, retain: false });
    await Promise.all([
      expect(publishing).rejects.toThrow('MQTT publish timed out after 50ms'),
      vi.advanceTimersByTimeAsync(51),
    ]);
  });

  it('times out a subscription when the broker never acknowledges it', async () => {
    vi.useFakeTimers();
    const transport = new MqttTransport(50);
    const connecting = transport.connect('mqtt://localhost:1883', 'director-test');
    client.connected = true;
    client.emit('connect');
    await connecting;
    client.subscribeAsync.mockImplementation(() => new Promise(() => {}));

    const subscribing = transport.subscribe('saika/test', 1);
    await Promise.all([
      expect(subscribing).rejects.toThrow('MQTT subscription timed out after 50ms'),
      vi.advanceTimersByTimeAsync(51),
    ]);
  });

  it('disconnects an established client without forcing the socket', async () => {
    const transport = new MqttTransport(100);
    const connecting = transport.connect('mqtt://localhost:1883', 'director-test');
    client.connected = true;
    client.emit('connect');
    await connecting;

    await transport.disconnect();

    expect(client.end).toHaveBeenCalledWith(false, {}, expect.any(Function));
    expect(transport.isConnected()).toBe(false);
  });

  it('force-closes an established client when an unacknowledged operation remains', async () => {
    const transport = new MqttTransport(100);
    const connecting = transport.connect('mqtt://localhost:1883', 'director-test');
    client.connected = true;
    client.emit('connect');
    await connecting;
    client.outgoing[1] = { volatile: false, cb: vi.fn() };

    await transport.disconnect();

    expect(client.end).toHaveBeenCalledWith(true, {}, expect.any(Function));
    expect(transport.isConnected()).toBe(false);
  });
});
