// SPDX-License-Identifier: MIT
import type { ICompetitionShootOffControl, ICompetitionShootOffShotOutbox } from '@/main/modules/competition-shoot-off';
import type { ShotRecordedEvent } from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { CompetitionShootOffShotPayload } from '@/shared/mqtt/CompetitionShootOffShot';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IMqttClientService } from '../domain/IMqttClientService';

export class CompetitionShootOffShotPublisher {
  private drainTail = Promise.resolve();
  private unregisterReconnectDrain: (() => void) | null = null;

  constructor(
    private readonly mqttClient: IMqttClientService,
    eventBus: IEventBus,
    private readonly storage: ILocalStorage,
    private readonly control: ICompetitionShootOffControl,
    private readonly outbox: ICompetitionShootOffShotOutbox,
  ) {
    this.restoreRecordedShotFromOutbox();
    eventBus.on('ShotRecorded', (event) => {
      void this.capture(event).catch((error: unknown) => {
        getLogger().error('[CompetitionShootOffShotPublisher] Failed to capture shoot-off shot', 'mqtt', {
          error: error instanceof Error ? error.message : String(error),
          shotId: event.shot.id,
        });
      });
    });
    eventBus.on('MqttConnected', () => {
      this.unregisterReconnectDrain?.();
      this.unregisterReconnectDrain = mqttClient.onConnect(() => {
        void this.requestDrain();
      });
      void this.requestDrain();
    });
  }

  private restoreRecordedShotFromOutbox(): void {
    const state = this.control.getState();
    if (!state || state.status === 'COMPLETE') return;
    const laneId = this.storage.get<string>('mqtt.laneId');
    if (!laneId) return;
    const persisted = this.outbox.findByRound(state.runId, state.iteration, laneId);
    for (const shot of persisted) {
      try {
        this.control.recordShot(state.competitionId, shot.shotId, new Date(shot.firedAt));
      } catch (error) {
        getLogger().error('[CompetitionShootOffShotPublisher] Failed to restore captured shot state', 'mqtt', {
          error: error instanceof Error ? error.message : String(error),
          shotId: shot.shotId,
        });
      }
    }
  }

  requestDrain(): Promise<void> {
    this.drainTail = this.drainTail
      .then(() => this.drain())
      .catch((error: unknown) => {
        getLogger().error('[CompetitionShootOffShotPublisher] Failed to drain outbox', 'mqtt', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return this.drainTail;
  }

  private async capture(event: ShotRecordedEvent): Promise<void> {
    const state = this.control.getState();
    if (!state || !this.control.canAcceptShot(state.competitionId, event.shot.timestamp)) return;
    const laneId = this.storage.get<string>('mqtt.laneId') ?? '';
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

  private async drain(): Promise<void> {
    while (this.mqttClient.isConnected()) {
      const pending = this.outbox.findPending();
      if (pending.length === 0) return;
      for (const payload of pending) {
        if (!this.mqttClient.isConnected()) return;
        await this.mqttClient.publish(
          `saika/competition/${payload.competitionId}/lane/${payload.laneId}/shoot-off/shot`,
          JSON.stringify({ ...payload, publishedAt: new Date().toISOString() }),
          { qos: 1, retain: false },
        );
        this.outbox.markPublished(payload.shotId, new Date());
      }
    }
  }
}
