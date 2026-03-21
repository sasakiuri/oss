// SPDX-License-Identifier: MIT
/**
 * CompetitionStateSubscriber
 *
 * @description
 * Subscribes to `saika/competition/{competitionId}/state` published by the Director,
 * detects competition phase changes, and logs them.
 * Subscribes on join-competition and unsubscribes on leave-competition.
 */

import {
  CompetitionStatePayloadSchema,
  type CompetitionStatePayload,
} from '@/main/modules/mqtt/domain/MqttCompetitionStateSchemas';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import { getLogger } from '@/main/shared-infra/logging/createLogger';

export class CompetitionStateSubscriber {
  private subscribedTopic: string | null = null;
  private messageUnsubscribe: (() => void) | null = null;
  private lastPhase: string | null = null;

  constructor(private readonly mqttClient: IMqttClientService) {}

  /**
   * Subscribes to the competition state topic
   */
  async subscribe(competitionId: string): Promise<void> {
    await this.unsubscribe();

    const topic = `saika/competition/${competitionId}/state`;
    this.subscribedTopic = topic;
    this.lastPhase = null;

    await this.mqttClient.subscribe(topic, 1);

    this.messageUnsubscribe = this.mqttClient.onMessage((msgTopic: string, payload: Buffer) => {
      if (msgTopic !== topic) return;
      this.handleMessage(payload);
    });

    getLogger().info(`[CompetitionStateSubscriber] Subscribed to ${topic}`, 'mqtt');
  }

  /**
   * Unsubscribes
   */
  async unsubscribe(): Promise<void> {
    this.messageUnsubscribe?.();
    this.messageUnsubscribe = null;

    if (this.subscribedTopic) {
      try {
        await this.mqttClient.unsubscribe(this.subscribedTopic);
      } catch {
        // Ignore if already disconnected
      }
      this.subscribedTopic = null;
      this.lastPhase = null;
    }
  }

  /**
   * Processes a message
   */
  private handleMessage(payload: Buffer): void {
    const logger = getLogger();

    let rawData: unknown;
    try {
      rawData = JSON.parse(payload.toString());
    } catch {
      logger.error('[CompetitionStateSubscriber] Failed to parse JSON', 'mqtt');
      return;
    }

    const parseResult = CompetitionStatePayloadSchema.safeParse(rawData);
    if (!parseResult.success) {
      logger.warn('[CompetitionStateSubscriber] Invalid payload', 'mqtt', {
        error: parseResult.error.message,
      });
      return;
    }

    const data: CompetitionStatePayload = parseResult.data;

    if (data.phase !== this.lastPhase) {
      logger.info(`[CompetitionStateSubscriber] Phase changed: ${this.lastPhase ?? '(none)'} → ${data.phase}`, 'mqtt', {
        competitionId: data.competitionId,
        competitionTypeId: data.competitionTypeId,
        phase: data.phase,
      });
      this.lastPhase = data.phase;
    }
  }
}
