// SPDX-License-Identifier: MIT
// @vitest-environment node
import Database from 'better-sqlite3';
import { connectAsync, type MqttClient } from 'mqtt';
import { createConnection, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { migration007MqttRetainedMessages } from '@/main/infrastructure/database/migrations/007_mqtt_retained_messages';
import { EmbeddedMqttBroker } from '@/main/modules/mqtt/infra/EmbeddedMqttBroker';
import { SqliteMqttRetainedMessageStore } from '@/main/modules/mqtt/infra/SqliteMqttRetainedMessageStore';

describe('EmbeddedMqttBroker', () => {
  let broker: EmbeddedMqttBroker | null = null;
  let secondBroker: EmbeddedMqttBroker | null = null;
  let socket: Socket | null = null;
  let database: Database.Database | null = null;
  const mqttClients: MqttClient[] = [];

  afterEach(async () => {
    socket?.destroy();
    await Promise.all(mqttClients.splice(0).map((client) => client.endAsync().catch(() => undefined)));
    if (secondBroker) await secondBroker.stop();
    if (broker) await broker.stop();
    database?.close();
    database = null;
  });

  it('accepts MQTT clients after asynchronous Aedes initialization', async () => {
    broker = new EmbeddedMqttBroker({ port: 0 });

    await broker.start();
    const connack = await new Promise<Buffer>((resolve, reject) => {
      socket = createConnection({ host: '127.0.0.1', port: broker!.port });
      socket.once('error', reject);
      socket.once('data', resolve);
      socket.once('connect', () => {
        // MQTT 3.1.1 CONNECT, clean session, client id "test".
        socket!.write(
          Buffer.from([
            0x10, 0x10, 0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x3c, 0x00, 0x04, 0x74, 0x65, 0x73, 0x74,
          ]),
        );
      });
    });

    expect(broker.running).toBe(true);
    expect([...connack.subarray(0, 4)]).toEqual([0x20, 0x02, 0x00, 0x00]);

    socket?.destroy();
    socket = null;
    await broker.stop();
    broker = null;
  });

  it('cleans up a failed startup and can be started again', async () => {
    broker = new EmbeddedMqttBroker({ port: 0 });
    await broker.start();
    const occupiedPort = broker.port;

    secondBroker = new EmbeddedMqttBroker({ port: occupiedPort });
    await expect(secondBroker.start()).rejects.toMatchObject({ code: 'EADDRINUSE' });
    expect(secondBroker.running).toBe(false);
    await expect(secondBroker.stop()).resolves.toBeUndefined();

    await broker.stop();
    broker = null;
    await secondBroker.start();
    expect(secondBroker.running).toBe(true);
  });

  it('restores retained messages from SQLite after the embedded broker restarts', async () => {
    database = new Database(':memory:');
    migration007MqttRetainedMessages.up(database);
    const store = new SqliteMqttRetainedMessageStore(database);
    broker = new EmbeddedMqttBroker({ port: 0 }, store);
    await broker.start();

    const topic = 'saika/competition/11111111-1111-4111-8111-111111111111/state';
    const payload = Buffer.from('{"phase":"MATCH"}');
    const publisher = await connectAsync(`mqtt://127.0.0.1:${broker.port}`, {
      clientId: 'retained-publisher',
      reconnectPeriod: 0,
    });
    mqttClients.push(publisher);
    await publisher.publishAsync(topic, payload, { qos: 1, retain: true });

    expect(database.prepare('SELECT payload, qos FROM mqtt_retained_messages WHERE topic = ?').get(topic)).toEqual({
      payload,
      qos: 1,
    });

    publisher.end(true);
    mqttClients.splice(mqttClients.indexOf(publisher), 1);
    await broker.stop();

    secondBroker = new EmbeddedMqttBroker({ port: 0 }, store);
    await secondBroker.start();
    const subscriber = await connectAsync(`mqtt://127.0.0.1:${secondBroker.port}`, {
      clientId: 'retained-subscriber',
      reconnectPeriod: 0,
    });
    mqttClients.push(subscriber);
    const restoredMessage = new Promise<{ payload: Buffer; retain: boolean }>((resolve) => {
      subscriber.once('message', (_receivedTopic, receivedPayload, packet) => {
        resolve({ payload: receivedPayload, retain: packet.retain });
      });
    });

    await subscriber.subscribeAsync(topic, { qos: 1 });

    await expect(restoredMessage).resolves.toEqual({ payload, retain: true });
  });
});
