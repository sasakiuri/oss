// SPDX-License-Identifier: MIT
import type { QualificationRecoveryShotPayload } from '@sasakiuri/saika-protocol/QualificationRecovery';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import { OutboxDrainer } from '@/main/modules/mqtt/application/OutboxDrainer';
import { toShotMqttEvidencePayload } from '@/main/modules/mqtt/application/ShotMqttPayloadMapper';
import type {
  IQualificationRecoveryControl,
  IQualificationRecoveryShotOutbox,
} from '@/main/modules/qualification-recovery';
import { QUALIFICATION_RECOVERY_ACQUISITION_OWNER } from '@/main/modules/qualification-recovery';
import { readMirroredLaneId } from '@/main/modules/settings/application/MirroredLaneId';
import type { ShotRecordedEvent } from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { errorMessage } from '@/shared/errors/errorMessage';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../domain/IMqttClientService';

export class QualificationRecoveryShotPublisher {
  private readonly drainer: OutboxDrainer<QualificationRecoveryShotPayload>;

  constructor(
    mqttClient: IMqttClientService,
    eventBus: IEventBus,
    private readonly storage: ILocalStorage,
    private readonly control: Pick<IQualificationRecoveryControl, 'get'>,
    private readonly outbox: IQualificationRecoveryShotOutbox,
  ) {
    eventBus.on('ShotRecorded', (event) => {
      void this.capture(event).catch((error: unknown) => {
        getLogger().error('[QualificationRecoveryShotPublisher] Failed to capture recovery shot', 'mqtt', {
          error: errorMessage(error),
          shotId: event.shot.id,
        });
      });
    });
    this.drainer = new OutboxDrainer(mqttClient, eventBus, {
      findPending: () => outbox.findPending(),
      toMessage: (payload) => ({
        topic: mqttTopics.qualificationRecoveryShot(payload.competitionId, payload.laneId),
        payload: JSON.stringify({ ...payload, publishedAt: new Date().toISOString() }),
      }),
      markPublished: (payload, publishedAt) => outbox.markPublished(payload.shotId, publishedAt),
      drainFailureMessage: '[QualificationRecoveryShotPublisher] Failed to drain outbox',
    });
  }

  requestDrain(): Promise<void> {
    return this.drainer.requestDrain();
  }

  private async capture(event: ShotRecordedEvent): Promise<void> {
    const context = event.acquisitionContext;
    if (context?.owner !== QUALIFICATION_RECOVERY_ACQUISITION_OWNER) return;
    const run = this.control.get(context.referenceId);
    if (!run) return;
    const laneId = readMirroredLaneId(this.storage);
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
}
