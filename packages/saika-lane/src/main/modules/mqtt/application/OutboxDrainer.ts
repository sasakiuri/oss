// SPDX-License-Identifier: MIT
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { SerialQueue } from '@/main/shared-infra/operations/SerialQueue';
import { errorMessage } from '@/shared/errors/errorMessage';

import type { IMqttClientService } from '../domain/IMqttClientService';

export interface OutboxDrainerOptions<T> {
  readonly findPending: () => readonly T[] | Promise<readonly T[]>;
  /** The topic and serialized payload published for one pending entry. */
  readonly toMessage: (entry: T) => { readonly topic: string; readonly payload: string };
  readonly markPublished: (entry: T, publishedAt: Date) => void | Promise<void>;
  /** Logged with the error when a drain fails. */
  readonly drainFailureMessage: string;
}

/**
 * Publishes a durable outbox at QoS 1 while MQTT is connected, one drain at a time. An entry is
 * acknowledged only after its publish completes, and every connection starts another drain.
 */
export class OutboxDrainer<T> {
  private readonly drains = new SerialQueue();
  private unregisterReconnectDrain: (() => void) | null = null;

  constructor(
    private readonly mqttClient: IMqttClientService,
    eventBus: IEventBus,
    private readonly options: OutboxDrainerOptions<T>,
  ) {
    // MqttClientService has no underlying client until connectMqtt succeeds.
    // Use the application-level connection event for the initial drain, then
    // attach to mqtt.js reconnects while that client is alive.
    eventBus.on('MqttConnected', () => {
      this.unregisterReconnectDrain?.();
      this.unregisterReconnectDrain = mqttClient.onConnect(() => {
        void this.requestDrain();
      });
      void this.requestDrain();
    });
  }

  requestDrain(): Promise<void> {
    return this.drains
      .run(() => this.drain())
      .catch((error: unknown) => {
        getLogger().error(this.options.drainFailureMessage, 'mqtt', { error: errorMessage(error) });
      });
  }

  private async drain(): Promise<void> {
    while (this.mqttClient.isConnected()) {
      const pending = await this.options.findPending();
      if (pending.length === 0) return;
      for (const entry of pending) {
        if (!this.mqttClient.isConnected()) return;
        const { topic, payload } = this.options.toMessage(entry);
        await this.mqttClient.publish(topic, payload, { qos: 1, retain: false });
        await this.options.markPublished(entry, new Date());
      }
    }
  }
}
