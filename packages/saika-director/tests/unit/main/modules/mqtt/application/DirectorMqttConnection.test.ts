// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DirectorMqttConnection } from '@/main/modules/mqtt/application/DirectorMqttConnection';
import { directorSubscriptions } from '@/shared/mqtt';

import { FakeMqttTransport } from '../../../../../helpers/FakeMqttTransport';

function setup() {
  const transport = new FakeMqttTransport();
  const callbacks = {
    onMessage: vi.fn(),
    onSessionReset: vi.fn(),
    onDisconnecting: vi.fn(),
    onReady: vi.fn(),
    onStateChanged: vi.fn(),
    onError: vi.fn(),
    onDebugLog: vi.fn(),
  };
  const connection = new DirectorMqttConnection(
    transport,
    { directorId: 'director', resubscribeRetryMs: 50 },
    callbacks,
  );
  return { transport, callbacks, connection };
}

describe('DirectorMqttConnection', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('becomes ready after all subscriptions, reuses the session, and sanitizes connection logs', async () => {
    const { transport, callbacks, connection } = setup();
    let release!: () => void;
    transport.subscribeBarrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const brokerUrl = 'mqtt://operator:password@localhost:1883';
    const connecting = connection.connect(brokerUrl);
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.isConnected()).toBe(false);
    expect(() => connection.assertConnected()).toThrow('MQTT client is not connected');
    release();
    await connecting;
    expect(transport.subscriptions).toEqual(directorSubscriptions);
    expect(connection.isConnected()).toBe(true);
    expect(connection.brokerUrl).toBe(brokerUrl);
    expect(callbacks.onReady).toHaveBeenCalledOnce();
    expect(callbacks.onDebugLog).toHaveBeenCalledWith('Connected to mqtt://***@localhost:1883');
    await connection.connect(brokerUrl);
    expect(transport.connectCalls).toBe(1);
    await connection.disconnect();
  });

  it('rolls back a failed initial subscription and allows a fresh connection', async () => {
    const { transport, callbacks, connection } = setup();
    transport.subscribeError = new Error('subscription failed');
    await expect(connection.connect('mqtt://localhost')).rejects.toThrow('subscription failed');
    expect(connection.brokerUrl).toBeNull();
    expect(connection.isConnected()).toBe(false);
    expect(callbacks.onSessionReset).toHaveBeenCalledTimes(2);
    transport.emitMessage('topic', {});
    expect(callbacks.onMessage).not.toHaveBeenCalled();
    transport.subscribeError = null;
    await connection.connect('mqtt://localhost');
    expect(connection.isConnected()).toBe(true);
    await connection.disconnect();
  });

  it('retries failed reconnect subscriptions without repeatedly reporting the same outage', async () => {
    const { transport, callbacks, connection } = setup();
    await connection.connect('mqtt://localhost');
    transport.emitDisconnected();
    transport.subscribeError = new Error('subscription failed');
    transport.emitConnected();
    await vi.advanceTimersByTimeAsync(100);
    expect(connection.isConnected()).toBe(false);
    expect(callbacks.onError).toHaveBeenCalledOnce();
    transport.subscribeError = null;
    await vi.advanceTimersByTimeAsync(50);
    expect(connection.isConnected()).toBe(true);
    expect(callbacks.onReady).toHaveBeenCalledTimes(2);
    await connection.disconnect();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores completion of an obsolete reconnect after disconnecting', async () => {
    const { transport, callbacks, connection } = setup();
    await connection.connect('mqtt://localhost');
    let release!: () => void;
    transport.subscribeBarrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    transport.emitDisconnected();
    transport.emitConnected();
    await connection.disconnect();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.isConnected()).toBe(false);
    expect(callbacks.onReady).toHaveBeenCalledOnce();
    expect(callbacks.onDisconnecting).toHaveBeenCalledOnce();
    transport.emitMessage('topic', {});
    expect(callbacks.onMessage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('invalidates readiness and removes listeners even when graceful disconnect fails', async () => {
    const { transport, callbacks, connection } = setup();
    await connection.connect('mqtt://localhost');
    transport.disconnectError = new Error('close failed');
    await expect(connection.disconnect()).rejects.toThrow('close failed');
    transport.emitConnected();
    transport.emitMessage('topic', {});
    expect(connection.isConnected()).toBe(false);
    expect(callbacks.onMessage).not.toHaveBeenCalled();
    transport.disconnectError = null;
    await connection.connect('mqtt://localhost');
    expect(transport.connectCalls).toBe(2);
    transport.emitMessage('topic', { message: 'once' });
    expect(callbacks.onMessage).toHaveBeenCalledOnce();
    await connection.disconnect();
  });
});
