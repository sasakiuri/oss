// SPDX-License-Identifier: MIT

import type { LaneSafetyStatePayload } from '@sasakiuri/saika-protocol/LaneState';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import { toLaneSafetyStateDto, type ILaneSafetyStopControl } from '@/main/modules/safety-stop';
import { readMirroredLaneId } from '@/main/modules/settings/application/MirroredSettings';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { SerialQueue } from '@/main/shared-infra/operations/SerialQueue';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../domain/IMqttClientService';

/** Publishes the durable safety latch independently of competition membership. */
export class LaneSafetyStatePublisher {
  private readonly publications = new SerialQueue();

  constructor(
    private readonly mqttClient: IMqttClientService,
    eventBus: IEventBus,
    private readonly storage: ILocalStorage,
    private readonly safetyStopControl: ILaneSafetyStopControl,
  ) {
    eventBus.on('SafetyStopChanged', () => {
      void this.publishCurrentState();
    });
  }

  publishCurrentState(): Promise<void> {
    return this.publications.run(() => this.publishCurrentStateNow());
  }

  private async publishCurrentStateNow(): Promise<void> {
    if (!this.mqttClient.isConnected()) return;
    const laneId = readMirroredLaneId(this.storage);
    const payload = {
      laneId,
      ...toLaneSafetyStateDto(this.safetyStopControl.getState()),
      publishedAt: new Date().toISOString(),
    } satisfies LaneSafetyStatePayload;
    await this.mqttClient.publish(mqttTopics.laneSafetyState(laneId), JSON.stringify(payload), {
      qos: 1,
      retain: true,
    });
  }
}
