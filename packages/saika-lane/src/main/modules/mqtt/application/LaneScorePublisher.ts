// SPDX-License-Identifier: MIT
/**
 * LaneScorePublisher
 *
 * Subscribes to ShotRecorded (match shots only) and SessionReset from EventBus and
 * publishes LaneScorePayload to `saika/competition/{competitionId}/lane/{laneId}/score`.
 * Builds the score from one persisted session snapshot. Retain=ON, QoS 1.
 */

import { projectShotResult, type ShotResultProjectionCapability } from '@sasakiuri/saika-rules';

import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { Shot } from '@/main/modules/session/domain/Shot';
import type { ShotRecordedEvent } from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import { resolveCompetitionShotPlacement } from './ShotCompetitionPlacement';

export class LaneScorePublisher {
  private readonly mqttClient: IMqttClientService;
  private readonly storage: ILocalStorage;
  private readonly competitionRepository: ICompetitionRepository;
  private readonly sessionRepository: ISessionRepository;
  private publicationQueue: Promise<void> = Promise.resolve();

  constructor(
    mqttClient: IMqttClientService,
    eventBus: IEventBus,
    storage: ILocalStorage,
    competitionRepository: ICompetitionRepository,
    sessionRepository: ISessionRepository,
  ) {
    this.mqttClient = mqttClient;
    this.storage = storage;
    this.competitionRepository = competitionRepository;
    this.sessionRepository = sessionRepository;

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

    const session = await this.sessionRepository.findById(competition.sessionId);
    if (!session) throw new Error(`Session ${competition.sessionId} is unavailable for score publication`);
    const projection = competition.config.resultProjection;
    const builtScore = this.buildStages(session.allShots, competition, projection);
    const payload = JSON.stringify({
      competitionId: competition.id,
      laneId,
      sessionId: competition.sessionId,
      totalScoreX10: builtScore.totalScoreX10,
      totalShotCount: builtScore.totalShotCount,
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
    shots: readonly Shot[],
    competition: CompetitionState,
    projection: ShotResultProjectionCapability | undefined,
  ): { stages: unknown[]; totalScoreX10: number; totalShotCount: number; sourceTotalScoreX10?: number } {
    const matchShots = shots.filter((shot) => shot.mode.isMatch());
    const placements = matchShots.map((shot) => ({
      shot,
      placement: resolveCompetitionShotPlacement(shot, shots, competition),
    }));
    const stages: unknown[] = [];
    let totalScoreX10 = 0;
    let totalShotCount = 0;
    let sourceTotalScoreX10 = 0;

    for (const [stageIndex, stage] of competition.config.stages.entries()) {
      if (!stage.scored) continue;
      const seriesData: unknown[] = [];
      let stageTotalX10 = 0;
      let sourceStageTotalX10 = 0;
      for (const [seriesIndex, series] of stage.series.entries()) {
        if (series.maxShots === 0 || series.purpose === 'POSITION_CHANGE_AND_SIGHTING') continue;
        const seriesShots = placements
          .filter(({ placement }) => placement.stageIndex === stageIndex && placement.seriesIndex === seriesIndex)
          .sort((left, right) => left.shot.shotNumber - right.shot.shotNumber);
        const sourceShotsX10 = seriesShots.map(({ shot }) => shot.score.value);
        const resultShotsX10 = projection
          ? sourceShotsX10.map((score) => projectShotResult(projection, score).resultScoreX10)
          : sourceShotsX10;
        const seriesTotalX10 = resultShotsX10.reduce((sum, score) => sum + score, 0);
        const sourceSeriesTotalX10 = sourceShotsX10.reduce((sum, score) => sum + score, 0);
        stageTotalX10 += seriesTotalX10;
        sourceStageTotalX10 += sourceSeriesTotalX10;
        totalShotCount += seriesShots.length;
        seriesData.push({
          seriesIndex,
          shots: resultShotsX10,
          seriesTotalX10,
          isComplete: seriesShots.length >= series.maxShots,
          ...(projection ? { sourceShotsX10, sourceSeriesTotalX10 } : {}),
        });
      }
      stages.push({
        stageIndex,
        stageName: stage.name,
        stageTotalX10,
        series: seriesData,
        ...(projection ? { sourceStageTotalX10 } : {}),
      });
      totalScoreX10 += stageTotalX10;
      sourceTotalScoreX10 += sourceStageTotalX10;
    }
    if (totalShotCount !== matchShots.length) throw new Error('MATCH history contains shots outside scored series');
    return { stages, totalScoreX10, totalShotCount, ...(projection ? { sourceTotalScoreX10 } : {}) };
  }
}
