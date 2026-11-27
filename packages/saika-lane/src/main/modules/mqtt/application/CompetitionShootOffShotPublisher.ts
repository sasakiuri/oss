// SPDX-License-Identifier: MIT
import type { CompetitionShootOffShotPayload } from '@sasakiuri/saika-protocol/CompetitionShootOffShot';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import type { ICompetitionShootOffControl, ICompetitionShootOffShotOutbox } from '@/main/modules/competition-shoot-off';
import { OutboxDrainer } from '@/main/modules/mqtt/application/OutboxDrainer';
import { readMirroredLaneId } from '@/main/modules/settings/application/MirroredSettings';
import type { ShotRecordedEvent } from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { errorMessage } from '@/shared/errors/errorMessage';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../domain/IMqttClientService';

export class CompetitionShootOffShotPublisher {
  private readonly drainer: OutboxDrainer<CompetitionShootOffShotPayload>;

  constructor(
    mqttClient: IMqttClientService,
    eventBus: IEventBus,
    private readonly storage: ILocalStorage,
    private readonly control: ICompetitionShootOffControl,
    private readonly outbox: ICompetitionShootOffShotOutbox,
  ) {
    this.restoreRecordedShotFromOutbox();
    eventBus.on('ShotRecorded', (event) => {
      void this.capture(event).catch((error: unknown) => {
        getLogger().error('[CompetitionShootOffShotPublisher] Failed to capture shoot-off shot', 'mqtt', {
          error: errorMessage(error),
          shotId: event.shot.id,
        });
      });
    });
    this.drainer = new OutboxDrainer(mqttClient, eventBus, {
      findPending: () => outbox.findPending(),
      toMessage: (payload) => ({
        topic: mqttTopics.competitionShootOffShot(payload.competitionId, payload.laneId),
        payload: JSON.stringify({ ...payload, publishedAt: new Date().toISOString() }),
      }),
      markPublished: (payload, publishedAt) => outbox.markPublished(payload.shotId, publishedAt),
      drainFailureMessage: '[CompetitionShootOffShotPublisher] Failed to drain outbox',
    });
  }

  private restoreRecordedShotFromOutbox(): void {
    const state = this.control.getState();
    if (!state || state.status === 'COMPLETE') return;
    const laneId = readMirroredLaneId(this.storage);
    if (!laneId) return;
    const persisted = this.outbox.findByRound(state.runId, state.iteration, laneId);
    for (const shot of persisted) {
      try {
        this.control.recordShot(state.competitionId, shot.shotId, new Date(shot.firedAt));
      } catch (error) {
        getLogger().error('[CompetitionShootOffShotPublisher] Failed to restore captured shot state', 'mqtt', {
          error: errorMessage(error),
          shotId: shot.shotId,
        });
      }
    }
  }

  requestDrain(): Promise<void> {
    return this.drainer.requestDrain();
  }

  private async capture(event: ShotRecordedEvent): Promise<void> {
    const state = this.control.getState();
    if (!state || !this.control.canAcceptShot(state.competitionId, event.shot.timestamp)) return;
    const laneId = readMirroredLaneId(this.storage);
    const shot = event.shot;
    const payload: CompetitionShootOffShotPayload = {
      schemaVersion: 1,
      competitionId: state.competitionId,
      runId: state.runId,
      iteration: state.iteration,
      laneId,
      shotId: shot.id,
      x: shot.impactPoint?.x ?? null,
      y: shot.impactPoint?.y ?? null,
      effectiveScoreX10: shot.score.value,
      deviceScoreX10: shot.deviceScore?.value ?? null,
      calculatedScoreX10: shot.calculatedScore.value,
      innerTen: shot.innerTen,
      firedAt: shot.timestamp.toISOString(),
      receivedAt: shot.receivedAt.toISOString(),
      ...(shot.sourceObservationId ? { observationId: shot.sourceObservationId } : {}),
      ...(shot.targetProfileId ? { targetProfileId: shot.targetProfileId } : {}),
      ...(shot.scoringGaugeProfileId ? { scoringGaugeProfileId: shot.scoringGaugeProfileId } : {}),
      publishedAt: new Date().toISOString(),
    };
    this.outbox.enqueue(payload);
    this.control.recordShot(state.competitionId, shot.id, shot.timestamp);
    await this.requestDrain();
  }
}
