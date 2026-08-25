// SPDX-License-Identifier: MIT
/**
 * LaneScorePublisher
 *
 * @description
 * Subscribes to ShotRecorded (match shots only) and SessionReset from EventBus and
 * publishes LaneScorePayload to `saika/competition/{competitionId}/lane/{laneId}/score`.
 * Retrieves the latest score via QueryBus and publishes it. Retain=ON, QoS 1.
 */

import { GetSessionScoreToken, GetShotHistoryToken } from '@/main/composition/tokens';
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
  private publicationQueue: Promise<void> = Promise.resolve();

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
      void this.publishCurrentScore().catch((error: unknown) => this.logPublishError(error));
    });
    eventBus.on('SessionReset', () => {
      void this.publishCurrentScore().catch((error: unknown) => this.logPublishError(error));
    });
  }

  /**
   * Publishes the current score (for re-publishing Retain topics on reconnect).
   */
  publishCurrentScore(competitionId?: string, finalSnapshotCommandId?: string): Promise<void> {
    const publication = this.publicationQueue.then(() =>
      this.publishScoreInternal(competitionId, finalSnapshotCommandId),
    );
    // Keep later publications usable after a transient failure while returning
    // the original rejection to the caller that requested this publication.
    this.publicationQueue = publication.catch(() => undefined);
    return publication;
  }

  private async publishScoreInternal(competitionId?: string, finalSnapshotCommandId?: string): Promise<void> {
    if (!this.mqttClient.isConnected()) return;

    const competition = competitionId
      ? await this.competitionRepository.findById(competitionId)
      : await this.competitionRepository.findActive();
    if (!competition) return;

    const laneId = this.storage.get<string>('mqtt.laneId') ?? '';

    // Get current score via QueryBus
    const [scoreDto, shotHistory] = await Promise.all([
      this.queryBus.execute(GetSessionScoreToken, {
        sessionId: competition.sessionId,
      }),
      this.queryBus.execute(GetShotHistoryToken, {
        sessionId: competition.sessionId,
      }),
    ]);

    const payload = JSON.stringify({
      competitionId: competition.id,
      laneId,
      sessionId: competition.sessionId,
      totalScoreX10: scoreDto.totalScore,
      totalShotCount: scoreDto.shotCount,
      acc: competition.config.acc,
      stages: this.buildStages(scoreDto.seriesScores, shotHistory.shots, competition),
      ...(finalSnapshotCommandId ? { finalSnapshotCommandId } : {}),
      publishedAt: new Date().toISOString(),
    });

    const topic = `saika/competition/${competition.id}/lane/${laneId}/score`;

    await this.mqttClient.publish(topic, payload, { qos: 1, retain: true });
  }

  private logPublishError(error: unknown): void {
    const logger = getLogger();
    logger.error('[LaneScorePublisher] Failed to publish score', 'mqtt', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  private buildStages(
    seriesScores: number[],
    shots: readonly {
      shotNumber: number;
      seriesNumber?: number;
      score: number;
      mode: string;
      isRecorded: boolean;
    }[],
    competition: {
      config: { stages: readonly { name: string; scored: boolean; series: readonly { maxShots: number }[] }[] };
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
        const seriesNumber = seriesOffset + serIdx + 1;
        const seriesShots = shots
          .filter((shot) => shot.mode === 'MATCH' && shot.isRecorded && shot.seriesNumber === seriesNumber)
          .sort((a, b) => a.shotNumber - b.shotNumber);
        const maxShots = stage.series[serIdx]?.maxShots ?? 0;
        stageTotalX10 += seriesScoreX10;

        seriesData.push({
          seriesIndex: serIdx,
          shots: seriesShots.map((shot) => shot.score),
          seriesTotalX10: seriesScoreX10,
          isComplete: maxShots > 0 && seriesShots.length >= maxShots,
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
