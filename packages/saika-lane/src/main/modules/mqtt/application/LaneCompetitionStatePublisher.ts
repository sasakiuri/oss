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
import type { LaneInterruptionRecord } from '@/main/modules/competition-interruption';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import { mapToLanePhase } from '@/main/modules/mqtt/domain/PhaseMapper';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

export class LaneCompetitionStatePublisher {
  private readonly mqttClient: IMqttClientService;
  private readonly storage: ILocalStorage;
  private readonly competitionRepository: ICompetitionRepository;
  private publicationQueue: Promise<void> = Promise.resolve();

  constructor(
    mqttClient: IMqttClientService,
    eventBus: IEventBus,
    storage: ILocalStorage,
    competitionRepository: ICompetitionRepository,
    private readonly getInterruption: (competitionId: string) => LaneInterruptionRecord | null = () => null,
  ) {
    this.mqttClient = mqttClient;
    this.storage = storage;
    this.competitionRepository = competitionRepository;

    const publishEventState = (event: { aggregateId: string }): void => {
      void this.publishCurrentState(event.aggregateId).catch((error: unknown) => this.logPublishError(error));
    };
    eventBus.on('PhaseChanged', publishEventState);
    eventBus.on('StageAdvanced', publishEventState);
    eventBus.on('SeriesCompleted', publishEventState);
    eventBus.on('CompetitionStarted', publishEventState);
    eventBus.on('CompetitionFinished', publishEventState);
    eventBus.on('CompetitionInterruptionChanged', publishEventState);
  }

  publishCurrentState(competitionId?: string, finalSnapshotCommandId?: string): Promise<void> {
    const publication = this.publicationQueue.then(() =>
      this.publishStateInternal(competitionId, finalSnapshotCommandId),
    );
    this.publicationQueue = publication.catch(() => undefined);
    return publication;
  }

  private async publishStateInternal(competitionId?: string, finalSnapshotCommandId?: string): Promise<void> {
    if (!this.mqttClient.isConnected()) return;

    const competition = competitionId
      ? await this.competitionRepository.findById(competitionId)
      : await this.competitionRepository.findActive();
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
      awaitingSeriesStart: competition.phase === 'STAGE_ENTERED' || competition.phase === 'SERIES_ENTERED',
      ...toInterruptionPayload(this.getInterruption(competition.id)),
      ...(finalSnapshotCommandId ? { finalSnapshotCommandId } : {}),
      publishedAt: new Date().toISOString(),
    });

    const topic = `saika/competition/${competition.id}/lane/${laneId}/state`;

    await this.mqttClient.publish(topic, payload, { qos: 1, retain: true });
  }

  private logPublishError(error: unknown): void {
    const logger = getLogger();
    logger.error('[LaneCompetitionStatePublisher] Failed to publish state', 'mqtt', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function toInterruptionPayload(record: LaneInterruptionRecord | null): Record<string, unknown> {
  if (!record) return {};
  return {
    interruption: {
      interruptionId: record.interruptionId,
      status: record.status,
      pausedAt: record.pausedAt.toISOString(),
      capturedAt: record.capturedAt.toISOString(),
      capturedRemainingSeconds: record.capturedRemainingSeconds,
      capturedTotalSeconds: record.capturedTotalSeconds,
      resumeAt: record.resumeAt?.toISOString() ?? null,
      authorizedRemainingSeconds: record.authorizedRemainingSeconds,
      unlimitedSightingShots: record.unlimitedSightingShots,
    },
  };
}
