// SPDX-License-Identifier: MIT
/** Publishes raw shot events at QoS 1 without retention. */

import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type { ShotRecordedEvent } from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import { toShotMqttEvidencePayload } from './ShotMqttPayloadMapper';

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
      ...toShotMqttEvidencePayload(shot),
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
