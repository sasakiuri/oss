// SPDX-License-Identifier: MIT
import { TimedTargetStatePayloadSchema } from '@sasakiuri/saika-protocol/TimedTargetState';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import { readMirroredLaneId } from '@/main/modules/settings/application/MirroredLaneId';
import type { ITimedTargetControl, TimedTargetState } from '@/main/modules/timed-target';
import { toTimedTargetStateDto } from '@/main/modules/timed-target/toTimedTargetStateDto';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { SerialQueue } from '@/main/shared-infra/operations/SerialQueue';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../domain/IMqttClientService';

/** MQTT projection adapter for the independently persisted target schedule. */
export class TimedTargetStatePublisher {
  private readonly publications = new SerialQueue();

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
      const laneId = readMirroredLaneId(this.storage);
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
    return this.publications.run(operation);
  }

  private topic(competitionId: string, laneId: string): string {
    return mqttTopics.timedTargetState(competitionId, laneId);
  }
}
