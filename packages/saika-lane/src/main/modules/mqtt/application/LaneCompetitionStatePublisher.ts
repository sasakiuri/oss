// SPDX-License-Identifier: MIT
/** Publishes persisted competition progress, converting internal phases through PhaseMapper. */

import type { LaneCompetitionStatePayload } from '@sasakiuri/saika-protocol/LaneState';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { LaneInterruptionRecord } from '@/main/modules/competition-interruption';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import { mapToLanePhase } from '@/main/modules/mqtt/domain/PhaseMapper';
import { readMirroredLaneId } from '@/main/modules/settings/application/MirroredLaneId';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { SerialQueue } from '@/main/shared-infra/operations/SerialQueue';
import { errorMessage } from '@/shared/errors/errorMessage';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

export class LaneCompetitionStatePublisher {
  private readonly mqttClient: IMqttClientService;
  private readonly storage: ILocalStorage;
  private readonly competitionRepository: ICompetitionRepository;
  private readonly publications = new SerialQueue();

  constructor(
    mqttClient: IMqttClientService,
    eventBus: IEventBus,
    storage: ILocalStorage,
    competitionRepository: ICompetitionRepository,
    private readonly getInterruption: (competitionId: string) => LaneInterruptionRecord | null = () => null,
    private readonly canPublish: () => boolean = () => true,
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
    eventBus.on('CompetitionProgressChanged', publishEventState);
    eventBus.on('CompetitionStarted', publishEventState);
    eventBus.on('CompetitionFinished', publishEventState);
    eventBus.on('CompetitionInterruptionChanged', publishEventState);
  }

  publishCurrentState(competitionId?: string, finalSnapshotCommandId?: string): Promise<void> {
    return this.publications.run(() => this.publishStateInternal(competitionId, finalSnapshotCommandId));
  }

  private async publishStateInternal(competitionId?: string, finalSnapshotCommandId?: string): Promise<void> {
    if (!this.mqttClient.isConnected() || !this.canPublish()) return;

    const competition = competitionId
      ? await this.competitionRepository.findById(competitionId)
      : await this.competitionRepository.findActive();
    if (!competition) return;

    const laneId = readMirroredLaneId(this.storage);
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
    } satisfies LaneCompetitionStatePayload);

    const topic = mqttTopics.laneCompetitionState(competition.id, laneId);

    await this.mqttClient.publish(topic, payload, { qos: 1, retain: true });
  }

  private logPublishError(error: unknown): void {
    const logger = getLogger();
    logger.error('[LaneCompetitionStatePublisher] Failed to publish state', 'mqtt', {
      error: errorMessage(error),
    });
  }
}

function toInterruptionPayload(
  record: LaneInterruptionRecord | null,
): Pick<LaneCompetitionStatePayload, 'interruption'> {
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
