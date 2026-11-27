// SPDX-License-Identifier: MIT
/** Publishes recorded shots with competition context at QoS 1 without retention. */

import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionShootOffControl } from '@/main/modules/competition-shoot-off';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { readMirroredLaneId } from '@/main/modules/settings/application/MirroredSettings';
import type { ShotRecordedEvent } from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { errorMessage } from '@/shared/errors/errorMessage';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import { resolveCompetitionShotPlacement } from './ShotCompetitionPlacement';
import { toCompetitionShotPayload } from './ShotMqttPayloadMapper';

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
          error: errorMessage(error),
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

    const laneId = readMirroredLaneId(this.storage);
    const shot = event.shot;
    const session = await this.sessionRepository.findById(event.aggregateId);
    if (!session) throw new Error(`Session ${event.aggregateId} is unavailable for shot publication`);
    const placement = resolveCompetitionShotPlacement(shot, session.allShots, competition);

    const payload = JSON.stringify(
      toCompetitionShotPayload({
        laneId,
        shot,
        competitionId: competition.id,
        sessionId: event.aggregateId,
        placement,
        scored: competition.config.stages[placement.stageIndex]!.scored,
        isReplay: false,
      }),
    );

    const topic = mqttTopics.competitionShot(competition.id, laneId);

    await this.mqttClient.publish(topic, payload, { qos: 1, retain: false });
  }
}
