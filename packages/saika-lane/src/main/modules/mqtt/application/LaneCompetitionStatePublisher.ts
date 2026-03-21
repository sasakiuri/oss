// SPDX-License-Identifier: MIT
/**
 * LaneCompetitionStatePublisher
 *
 * @description
 * Subscribes to the PhaseChanged / StageAdvanced / SeriesCompleted / CompetitionStarted / CompetitionFinished events from EventBus and
 * publishes LaneCompetitionStatePayload to `saika/competition/{competitionId}/lane/{laneId}/state`.
 * Converts internal Phase → MqttLanePhase using PhaseMapper.
 */

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { mapToLanePhase } from '@/main/modules/mqtt/domain/PhaseMapper';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

export class LaneCompetitionStatePublisher {
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

    eventBus.on('PhaseChanged', () => this.publishCurrentState());
    eventBus.on('StageAdvanced', () => this.publishCurrentState());
    eventBus.on('SeriesCompleted', () => this.publishCurrentState());
    eventBus.on('CompetitionStarted', () => this.publishCurrentState());
    eventBus.on('CompetitionFinished', () => this.publishCurrentState());
  }

  async publishCurrentState(): Promise<void> {
    if (!this.mqttClient.isConnected()) return;

    const competition = await this.competitionRepository.findActive();
    if (!competition) return;

    const laneId = this.storage.get<string>('mqtt.laneId') ?? '';
    const currentStage = competition.config.stages[competition.currentStageIndex];
    if (!currentStage) return;

    const currentSeries = currentStage.series[competition.currentSeriesIndex];

    const phase = mapToLanePhase(competition.phase, {
      scored: currentStage.scored,
      isCompetitionFinished: competition.phase === 'FINISHED',
      isConnected: true,
    });

    const payload = JSON.stringify({
      competitionId: competition.id,
      laneId,
      sessionId: competition.sessionId,
      phase,
      currentStage: {
        index: competition.currentStageIndex,
        name: currentStage.name,
        scored: currentStage.scored,
        totalSeries: currentStage.series.length,
      },
      currentSeries: {
        index: competition.currentSeriesIndex,
        shotsRecorded: competition.seriesShotCount,
        maxShots: currentSeries?.maxShots ?? 0,
      },
      publishedAt: new Date().toISOString(),
    });

    const topic = `saika/competition/${competition.id}/lane/${laneId}/state`;

    this.mqttClient.publish(topic, payload, { qos: 1, retain: true }).catch((err: unknown) => {
      const logger = getLogger();
      logger.error('[LaneCompetitionStatePublisher] Failed to publish state', 'mqtt', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}
