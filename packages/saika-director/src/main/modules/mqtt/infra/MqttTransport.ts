// SPDX-License-Identifier: MIT
import mqtt, { type MqttClient } from 'mqtt';

import { MqttBrokerUrlSchema } from '@/shared/config/AppConfigSchema';

export type MqttMessageHandler = (topic: string, payload: Buffer) => void;

export interface MqttCredentials {
  readonly username: string;
  readonly password: string;
}

export interface IMqttTransport {
  connect(brokerUrl: string, clientId: string, credentials?: MqttCredentials): Promise<void>;
  disconnect(): Promise<void>;
  publish(topic: string, payload: string, options: { qos: 0 | 1 | 2; retain: boolean }): Promise<void>;
  subscribe(topic: string, qos: 0 | 1 | 2): Promise<void>;
  onMessage(handler: MqttMessageHandler): () => void;
  onConnected(handler: () => void): () => void;
  onDisconnected(handler: () => void): () => void;
  onError(handler: (error: Error) => void): () => void;
  isConnected(): boolean;
}

export class MqttTransport implements IMqttTransport {
  private client: MqttClient | null = null;

  constructor(private readonly operationTimeoutMs = 10_000) {}

  async connect(brokerUrl: string, clientId: string, credentials?: MqttCredentials): Promise<void> {
    if (this.client) {
      await this.disconnect();
    }

    const validatedBrokerUrl = MqttBrokerUrlSchema.safeParse(brokerUrl);
    if (!validatedBrokerUrl.success) {
      throw new Error('Invalid MQTT broker URL');
    }
    const parsedUrl = new URL(validatedBrokerUrl.data);
    const protocol = parsedUrl.protocol === 'mqtts:' ? 'mqtts' : 'mqtt';
    const hostname = parsedUrl.hostname.replace(/^\[(.*)\]$/, '$1');
    const client = mqtt.connect({
      protocol,
      hostname,
      port: parsedUrl.port ? Number(parsedUrl.port) : protocol === 'mqtts' ? 8883 : 1883,
      clientId,
      ...(credentials ? { username: credentials.username, password: credentials.password } : {}),
      clean: true,
      keepalive: 60,
      reconnectPeriod: 5_000,
      // Director rebuilds its broker-scoped snapshot before subscribing again.
      // Let DirectorMqttService own resubscription so retained replay cannot race
      // with stale in-memory state from the previous MQTT session.
      resubscribe: false,
      connectTimeout: this.operationTimeoutMs,
    });
    this.client = client;

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error(`MQTT connection timed out after ${this.operationTimeoutMs}ms`));
        }, this.operationTimeoutMs);
        const onConnect = () => {
          cleanup();
          resolve();
        };
        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };
        const cleanup = () => {
          clearTimeout(timeout);
          client.removeListener('connect', onConnect);
          client.removeListener('error', onError);
        };

        client.once('connect', onConnect);
        client.once('error', onError);
      });
    } catch (error) {
      if (this.client === client) this.client = null;
      // MQTT.js may continue reconnecting after the first connection error.
      // Keep a no-op error listener until force-close finishes to avoid an
      // unhandled EventEmitter error during cleanup.
      const swallowCleanupError = () => {};
      client.on('error', swallowCleanupError);
      await new Promise<void>((resolve) => {
        client.end(true, {}, () => resolve());
      });
      client.removeListener('error', swallowCleanupError);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const client = this.client;
    if (!client) return;

    this.client = null;
    await new Promise<void>((resolve, reject) => {
      // MQTT.js waits indefinitely for `outgoingEmpty` on a graceful close.
      // After an operation timeout, force-close any unacknowledged packets so
      // switching brokers and application shutdown cannot remain blocked.
      const force = Object.keys(client.outgoing).length > 0;
      client.end(force, {}, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async publish(topic: string, payload: string, options: { qos: 0 | 1 | 2; retain: boolean }): Promise<void> {
    const client = this.requireClient();
    await this.withTimeout(client.publishAsync(topic, payload, options), 'publish');
  }

  async subscribe(topic: string, qos: 0 | 1 | 2): Promise<void> {
    const client = this.requireClient();
    await this.withTimeout(client.subscribeAsync(topic, { qos }), 'subscription');
  }

  onMessage(handler: MqttMessageHandler): () => void {
    const client = this.requireClient();
    client.on('message', handler);
    return () => client.removeListener('message', handler);
  }

  onConnected(handler: () => void): () => void {
    const client = this.requireClient();
    client.on('connect', handler);
    return () => client.removeListener('connect', handler);
  }

  onDisconnected(handler: () => void): () => void {
    const client = this.requireClient();
    client.on('close', handler);
    return () => client.removeListener('close', handler);
  }

  onError(handler: (error: Error) => void): () => void {
    const client = this.requireClient();
    client.on('error', handler);
    return () => client.removeListener('error', handler);
  }

  isConnected(): boolean {
    return this.client?.connected ?? false;
  }

  private requireClient(): MqttClient {
    if (!this.client) {
      throw new Error('MQTT client is not connected');
    }
    return this.client;
  }

  private async withTimeout<T>(operation: Promise<T>, name: string): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            reject(new Error(`MQTT ${name} timed out after ${this.operationTimeoutMs}ms`));
          }, this.operationTimeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
