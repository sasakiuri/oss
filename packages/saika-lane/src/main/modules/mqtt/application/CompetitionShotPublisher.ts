// SPDX-License-Identifier: MIT
/**
 * CompetitionShotPublisher
 *
 * @description
 * Subscribes to the ShotRecorded event from EventBus and
 * publishes CompetitionShotPayload to `saika/competition/{competitionId}/lane/{laneId}/shot`.
 * Shot data with competition context. QoS 1, Retain=OFF.
 */

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type { ShotRecordedEvent } from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

export class CompetitionShotPublisher {
  private readonly mqttClient: IMqttClientService;
  private readonly storage: ILocalStorage;
  private readonly competitionRepository: ICompetitionRepository;

  constructor(
    mqttClient: IMqttClientService,
    eventBus: IEventBus,
    storage: ILocalStorage,
    competitionRepository: ICompetitionRepository,
  ) {
    this.mqttClient = mqttClient;
    this.storage = storage;
    this.competitionRepository = competitionRepository;

    eventBus.on('ShotRecorded', (event: ShotRecordedEvent) => {
      this.publishShot(event);
    });
  }

  private async publishShot(event: ShotRecordedEvent): Promise<void> {
    if (!this.mqttClient.isConnected()) return;

    const competition = await this.competitionRepository.findActive();
    if (!competition) return;

    const laneId = this.storage.get<string>('mqtt.laneId') ?? '';
    const shot = event.shot;
    const currentStage = competition.config.stages[competition.currentStageIndex];
    if (!currentStage) return;

    const isRecorded = shot.mode.value === 'MATCH' && currentStage.scored;

    const payload = JSON.stringify({
      laneId,
      shotId: shot.id,
      x: shot.impactPoint?.x ?? null,
      y: shot.impactPoint?.y ?? null,
      rawScoreX10: shot.score.value,
      innerTen: shot.innerTen,
      mode: shot.mode.value,
      timestamp: shot.timestamp.toISOString(),

      // Competition context
      competitionId: competition.id,
      sessionId: competition.sessionId,
      stageIndex: competition.currentStageIndex,
      scored: currentStage.scored,
      seriesIndex: competition.currentSeriesIndex,
      shotNumberInSeries: shot.shotNumber,
      isRecorded,
      isReplay: false,
      publishedAt: new Date().toISOString(),
    });

    const topic = `saika/competition/${competition.id}/lane/${laneId}/shot`;

    this.mqttClient.publish(topic, payload, { qos: 1, retain: false }).catch((err: unknown) => {
      const logger = getLogger();
      logger.error('[CompetitionShotPublisher] Failed to publish shot', 'mqtt', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}
