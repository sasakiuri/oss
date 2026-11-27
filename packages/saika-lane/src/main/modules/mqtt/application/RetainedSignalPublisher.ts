// SPDX-License-Identifier: MIT
import { readMirroredLaneId } from '@/main/modules/settings/application/MirroredSettings';
import { SerialQueue } from '@/main/shared-infra/operations/SerialQueue';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../domain/IMqttClientService';

/**
 * Publishes the current state of a Lane-owned signal retained on its Lane topic, one publication
 * at a time. While disconnected it publishes nothing; the reconnect republish sends the durable state.
 */
export class RetainedSignalPublisher {
  private readonly publications = new SerialQueue();

  constructor(
    private readonly mqttClient: IMqttClientService,
    private readonly storage: ILocalStorage,
    private readonly topicOf: (laneId: string) => string,
    private readonly payloadOf: (laneId: string) => object,
  ) {}

  publishCurrentState(): Promise<void> {
    return this.publications.run(() => this.publishCurrentStateNow());
  }

  private async publishCurrentStateNow(): Promise<void> {
    if (!this.mqttClient.isConnected()) return;
    const laneId = readMirroredLaneId(this.storage);
    const payload = this.payloadOf(laneId);
    await this.mqttClient.publish(this.topicOf(laneId), JSON.stringify(payload), { qos: 1, retain: true });
  }
}
