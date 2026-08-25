// SPDX-License-Identifier: MIT
/**
 * HardwareStatePublisher
 *
 * @description
 * Subscribes to the ConnectionEstablished / ConnectionLost events from EventBus and
 * publishes HardwareStatePayload to `saika/lane/{laneId}/hardware/state`.
 * Also implements a heartbeat at 60-second intervals.
 */

import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type { ConnectionEstablishedEvent, ConnectionLostEvent } from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

interface HardwareState {
  status: 'connected' | 'disconnected' | 'offline';
  manufacturer?: string;
  portPath?: string;
  connectionId?: string;
}

export class HardwareStatePublisher {
  private readonly mqttClient: IMqttClientService;
  private readonly storage: ILocalStorage;
  private readonly appVersion: string;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private currentState: HardwareState = { status: 'disconnected' };
  private publishingEnabled = true;
  private runtimeLaneAlias: string | null = null;

  constructor(mqttClient: IMqttClientService, eventBus: IEventBus, storage: ILocalStorage, appVersion: string) {
    this.mqttClient = mqttClient;
    this.storage = storage;
    this.appVersion = appVersion;

    eventBus.on('ConnectionEstablished', (event: ConnectionEstablishedEvent) => {
      this.currentState = {
        status: 'connected',
        manufacturer: event.manufacturer.value,
        portPath: event.portPath,
        connectionId: event.aggregateId,
      };
      this.publishState();
    });

    eventBus.on('ConnectionLost', (_event: ConnectionLostEvent) => {
      this.currentState = { status: 'disconnected' };
      this.publishState();
    });
  }

  private getTopic(): string {
    const laneId = this.storage.get<string>('mqtt.laneId');
    return `saika/lane/${laneId}/hardware/state`;
  }

  private getLaneId(): string {
    return this.storage.get<string>('mqtt.laneId') ?? '';
  }

  private getLaneAlias(): string {
    if (this.runtimeLaneAlias !== null) return this.runtimeLaneAlias;
    const settings = this.storage.get<{ laneAlias?: string }>('mqtt.settings');
    return settings?.laneAlias ?? '';
  }

  setRuntimeLaneAlias(laneAlias: string | null): void {
    this.runtimeLaneAlias = laneAlias;
  }

  private buildPayload(connection: HardwareState = this.currentState): string {
    return JSON.stringify({
      laneId: this.getLaneId(),
      laneAlias: this.getLaneAlias(),
      connection,
      appVersion: this.appVersion,
      publishedAt: new Date().toISOString(),
    });
  }

  publishState(): void {
    if (!this.publishingEnabled || !this.mqttClient.isConnected()) {
      return;
    }

    const topic = this.getTopic();
    const payload = this.buildPayload();

    this.mqttClient.publish(topic, payload, { qos: 1, retain: true }).catch((err: unknown) => {
      const logger = getLogger();
      logger.error('[HardwareStatePublisher] Failed to publish state', 'mqtt', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  async publishOfflineState(): Promise<void> {
    this.publishingEnabled = false;
    if (!this.mqttClient.isConnected()) return;

    try {
      await this.mqttClient.publish(this.getTopic(), this.buildPayload({ status: 'offline' }), {
        qos: 1,
        retain: true,
      });
    } catch (error) {
      this.publishingEnabled = true;
      throw error;
    }
  }

  resumePublishing(): void {
    this.publishingEnabled = true;
  }

  startHeartbeat(intervalMs: number = 60_000): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.publishState();
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  getWillTopic(): string {
    return this.getTopic();
  }

  getWillPayload(): string {
    return JSON.stringify({
      laneId: this.getLaneId(),
      laneAlias: this.getLaneAlias(),
      connection: { status: 'offline' },
      appVersion: this.appVersion,
      publishedAt: new Date().toISOString(),
    });
  }
}
