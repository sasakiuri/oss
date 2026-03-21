// SPDX-License-Identifier: MIT
/**
 * MqttClientService
 *
 * @description
 * mqtt.js wrapper. Implements IMqttClientService and
 * provides connection, Publish, and Subscribe with the MQTT broker.
 */

import mqtt from 'mqtt';

import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { IMqttClientService, MqttConnectOptions, MqttPublishOptions } from './IMqttClientService';

/**
 * Masks the userinfo (username:password) portion of an MQTT broker URL.
 * Returns the URL with credentials replaced by `***`, or unchanged if no userinfo is present.
 *
 * @example
 * sanitizeBrokerUrl('mqtt://broker.example.com:1883')
 * // => 'mqtt://broker.example.com:1883'
 */
export function sanitizeBrokerUrl(brokerUrl: string): string {
  // Use regex directly because 'mqtt'/'mqtts' are non-special URL schemes,
  // so the WHATWG URL parser may not extract username/password correctly.
  return brokerUrl.replace(/^(mqtts?:\/\/)[^@/]+@/, '$1***@');
}

export class MqttClientService implements IMqttClientService {
  private client: mqtt.MqttClient | null = null;
  private pendingWill: {
    topic: string;
    payload: string;
    qos: 0 | 1 | 2;
    retain: boolean;
  } | null = null;

  connect(options: MqttConnectOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const logger = getLogger();
      const sanitizedUrl = sanitizeBrokerUrl(options.brokerUrl);

      const willOption = options.will ?? this.pendingWill ?? undefined;

      try {
        this.client = mqtt.connect(options.brokerUrl, {
          clientId: options.clientId,
          keepalive: options.keepalive ?? 60,
          reconnectPeriod: options.reconnectPeriod ?? 5000,
          will: willOption
            ? {
                topic: willOption.topic,
                payload: Buffer.from(willOption.payload),
                qos: willOption.qos,
                retain: willOption.retain,
              }
            : undefined,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        reject(ErrorCatalog.createError('MQTT_CONNECTION_FAILED', { brokerUrl: sanitizedUrl }, error));
        return;
      }

      const client = this.client;

      const onConnect = () => {
        cleanup();
        logger.info(`[MQTT] Connected to ${sanitizedUrl}`);
        resolve();
      };

      const onError = (err: Error) => {
        cleanup();
        reject(ErrorCatalog.createError('MQTT_CONNECTION_FAILED', { brokerUrl: sanitizedUrl }, err));
      };

      const cleanup = () => {
        client.removeListener('connect', onConnect);
        client.removeListener('error', onError);
      };

      client.on('connect', onConnect);
      client.on('error', onError);
    });
  }

  disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        resolve();
        return;
      }

      const client = this.client;
      client.removeAllListeners();
      client.end(false, {}, (err) => {
        if (err) {
          reject(err);
          return;
        }
        this.client = null;
        getLogger().info('[MQTT] Disconnected');
        resolve();
      });
    });
  }

  async publish(topic: string, payload: string, options?: MqttPublishOptions): Promise<void> {
    if (!this.client) {
      throw ErrorCatalog.createError('MQTT_CLIENT_NOT_CONNECTED');
    }

    try {
      await this.client.publishAsync(topic, payload, {
        qos: options?.qos ?? 1,
        retain: options?.retain ?? false,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw ErrorCatalog.createError('MQTT_PUBLISH_FAILED', { topic }, error);
    }
  }

  async subscribe(topic: string, qos: 0 | 1 | 2 = 1): Promise<void> {
    if (!this.client) {
      throw ErrorCatalog.createError('MQTT_CLIENT_NOT_CONNECTED');
    }

    try {
      await this.client.subscribeAsync(topic, { qos });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw ErrorCatalog.createError('MQTT_SUBSCRIBE_FAILED', { topic }, error);
    }
  }

  async unsubscribe(topic: string): Promise<void> {
    if (!this.client) {
      throw ErrorCatalog.createError('MQTT_CLIENT_NOT_CONNECTED');
    }

    await this.client.unsubscribeAsync(topic);
  }

  setWill(topic: string, payload: string, qos: 0 | 1 | 2 = 1, retain: boolean = false): void {
    this.pendingWill = { topic, payload, qos, retain };
  }

  onMessage(handler: (topic: string, payload: Buffer) => void): () => void {
    if (!this.client) {
      throw ErrorCatalog.createError('MQTT_CLIENT_NOT_CONNECTED');
    }
    this.client.on('message', handler);
    return () => {
      this.client?.removeListener('message', handler);
    };
  }

  onConnect(handler: () => void): () => void {
    if (!this.client) {
      throw ErrorCatalog.createError('MQTT_CLIENT_NOT_CONNECTED');
    }
    this.client.on('connect', handler);
    return () => {
      this.client?.removeListener('connect', handler);
    };
  }

  onDisconnect(handler: () => void): () => void {
    if (!this.client) {
      throw ErrorCatalog.createError('MQTT_CLIENT_NOT_CONNECTED');
    }
    this.client.on('close', handler);
    return () => {
      this.client?.removeListener('close', handler);
    };
  }

  isConnected(): boolean {
    return this.client?.connected ?? false;
  }
}
