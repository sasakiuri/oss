// SPDX-License-Identifier: MIT
import type { ITimedTargetControl, TimedTargetState } from '@/main/modules/timed-target';
import { toTimedTargetStateDto } from '@/main/modules/timed-target/toTimedTargetStateDto';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { TimedTargetStatePayloadSchema } from '@/shared/mqtt/TimedTargetState';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../infra/IMqttClientService';

/** MQTT projection adapter for the independently persisted target schedule. */
export class TimedTargetStatePublisher {
  private publicationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly mqttClient: IMqttClientService,
    eventBus: IEventBus,
    private readonly storage: ILocalStorage,
    private readonly control: ITimedTargetControl,
  ) {
    eventBus.on('TimedTargetSequenceChanged', (event) => {
      void this.publish(event.state);
    });
  }

  publishCurrentState(competitionId?: string): Promise<void> {
    const state = this.control.getState(competitionId);
    return state ? this.publish(state) : Promise.resolve();
  }

  clear(competitionId: string, laneId: string): Promise<void> {
    return this.enqueue(() => this.mqttClient.publish(this.topic(competitionId, laneId), '', { qos: 1, retain: true }));
  }

  private publish(state: TimedTargetState): Promise<void> {
    return this.enqueue(async () => {
      if (!this.mqttClient.isConnected()) return;
      const laneId = this.storage.get<string>('mqtt.laneId') ?? '';
      const payload = TimedTargetStatePayloadSchema.parse({
        ...toTimedTargetStateDto(state),
        schemaVersion: 1,
        laneId,
        enforcementMode: this.control.enforcementMode,
        publishedAt: new Date().toISOString(),
      });
      await this.mqttClient.publish(this.topic(state.competitionId, laneId), JSON.stringify(payload), {
        qos: 1,
        retain: true,
      });
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const publication = this.publicationQueue.then(operation);
    this.publicationQueue = publication.catch(() => undefined);
    return publication;
  }

  private topic(competitionId: string, laneId: string): string {
    return `saika/competition/${competitionId}/lane/${laneId}/timed-target/state`;
  }
}
