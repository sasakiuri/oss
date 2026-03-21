// SPDX-License-Identifier: MIT
/**
 * RetainPublisher
 *
 * @description
 * Re-publishes all Retain topics on MQTT reconnect and
 * replays shots recorded during disconnection with isReplay=true.
 *
 * Conforms to MQTT_DESIGN.md Section 7.2, 7.4, 7.5.
 */

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { Shot } from '@/main/modules/session/domain/Shot';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { HardwareStatePublisher } from './HardwareStatePublisher';
import type { LaneCompetitionStatePublisher } from './LaneCompetitionStatePublisher';
import type { LaneScorePublisher } from './LaneScorePublisher';

export class RetainPublisher {
  private readonly mqttClient: IMqttClientService;
  private readonly storage: ILocalStorage;
  private readonly competitionRepository: ICompetitionRepository;
  private readonly sessionRepository: ISessionRepository;
  private readonly hardwarePublisher: HardwareStatePublisher;
  private readonly competitionStatePublisher: LaneCompetitionStatePublisher;
  private readonly scorePublisher: LaneScorePublisher;
  private disconnectedAt: Date | null = null;
  private isInitialConnect = true;

  constructor(
    mqttClient: IMqttClientService,
    storage: ILocalStorage,
    competitionRepository: ICompetitionRepository,
    sessionRepository: ISessionRepository,
    hardwarePublisher: HardwareStatePublisher,
    competitionStatePublisher: LaneCompetitionStatePublisher,
    scorePublisher: LaneScorePublisher,
  ) {
    this.mqttClient = mqttClient;
    this.storage = storage;
    this.competitionRepository = competitionRepository;
    this.sessionRepository = sessionRepository;
    this.hardwarePublisher = hardwarePublisher;
    this.competitionStatePublisher = competitionStatePublisher;
    this.scorePublisher = scorePublisher;
  }

  /**
   * Registers with MqttClientService's onConnect/onDisconnect.
   * Does not republish on the initial connection (since connectMqtt in mqtt.module publishes manually).
   */
  registerCallbacks(): void {
    this.mqttClient.onDisconnect(() => {
      this.disconnectedAt = new Date();
    });

    this.mqttClient.onConnect(() => {
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
    this.hardwarePublisher.publishState();

    // 2. Re-publish competition-related Retain topics
    const competition = await this.competitionRepository.findActive();
    if (!competition) {
      this.disconnectedAt = null;
      return;
    }

    // 3. Re-publish LaneCompetitionState and LaneScore
    this.competitionStatePublisher.publishCurrentState();
    this.scorePublisher.publishCurrentScore();

    // 4. Replay shot backlog recorded during disconnection (isReplay=true)
    if (this.disconnectedAt) {
      await this.replayBacklog(competition.id, competition.sessionId, this.disconnectedAt);
    }

    // 5. Re-publish LaneCompetitionState as replay completion notification
    // (MQTT_DESIGN.md 7.4: means for the director to detect replay completion)
    this.competitionStatePublisher.publishCurrentState();

    this.disconnectedAt = null;
  }

  private async replayBacklog(competitionId: string, sessionId: string, since: Date): Promise<void> {
    const logger = getLogger();
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) return;

    // Filter shots recorded after disconnection (sorted by timestamp ascending)
    const backlogShots = session.allShots
      .filter((shot: Shot) => shot.timestamp >= since)
      .sort((a: Shot, b: Shot) => a.timestamp.getTime() - b.timestamp.getTime());

    if (backlogShots.length === 0) return;

    logger.info(`[RetainPublisher] Replaying ${backlogShots.length} backlog shots`, 'mqtt', {
      competitionId,
      sessionId,
      since: since.toISOString(),
    });

    const laneId = this.storage.get<string>('mqtt.laneId') ?? '';
    const competition = await this.competitionRepository.findActive();
    if (!competition) return;

    const topic = `saika/competition/${competitionId}/lane/${laneId}/shot`;

    for (const shot of backlogShots) {
      const stageIndex = competition.currentStageIndex;
      const stage = competition.config.stages[stageIndex];
      const scored = stage?.scored ?? true;

      const payload = JSON.stringify({
        laneId,
        shotId: shot.id,
        x: shot.impactPoint?.x ?? 0,
        y: shot.impactPoint?.y ?? 0,
        rawScoreX10: shot.score.value,
        innerTen: shot.innerTen,
        mode: shot.mode.value,
        timestamp: shot.timestamp.toISOString(),
        competitionId,
        sessionId,
        stageIndex,
        scored,
        seriesIndex: competition.currentSeriesIndex,
        shotNumberInSeries: shot.shotNumber,
        isRecorded: shot.mode.isMatch() && scored,
        isReplay: true,
        publishedAt: new Date().toISOString(),
      });

      await this.mqttClient.publish(topic, payload, { qos: 1, retain: false });
    }
  }
}
