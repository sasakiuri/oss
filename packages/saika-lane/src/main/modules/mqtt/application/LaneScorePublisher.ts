// SPDX-License-Identifier: MIT
/**
 * LaneScorePublisher
 *
 * Subscribes to ShotRecorded (match shots only) and SessionReset from EventBus and
 * publishes LaneScorePayload to `saika/competition/{competitionId}/lane/{laneId}/score`.
 * Retrieves the latest score via QueryBus and publishes it. Retain=ON, QoS 1.
 */

import { projectShotResult, type ShotResultProjectionCapability } from '@sasakiuri/saika-rules';

import { GetSessionScoreToken, GetShotHistoryToken } from '@/main/composition/tokens';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
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
      if (event.acquisitionContext?.shotDisposition === 'ISOLATED') return;
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

    const projection = competition.config.resultProjection;
    const builtScore = this.buildStages(scoreDto.seriesScores, shotHistory.shots, competition, projection);
    const payload = JSON.stringify({
      competitionId: competition.id,
      laneId,
      sessionId: competition.sessionId,
      totalScoreX10: projection ? builtScore.totalScoreX10 : scoreDto.totalScore,
      totalShotCount: scoreDto.shotCount,
      acc: competition.config.acc,
      stages: builtScore.stages,
      ...(projection
        ? {
            resultProjection: projection,
            sourceTotalScoreX10: builtScore.sourceTotalScoreX10,
          }
        : {}),
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
      config: {
        stages: readonly {
          name: string;
          scored: boolean;
          series: readonly { maxShots: number; purpose?: string }[];
        }[];
      };
    },
    projection: ShotResultProjectionCapability | undefined,
  ): { stages: unknown[]; totalScoreX10: number; sourceTotalScoreX10?: number } {
    const stages: unknown[] = [];
    let seriesOffset = 0;
    let totalScoreX10 = 0;
    let sourceTotalScoreX10 = 0;

    for (let stageIdx = 0; stageIdx < competition.config.stages.length; stageIdx++) {
      const stage = competition.config.stages[stageIdx]!;
      // Only include match stages in score
      if (!stage.scored) continue;

      const seriesData: unknown[] = [];
      let stageTotalX10 = 0;
      let sourceStageTotalX10 = 0;

      for (let serIdx = 0; serIdx < stage.series.length; serIdx++) {
        const seriesConfig = stage.series[serIdx]!;
        if (seriesConfig.maxShots === 0 || seriesConfig.purpose === 'POSITION_CHANGE_AND_SIGHTING') continue;
        const scoredSeriesBefore = stage.series
          .slice(0, serIdx)
          .filter((series) => series.maxShots > 0 && series.purpose !== 'POSITION_CHANGE_AND_SIGHTING').length;
        const sourceSeriesIndex = seriesOffset + scoredSeriesBefore;
        const sourceSeriesScoreX10 = seriesScores[sourceSeriesIndex] ?? 0;
        const seriesNumber = sourceSeriesIndex + 1;
        const seriesShots = shots
          .filter((shot) => shot.mode === 'MATCH' && shot.isRecorded && shot.seriesNumber === seriesNumber)
          .sort((a, b) => a.shotNumber - b.shotNumber);
        const maxShots = seriesConfig.maxShots;
        const sourceShotsX10 = seriesShots.map((shot) => shot.score);
        const resultShotsX10 = projection
          ? sourceShotsX10.map((score) => projectShotResult(projection, score).resultScoreX10)
          : sourceShotsX10;
        const seriesScoreX10 = projection
          ? resultShotsX10.reduce((sum, score) => sum + score, 0)
          : sourceSeriesScoreX10;
        stageTotalX10 += seriesScoreX10;
        sourceStageTotalX10 += sourceShotsX10.reduce((sum, score) => sum + score, 0);

        seriesData.push({
          seriesIndex: serIdx,
          shots: resultShotsX10,
          seriesTotalX10: seriesScoreX10,
          isComplete: maxShots > 0 && seriesShots.length >= maxShots,
          ...(projection
            ? {
                sourceShotsX10,
                sourceSeriesTotalX10: sourceShotsX10.reduce((sum, score) => sum + score, 0),
              }
            : {}),
        });
      }

      stages.push({
        stageIndex: stageIdx,
        stageName: stage.name,
        stageTotalX10,
        series: seriesData,
        ...(projection ? { sourceStageTotalX10 } : {}),
      });
      totalScoreX10 += stageTotalX10;
      sourceTotalScoreX10 += sourceStageTotalX10;

      seriesOffset += stage.series.filter(
        (series) => series.maxShots > 0 && series.purpose !== 'POSITION_CHANGE_AND_SIGHTING',
      ).length;
    }

    return {
      stages,
      totalScoreX10,
      ...(projection ? { sourceTotalScoreX10 } : {}),
    };
  }
}
