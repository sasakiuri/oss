// SPDX-License-Identifier: MIT

import type { IShotObservationEvidenceOutbox } from '@/main/modules/shot-observation/domain/IShotObservationEvidenceOutbox';
import type { ShotObservationEvidence } from '@/main/modules/shot-observation/domain/ShotObservationEvidence';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../infra/IMqttClientService';

/** Publishes the transactional shot-evidence outbox without affecting scoring. */
export class ShotObservationEvidencePublisher {
  private drainTail = Promise.resolve();
  private unregisterReconnectDrain: (() => void) | null = null;

  constructor(
    private readonly mqttClient: IMqttClientService,
    eventBus: IEventBus,
    private readonly storage: ILocalStorage,
    private readonly outbox: IShotObservationEvidenceOutbox,
  ) {
    eventBus.on('ShotObservationRouted', () => this.requestDrain());
    // MqttClientService has no underlying client until connectMqtt succeeds.
    // Use the application-level connection event for the initial drain, then
    // attach to mqtt.js reconnects while that client is alive.
    eventBus.on('MqttConnected', () => {
      this.unregisterReconnectDrain?.();
      this.unregisterReconnectDrain = mqttClient.onConnect(() => {
        void this.requestDrain();
      });
      void this.requestDrain();
    });
  }

  requestDrain(): Promise<void> {
    this.drainTail = this.drainTail
      .then(() => this.drain())
      .catch((error: unknown) => {
        getLogger().error('[ShotObservationEvidencePublisher] Failed to drain evidence outbox', 'mqtt', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return this.drainTail;
  }

  private async drain(): Promise<void> {
    while (this.mqttClient.isConnected()) {
      const pending = await this.outbox.findPending(100);
      if (pending.length === 0) return;
      for (const evidence of pending) {
        if (!this.mqttClient.isConnected()) return;
        await this.publish(evidence);
        await this.outbox.markPublished(evidence.evidenceId, new Date());
      }
    }
  }

  private async publish(evidence: ShotObservationEvidence): Promise<void> {
    const laneId = this.storage.get<string>('mqtt.laneId') ?? '';
    const competition = evidence.competition;
    const topic = competition
      ? `saika/competition/${competition.competitionId}/lane/${laneId}/observation`
      : `saika/lane/${laneId}/hardware/observation`;
    const payload = JSON.stringify({
      evidenceVersion: 1,
      evidenceId: evidence.evidenceId,
      observationId: evidence.observationId,
      outcomeId: evidence.outcomeId,
      laneId,
      outcome: evidence.outcome,
      x: evidence.x,
      y: evidence.y,
      deviceScoreX10: evidence.deviceScoreX10,
      firedAt: evidence.firedAt.toISOString(),
      timestampSource: evidence.timestampSource,
      receivedAt: evidence.receivedAt.toISOString(),
      reportedMode: evidence.reportedMode,
      rawFrameHex: evidence.rawFrameHex,
      decidedAt: evidence.decidedAt.toISOString(),
      sessionId: evidence.sessionId,
      detail: evidence.detail,
      competition:
        competition === null
          ? null
          : {
              competitionId: competition.competitionId,
              phase: competition.phase,
              stageIndex: competition.stageIndex,
              seriesIndex: competition.seriesIndex,
              stageScored: competition.stageScored,
            },
      publishedAt: new Date().toISOString(),
    });
    await this.mqttClient.publish(topic, payload, { qos: 1, retain: false });
  }
}
