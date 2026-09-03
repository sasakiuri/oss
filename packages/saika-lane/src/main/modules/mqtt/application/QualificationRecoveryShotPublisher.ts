// SPDX-License-Identifier: MIT
import { toShotMqttEvidencePayload } from '@/main/modules/mqtt/application/ShotMqttPayloadMapper';
import type {
  IQualificationRecoveryControl,
  IQualificationRecoveryShotOutbox,
} from '@/main/modules/qualification-recovery';
import { QUALIFICATION_RECOVERY_ACQUISITION_OWNER } from '@/main/modules/qualification-recovery';
import type { ShotRecordedEvent } from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { QualificationRecoveryShotPayload } from '@/shared/mqtt/QualificationRecovery';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../infra/IMqttClientService';

export class QualificationRecoveryShotPublisher {
  private drainTail = Promise.resolve();
  private unregisterReconnectDrain: (() => void) | null = null;

  constructor(
    private readonly mqttClient: IMqttClientService,
    eventBus: IEventBus,
    private readonly storage: ILocalStorage,
    private readonly control: Pick<IQualificationRecoveryControl, 'get'>,
    private readonly outbox: IQualificationRecoveryShotOutbox,
  ) {
    eventBus.on('ShotRecorded', (event) => {
      void this.capture(event).catch((error: unknown) => {
        getLogger().error('[QualificationRecoveryShotPublisher] Failed to capture recovery shot', 'mqtt', {
          error: error instanceof Error ? error.message : String(error),
          shotId: event.shot.id,
        });
      });
    });
    eventBus.on('MqttConnected', () => {
      this.unregisterReconnectDrain?.();
      this.unregisterReconnectDrain = mqttClient.onConnect(() => void this.requestDrain());
      void this.requestDrain();
    });
  }

  requestDrain(): Promise<void> {
    this.drainTail = this.drainTail
      .then(() => this.drain())
      .catch((error: unknown) => {
        getLogger().error('[QualificationRecoveryShotPublisher] Failed to drain outbox', 'mqtt', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return this.drainTail;
  }

  private async capture(event: ShotRecordedEvent): Promise<void> {
    const context = event.acquisitionContext;
    if (context?.owner !== QUALIFICATION_RECOVERY_ACQUISITION_OWNER) return;
    const run = this.control.get(context.referenceId);
    if (!run) return;
    const laneId = this.storage.get<string>('mqtt.laneId') ?? '';
    const shot = event.shot;
    const payload: QualificationRecoveryShotPayload = {
      schemaVersion: 1,
      laneId,
      competitionId: run.competitionId,
      runId: run.runId,
      decisionId: run.decisionId,
      interruptionId: run.interruptionId,
      phase: run.authorization.phase,
      stageIndex: run.stageIndex,
      seriesIndex: run.seriesIndex,
      shotId: shot.id,
      x: shot.impactPoint?.x ?? null,
      y: shot.impactPoint?.y ?? null,
      ...toShotMqttEvidencePayload(shot),
      innerTen: shot.innerTen,
      firedAt: shot.timestamp.toISOString(),
      publishedAt: new Date().toISOString(),
    };
    this.outbox.enqueue(payload);
    await this.requestDrain();
  }

  private async drain(): Promise<void> {
    while (this.mqttClient.isConnected()) {
      const pending = this.outbox.findPending();
      if (pending.length === 0) return;
      for (const payload of pending) {
        if (!this.mqttClient.isConnected()) return;
        await this.mqttClient.publish(
          `saika/competition/${payload.competitionId}/lane/${payload.laneId}/qualification-recovery/shot`,
          JSON.stringify({ ...payload, publishedAt: new Date().toISOString() }),
          { qos: 1, retain: false },
        );
        this.outbox.markPublished(payload.shotId, new Date());
      }
    }
  }
}
