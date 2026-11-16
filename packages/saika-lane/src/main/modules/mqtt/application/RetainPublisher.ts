// SPDX-License-Identifier: MIT
/** Republishes retained state after reconnecting and marks replayed shots with isReplay=true. */

import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { Shot } from '@/main/modules/session/domain/Shot';
import { readMirroredLaneId } from '@/main/modules/settings/application/MirroredLaneId';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { EstComplaintSignalPublisher } from './EstComplaintSignalPublisher';
import type { HardwareStatePublisher } from './HardwareStatePublisher';
import type { LaneAssignmentPublisher } from './LaneAssignmentPublisher';
import type { LaneCompetitionStatePublisher } from './LaneCompetitionStatePublisher';
import type { LaneSafetyStatePublisher } from './LaneSafetyStatePublisher';
import type { LaneScorePublisher } from './LaneScorePublisher';
import type { QualificationMalfunctionSignalPublisher } from './QualificationMalfunctionSignalPublisher';
import type { QualificationRecoveryStatePublisher } from './QualificationRecoveryStatePublisher';
import type { RangeOfficerRequestPublisher } from './RangeOfficerRequestPublisher';
import { resolveCompetitionShotPlacement } from './ShotCompetitionPlacement';
import { toShotMqttEvidencePayload } from './ShotMqttPayloadMapper';
import type { TimedTargetStatePublisher } from './TimedTargetStatePublisher';

export interface RetainPublisherDeps {
  mqttClient: IMqttClientService;
  storage: ILocalStorage;
  competitionRepository: ICompetitionRepository;
  sessionRepository: ISessionRepository;
  hardwarePublisher: Pick<HardwareStatePublisher, 'publishState'>;
  competitionStatePublisher: Pick<LaneCompetitionStatePublisher, 'publishCurrentState'>;
  scorePublisher: Pick<LaneScorePublisher, 'publishCurrentScore'>;
  assignmentPublisher: Pick<LaneAssignmentPublisher, 'publishCurrentAssignment' | 'clearStoredAssignment'>;
  safetyStatePublisher: Pick<LaneSafetyStatePublisher, 'publishCurrentState'>;
  rangeOfficerRequestPublisher: Pick<RangeOfficerRequestPublisher, 'publishCurrentState'>;
  qualificationMalfunctionSignalPublisher: Pick<QualificationMalfunctionSignalPublisher, 'publishCurrentState'>;
  estComplaintSignalPublisher: Pick<EstComplaintSignalPublisher, 'publishCurrentState'>;
  timedTargetStatePublisher: Pick<TimedTargetStatePublisher, 'publishCurrentState'>;
  qualificationRecoveryStatePublisher: Pick<QualificationRecoveryStatePublisher, 'publishCurrentState'>;
  /** Shots owned by another outbox are not replayed as competition shots. */
  excludeCompetitionShotReplay: (shotId: string) => boolean;
  /** Competition-owned topics wait until Lane startup is READY. */
  canPublishCompetition: () => boolean;
}

export class RetainPublisher {
  private disconnectedAt: Date | null = new Date(0);
  private isInitialConnect = true;

  constructor(private readonly deps: RetainPublisherDeps) {}

  /**
   * Registers with MqttClientService's onConnect/onDisconnect.
   * Does not republish on the initial connection (since connectMqtt in mqtt.module publishes manually).
   */
  registerCallbacks(initialConnectionAlreadyOccurred: boolean = false): void {
    this.isInitialConnect = !initialConnectionAlreadyOccurred;
    this.deps.mqttClient.onDisconnect(() => {
      this.disconnectedAt ??= new Date();
    });

    this.deps.mqttClient.onConnect(() => {
      if (this.isInitialConnect) {
        this.isInitialConnect = false;
        return;
      }
      this.republish().catch((err: unknown) => {
        const logger = getLogger();
        logger.error('[RetainPublisher] Failed to republish on reconnect', 'mqtt', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });
  }

  /**
   * On reconnect, re-publishes all Retain topics and replays shots recorded during disconnection.
   */
  async republish(): Promise<void> {
    const logger = getLogger();
    logger.info('[RetainPublisher] Republishing retained topics on reconnect', 'mqtt');

    // 1. Re-publish hardware state
    this.deps.hardwarePublisher.publishState();

    // Safety state is Lane-owned and must survive without competition membership.
    await this.deps.safetyStatePublisher.publishCurrentState();
    if (!this.deps.canPublishCompetition()) return;
    await this.deps.rangeOfficerRequestPublisher.publishCurrentState();
    await this.deps.qualificationMalfunctionSignalPublisher.publishCurrentState();
    await this.deps.estComplaintSignalPublisher.publishCurrentState();

    // 2. Re-publish competition-related Retain topics
    const competition = await this.deps.competitionRepository.findActive();
    if (!competition) {
      this.disconnectedAt = null;
      return;
    }

    // 3. Re-publish LaneCompetitionState and LaneScore
    await Promise.all([
      this.deps.competitionStatePublisher.publishCurrentState(),
      this.deps.scorePublisher.publishCurrentScore(),
      this.deps.timedTargetStatePublisher.publishCurrentState(competition.id),
      this.deps.qualificationRecoveryStatePublisher.publishCurrentState(competition.id),
    ]);
    await this.deps.assignmentPublisher.publishCurrentAssignment(competition.id);

    // 4. Replay shot backlog recorded during disconnection (isReplay=true)
    if (this.disconnectedAt) {
      await this.replayBacklog(competition.id, competition.sessionId, this.disconnectedAt);
    }

    // 5. Re-publish LaneCompetitionState as replay completion notification
    // (MQTT_DESIGN.md 7.4: means for the director to detect replay completion)
    await this.deps.competitionStatePublisher.publishCurrentState();

    this.disconnectedAt = null;
  }

  /** Clears all lane-owned retained topics when leaving a competition. */
  async clearCompetitionTopics(competitionId: string, laneId: string): Promise<void> {
    const retainedTopics = [
      mqttTopics.laneCompetitionState(competitionId, laneId),
      mqttTopics.laneScore(competitionId, laneId),
      mqttTopics.laneAssignment(competitionId, laneId),
      mqttTopics.timedTargetState(competitionId, laneId),
      mqttTopics.qualificationRecoveryState(competitionId, laneId),
    ];
    try {
      await Promise.all(
        retainedTopics.map((topic) => this.deps.mqttClient.publish(topic, '', { qos: 1, retain: true })),
      );
    } finally {
      this.deps.assignmentPublisher.clearStoredAssignment(competitionId);
    }
  }

  async replayTransferredSession(competitionId: string): Promise<void> {
    const competition = await this.deps.competitionRepository.findById(competitionId);
    if (!competition) throw new Error('Transferred competition not found');
    await this.replayBacklog(competitionId, competition.sessionId, new Date(0));
  }

  private async replayBacklog(competitionId: string, sessionId: string, since: Date): Promise<void> {
    const logger = getLogger();
    const session = await this.deps.sessionRepository.findById(sessionId);
    if (!session) return;

    // Filter shots recorded after disconnection (sorted by timestamp ascending)
    const backlogShots = session.allShots
      .filter((shot: Shot) => shot.timestamp >= since && !this.deps.excludeCompetitionShotReplay(shot.id))
      .sort((a: Shot, b: Shot) => a.timestamp.getTime() - b.timestamp.getTime());

    if (backlogShots.length === 0) return;

    logger.info(`[RetainPublisher] Replaying ${backlogShots.length} backlog shots`, 'mqtt', {
      competitionId,
      sessionId,
      since: since.toISOString(),
    });

    const laneId = readMirroredLaneId(this.deps.storage);
    const competition = await this.deps.competitionRepository.findActive();
    if (!competition) return;

    const topic = mqttTopics.competitionShot(competitionId, laneId);

    for (const shot of backlogShots) {
      const placement = resolveCompetitionShotPlacement(shot, session.allShots, competition);
      const stage = competition.config.stages[placement.stageIndex];
      const scored = stage?.scored ?? true;

      const payload = JSON.stringify({
        laneId,
        shotId: shot.id,
        x: shot.impactPoint?.x ?? null,
        y: shot.impactPoint?.y ?? null,
        ...toShotMqttEvidencePayload(shot),
        innerTen: shot.innerTen,
        mode: shot.mode.value,
        timestamp: shot.timestamp.toISOString(),
        competitionId,
        sessionId,
        stageIndex: placement.stageIndex,
        scored,
        seriesIndex: placement.seriesIndex,
        shotNumberInSeries: placement.shotNumberInSeries,
        isRecorded: shot.mode.isMatch() && scored,
        isReplay: true,
        publishedAt: new Date().toISOString(),
      });

      await this.deps.mqttClient.publish(topic, payload, { qos: 1, retain: false });
    }
  }
}
