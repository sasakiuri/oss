// SPDX-License-Identifier: MIT

import type { ILaneSafetyStopControl } from '@/main/modules/safety-stop';
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
    const laneId = this.storage.get<string>('mqtt.laneId') ?? '';
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
    await this.mqttClient.publish(`saika/lane/${laneId}/safety/state`, JSON.stringify(payload), {
      qos: 1,
      retain: true,
    });
  }
}
