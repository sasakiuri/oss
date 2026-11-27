// SPDX-License-Identifier: MIT

import type { ShotObservationEvidencePayload } from '@sasakiuri/saika-protocol/Shots';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import { OutboxDrainer } from '@/main/modules/mqtt/application/OutboxDrainer';
import { readMirroredLaneId } from '@/main/modules/settings/application/MirroredSettings';
import type { IShotObservationEvidenceOutbox } from '@/main/modules/shot-observation/domain/IShotObservationEvidenceOutbox';
import type { ShotObservationEvidence } from '@/main/modules/shot-observation/domain/ShotObservationEvidence';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../domain/IMqttClientService';

/** Publishes the transactional shot-evidence outbox without affecting scoring. */
export class ShotObservationEvidencePublisher {
  private readonly drainer: OutboxDrainer<ShotObservationEvidence>;

  constructor(
    mqttClient: IMqttClientService,
    eventBus: IEventBus,
    private readonly storage: ILocalStorage,
    outbox: IShotObservationEvidenceOutbox,
  ) {
    eventBus.on('ShotObservationRouted', () => this.requestDrain());
    this.drainer = new OutboxDrainer(mqttClient, eventBus, {
      findPending: () => outbox.findPending(100),
      toMessage: (evidence) => this.toMessage(evidence),
      markPublished: (evidence, publishedAt) => outbox.markPublished(evidence.evidenceId, publishedAt),
      drainFailureMessage: '[ShotObservationEvidencePublisher] Failed to drain evidence outbox',
    });
  }

  requestDrain(): Promise<void> {
    return this.drainer.requestDrain();
  }

  private toMessage(evidence: ShotObservationEvidence): { topic: string; payload: string } {
    const laneId = readMirroredLaneId(this.storage);
    const competition = evidence.competition;
    const topic = competition
      ? mqttTopics.competitionShotObservation(competition.competitionId, laneId)
      : mqttTopics.laneHardwareObservation(laneId);
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
    } satisfies ShotObservationEvidencePayload);
    return { topic, payload };
  }
}
