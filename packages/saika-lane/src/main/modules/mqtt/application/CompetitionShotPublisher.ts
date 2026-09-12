// SPDX-License-Identifier: MIT
/**
 * CompetitionShotPublisher
 *
 * Subscribes to the ShotRecorded event from EventBus and
 * publishes CompetitionShotPayload to `saika/competition/{competitionId}/lane/{laneId}/shot`.
 * Shot data with competition context. QoS 1, Retain=OFF.
 */

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionShootOffControl } from '@/main/modules/competition-shoot-off';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { ShotRecordedEvent } from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import { resolveCompetitionShotPlacement } from './ShotCompetitionPlacement';
import { toShotMqttEvidencePayload } from './ShotMqttPayloadMapper';

export class CompetitionShotPublisher {
  private readonly mqttClient: IMqttClientService;
  private readonly storage: ILocalStorage;
  private readonly competitionRepository: ICompetitionRepository;
  private readonly sessionRepository: ISessionRepository;

  constructor(
    mqttClient: IMqttClientService,
    eventBus: IEventBus,
    storage: ILocalStorage,
    competitionRepository: ICompetitionRepository,
    sessionRepository: ISessionRepository,
    private readonly shootOffControl?: Pick<ICompetitionShootOffControl, 'getState' | 'canAcceptShot'>,
  ) {
    this.mqttClient = mqttClient;
    this.storage = storage;
    this.competitionRepository = competitionRepository;
    this.sessionRepository = sessionRepository;

    eventBus.on('ShotRecorded', (event: ShotRecordedEvent) => {
      void this.publishShot(event).catch((error: unknown) => {
        getLogger().error('[CompetitionShotPublisher] Failed to publish shot', 'mqtt', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });
  }

  private async publishShot(event: ShotRecordedEvent): Promise<void> {
    if (!this.mqttClient.isConnected()) return;

    // An independent workflow owns this evidence and is responsible for its
    // dedicated transport. Raw hardware evidence remains available separately.
    if (event.acquisitionContext?.shotDisposition === 'ISOLATED') return;

    const competition = await this.competitionRepository.findActive();
    if (!competition) return;

    // The dedicated shoot-off publisher owns this observation. Suppressing it
    // here prevents a tie-break shot from appearing in MATCH evidence or firing-
    // window detection while keeping the normal publisher otherwise unchanged.
    const shootOff = this.shootOffControl?.getState();
    if (
      shootOff?.competitionId === competition.id &&
      (shootOff.recordedShotIds.includes(event.shot.id) ||
        this.shootOffControl?.canAcceptShot(competition.id, event.shot.timestamp))
    ) {
      return;
    }

    const laneId = this.storage.get<string>('mqtt.laneId') ?? '';
    const shot = event.shot;
    const session = await this.sessionRepository.findById(event.aggregateId);
    if (!session) throw new Error(`Session ${event.aggregateId} is unavailable for shot publication`);
    const placement = resolveCompetitionShotPlacement(shot, session.allShots, competition);
    const shotStage = competition.config.stages[placement.stageIndex]!;

    const isRecorded = shot.mode.value === 'MATCH' && shotStage.scored;

    const payload = JSON.stringify({
      laneId,
      shotId: shot.id,
      x: shot.impactPoint?.x ?? null,
      y: shot.impactPoint?.y ?? null,
      ...toShotMqttEvidencePayload(shot),
      innerTen: shot.innerTen,
      mode: shot.mode.value,
      timestamp: shot.timestamp.toISOString(),

      // Competition context
      competitionId: competition.id,
      sessionId: event.aggregateId,
      stageIndex: placement.stageIndex,
      scored: shotStage.scored,
      seriesIndex: placement.seriesIndex,
      shotNumberInSeries: placement.shotNumberInSeries,
      isRecorded,
      isReplay: false,
      publishedAt: new Date().toISOString(),
    });

    const topic = `saika/competition/${competition.id}/lane/${laneId}/shot`;

    await this.mqttClient.publish(topic, payload, { qos: 1, retain: false });
  }
}
