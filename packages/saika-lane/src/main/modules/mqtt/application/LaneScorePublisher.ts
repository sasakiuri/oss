// SPDX-License-Identifier: MIT
/**
 * LaneScorePublisher
 *
 * @description
 * Subscribes to the ShotRecorded event (match shots only) from EventBus and
 * publishes LaneScorePayload to `saika/competition/{competitionId}/lane/{laneId}/score`.
 * Retrieves the latest score via QueryBus and publishes it. Retain=ON, QoS 1.
 */

import { GetSessionScoreToken } from '@/main/composition/tokens';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { ShotRecordedEvent } from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

export class LaneScorePublisher {
  private readonly mqttClient: IMqttClientService;
  private readonly storage: ILocalStorage;
  private readonly competitionRepository: ICompetitionRepository;
  private readonly queryBus: QueryBus;

  constructor(
    mqttClient: IMqttClientService,
    eventBus: IEventBus,
    storage: ILocalStorage,
    competitionRepository: ICompetitionRepository,
    queryBus: QueryBus,
  ) {
    this.mqttClient = mqttClient;
    this.storage = storage;
    this.competitionRepository = competitionRepository;
    this.queryBus = queryBus;

    eventBus.on('ShotRecorded', (event: ShotRecordedEvent) => {
      // Only publish score for MATCH shots
      if (event.shot.mode.value !== 'MATCH') return;
      this.publishScore(event);
    });
  }

  /**
   * Publishes the current score (for re-publishing Retain topics on reconnect).
   */
  async publishCurrentScore(): Promise<void> {
    return this.publishScoreInternal();
  }

  private async publishScore(_event: ShotRecordedEvent): Promise<void> {
    return this.publishScoreInternal();
  }

  private async publishScoreInternal(): Promise<void> {
    if (!this.mqttClient.isConnected()) return;

    const competition = await this.competitionRepository.findActive();
    if (!competition) return;

    const laneId = this.storage.get<string>('mqtt.laneId') ?? '';

    // Get current score via QueryBus
    const scoreDto = await this.queryBus.execute(GetSessionScoreToken, {
      sessionId: competition.sessionId,
    });

    const payload = JSON.stringify({
      competitionId: competition.id,
      laneId,
      sessionId: competition.sessionId,
      totalScoreX10: scoreDto.totalScore,
      totalShotCount: scoreDto.shotCount,
      acc: competition.config.acc,
      stages: this.buildStages(scoreDto.seriesScores, competition),
      publishedAt: new Date().toISOString(),
    });

    const topic = `saika/competition/${competition.id}/lane/${laneId}/score`;

    this.mqttClient.publish(topic, payload, { qos: 1, retain: true }).catch((err: unknown) => {
      const logger = getLogger();
      logger.error('[LaneScorePublisher] Failed to publish score', 'mqtt', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  private buildStages(
    seriesScores: number[],
    competition: {
      config: { stages: readonly { name: string; scored: boolean; series: readonly { maxShots: number }[] }[] };
      currentSeriesIndex: number;
    },
  ): unknown[] {
    const stages: unknown[] = [];
    let seriesOffset = 0;

    for (let stageIdx = 0; stageIdx < competition.config.stages.length; stageIdx++) {
      const stage = competition.config.stages[stageIdx]!;
      // Only include match stages in score
      if (!stage.scored) continue;

      const seriesData: unknown[] = [];
      let stageTotalX10 = 0;

      for (let serIdx = 0; serIdx < stage.series.length; serIdx++) {
        const seriesScore = seriesScores[seriesOffset + serIdx] ?? 0;
        const seriesScoreX10 = seriesScore;
        stageTotalX10 += seriesScoreX10;

        seriesData.push({
          seriesIndex: serIdx,
          shots: [], // Individual shot scores not available from SessionScoreDto
          seriesTotalX10: seriesScoreX10,
          isComplete: seriesOffset + serIdx < competition.currentSeriesIndex,
        });
      }

      stages.push({
        stageIndex: stageIdx,
        stageName: stage.name,
        stageTotalX10,
        series: seriesData,
      });

      seriesOffset += stage.series.length;
    }

    return stages;
  }
}
