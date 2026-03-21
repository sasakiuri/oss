// SPDX-License-Identifier: MIT
/**
 * RawShotPublisher
 *
 * @description
 * Subscribes to the ShotRecorded event from EventBus and
 * publishes RawShotPayload to `saika/lane/{laneId}/hardware/shot`.
 * QoS 1, Retain OFF (shots are events, not the latest state).
 */

import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type { ShotRecordedEvent } from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

export class RawShotPublisher {
  private readonly mqttClient: IMqttClientService;
  private readonly storage: ILocalStorage;

  constructor(mqttClient: IMqttClientService, eventBus: IEventBus, storage: ILocalStorage) {
    this.mqttClient = mqttClient;
    this.storage = storage;

    eventBus.on('ShotRecorded', (event: ShotRecordedEvent) => {
      this.publishShot(event);
    });
  }

  private publishShot(event: ShotRecordedEvent): void {
    if (!this.mqttClient.isConnected()) {
      return;
    }

    const laneId = this.storage.get<string>('mqtt.laneId') ?? '';
    const shot = event.shot;

    const payload = JSON.stringify({
      laneId,
      shotId: shot.id,
      x: shot.impactPoint?.x ?? null,
      y: shot.impactPoint?.y ?? null,
      rawScoreX10: shot.score.value,
      innerTen: shot.innerTen,
      mode: shot.mode.value,
      timestamp: shot.timestamp.toISOString(),
    });

    const topic = `saika/lane/${laneId}/hardware/shot`;

    this.mqttClient.publish(topic, payload, { qos: 1, retain: false }).catch((err: unknown) => {
      const logger = getLogger();
      logger.error('[RawShotPublisher] Failed to publish shot', 'mqtt', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}
