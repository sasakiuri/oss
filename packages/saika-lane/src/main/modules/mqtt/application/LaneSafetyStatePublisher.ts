// SPDX-License-Identifier: MIT

import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import type { ILaneSafetyStopControl } from '@/main/modules/safety-stop';
import { readMirroredLaneId } from '@/main/modules/settings/application/MirroredLaneId';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../domain/IMqttClientService';

/** Publishes the durable safety latch independently of competition membership. */
export class LaneSafetyStatePublisher {
  private publicationQueue: Promise<void> = Promise.resolve();

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
    const publication = this.publicationQueue.then(() => this.publishCurrentStateNow());
    this.publicationQueue = publication.catch(() => undefined);
    return publication;
  }

  private async publishCurrentStateNow(): Promise<void> {
    if (!this.mqttClient.isConnected()) return;
    const laneId = readMirroredLaneId(this.storage);
    const state = this.safetyStopControl.getState();
    const payload = {
      laneId,
      status: state?.status ?? 'CLEAR',
      safetyStopId: state?.safetyStopId ?? null,
      reason: state?.reason ?? null,
      stoppedBy: state?.stoppedBy ?? null,
      stoppedAt: state?.stoppedAt.toISOString() ?? null,
      timerSnapshot: state?.timerSnapshot
        ? {
            competitionId: state.timerSnapshot.competitionId,
            remainingSeconds: state.timerSnapshot.remainingSeconds,
            totalSeconds: state.timerSnapshot.totalSeconds,
            frozenAt: state.timerSnapshot.frozenAt.toISOString(),
          }
        : null,
      clearedBy: state?.clearedBy ?? null,
      clearanceReason: state?.clearanceReason ?? null,
      clearedAt: state?.clearedAt?.toISOString() ?? null,
      publishedAt: new Date().toISOString(),
    };
    await this.mqttClient.publish(mqttTopics.laneSafetyState(laneId), JSON.stringify(payload), {
      qos: 1,
      retain: true,
    });
  }
}
