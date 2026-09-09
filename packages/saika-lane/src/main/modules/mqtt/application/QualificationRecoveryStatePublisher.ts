// SPDX-License-Identifier: MIT
import type {
  IQualificationRecoveryControl,
  QualificationRecoveryRunRecord,
} from '@/main/modules/qualification-recovery';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { QualificationRecoveryStatePayloadSchema } from '@/shared/mqtt/QualificationRecovery';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../domain/IMqttClientService';

export class QualificationRecoveryStatePublisher {
  private publicationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly mqttClient: IMqttClientService,
    eventBus: IEventBus,
    private readonly storage: ILocalStorage,
    private readonly control: IQualificationRecoveryControl,
  ) {
    eventBus.on('QualificationRecoveryChanged', (event) => {
      void this.publish(event.state);
    });
  }

  publishCurrentState(competitionId?: string): Promise<void> {
    const state = this.control.getLatest(competitionId);
    return state ? this.publish(state) : Promise.resolve();
  }

  clear(competitionId: string, laneId: string): Promise<void> {
    return this.enqueue(() => this.mqttClient.publish(this.topic(competitionId, laneId), '', { qos: 1, retain: true }));
  }

  private publish(state: QualificationRecoveryRunRecord): Promise<void> {
    return this.enqueue(async () => {
      if (!this.mqttClient.isConnected()) return;
      const laneId = this.storage.get<string>('mqtt.laneId') ?? '';
      const payload = QualificationRecoveryStatePayloadSchema.parse({
        schemaVersion: 1,
        laneId,
        runId: state.runId,
        sequenceId: state.sequenceId,
        decisionId: state.decisionId,
        interruptionId: state.interruptionId,
        competitionId: state.competitionId,
        stageIndex: state.stageIndex,
        seriesIndex: state.seriesIndex,
        expectedMatchProgramId: state.expectedMatchProgramId,
        executionProgramId: state.executionProgramId,
        expectedSeriesShotLimit: state.expectedSeriesShotLimit,
        expectedRecordedShots: state.expectedRecordedShots,
        authorization: state.authorization,
        targetProfileId: state.targetProfileId,
        loadAt: state.loadAt.toISOString(),
        officialName: state.officialName,
        decisionRuleReference: state.decisionRuleReference,
        decidedAt: state.decidedAt.toISOString(),
        startedAt: state.startedAt.toISOString(),
        status: state.status,
        terminalReason: state.terminalReason,
        terminalAt: state.terminalAt?.toISOString() ?? null,
        shots: state.shots.map((shot) => ({
          shotId: shot.shotId,
          observationId: shot.observationId,
          firedAt: shot.firedAt.toISOString(),
          recordedAt: shot.recordedAt.toISOString(),
        })),
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
    return `saika/competition/${competitionId}/lane/${laneId}/qualification-recovery/state`;
  }
}
