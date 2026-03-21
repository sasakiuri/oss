// SPDX-License-Identifier: MIT
/**
 * LaneTier1CommandHandler
 *
 * @description
 * Handler that processes lane Tier1 commands (competition join/leave).
 * Subscribes to `saika/lane/{laneId}/command/+` and
 * processes join-competition / leave-competition.
 * On join, starts subscriptions for BroadcastCommandHandler / PerLaneCommandHandler.
 */

import type { z } from 'zod';

import type { CompetitionStateSubscriber } from '@/main/modules/mqtt/application/CompetitionStateSubscriber';
import type { RpcRequestHandler } from '@/main/modules/mqtt/application/RpcRequestHandler';
import type { CommandAckPayload } from '@/main/modules/mqtt/domain/MqttCommandSchemas';
import { JoinCompetitionCmdSchema, LeaveCompetitionCmdSchema } from '@/main/modules/mqtt/domain/MqttCommandSchemas';
import type { CommandIdempotencyGuard } from '@/main/modules/mqtt/infra/CommandIdempotencyGuard';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { BroadcastCommandHandler } from './BroadcastCommandHandler';
import type { PerLaneCommandHandler } from './PerLaneCommandHandler';

type Tier1Action = 'join-competition' | 'leave-competition';

const ACTION_SCHEMAS: Record<Tier1Action, z.ZodType> = {
  'join-competition': JoinCompetitionCmdSchema,
  'leave-competition': LeaveCompetitionCmdSchema,
};

/** Parsed parts of the topic */
interface ParsedTier1Topic {
  laneId: string;
  action: string;
}

export class LaneTier1CommandHandler {
  private subscribedTopic: string | null = null;
  private messageUnsubscribe: (() => void) | null = null;
  private currentCompetitionId: string | null = null;

  constructor(
    private readonly mqttClient: IMqttClientService,
    private readonly idempotencyGuard: CommandIdempotencyGuard,
    private readonly broadcastHandler: BroadcastCommandHandler,
    private readonly perLaneHandler: PerLaneCommandHandler,
    private readonly rpcHandler: RpcRequestHandler,
    private readonly competitionStateSubscriber: CompetitionStateSubscriber,
    private readonly getLaneId: () => string,
  ) {}

  /**
   * Subscribes to Tier1 commands
   */
  async subscribe(): Promise<void> {
    const topic = `saika/lane/${this.getLaneId()}/command/+`;
    this.subscribedTopic = topic;

    await this.mqttClient.subscribe(topic, 1);

    this.messageUnsubscribe = this.mqttClient.onMessage((msgTopic: string, payload: Buffer) => {
      const parsed = this.parseTopic(msgTopic);
      if (!parsed) return;
      if (parsed.laneId !== this.getLaneId()) return;

      void this.handleCommand(parsed, payload);
    });
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
    }
  }

  /**
   * Returns the competition ID currently joined
   */
  get competitionId(): string | null {
    return this.currentCompetitionId;
  }

  /**
   * Parses the topic
   * saika/lane/{laneId}/command/{action}
   */
  private parseTopic(topic: string): ParsedTier1Topic | null {
    const segments = topic.split('/');
    if (segments.length !== 5) return null;
    if (segments[0] !== 'saika' || segments[1] !== 'lane') return null;
    if (segments[3] !== 'command') return null;

    return {
      laneId: segments[2]!,
      action: segments[4]!,
    };
  }

  /**
   * Processes a command
   */
  private async handleCommand(parsed: ParsedTier1Topic, payload: Buffer): Promise<void> {
    const logger = getLogger();
    const { action } = parsed;
    const ackTopic = `saika/lane/${this.getLaneId()}/command/${action}/acknowledgement`;

    // JSON parse
    let rawData: unknown;
    try {
      rawData = JSON.parse(payload.toString());
    } catch {
      logger.error('[LaneTier1CommandHandler] Failed to parse JSON', 'mqtt', { action });
      return;
    }

    // Action schema validation
    const schema = ACTION_SCHEMAS[action as Tier1Action];
    if (!schema) {
      const error = ErrorCatalog.createError('MQTT_UNKNOWN_COMMAND_ACTION', { action });
      await this.publishAck(ackTopic, '', 'error', error.code, error.message);
      return;
    }

    const parseResult = schema.safeParse(rawData);
    if (!parseResult.success) {
      const error = ErrorCatalog.createError('MQTT_COMMAND_VALIDATION_FAILED', {
        action,
        detail: parseResult.error.message,
      });
      const commandId = (rawData as { commandId?: string }).commandId ?? '';
      await this.publishAck(ackTopic, commandId, 'error', error.code, error.message);
      return;
    }

    const command = parseResult.data as Record<string, unknown>;
    const commandId = command.commandId as string;

    // Idempotency check
    if (this.idempotencyGuard.check(commandId)) {
      logger.info(`[LaneTier1CommandHandler] Duplicate command skipped: ${commandId}`, 'mqtt');
      return;
    }

    // executing ACK
    await this.publishAck(ackTopic, commandId, 'executing');

    try {
      await this.executeAction(action as Tier1Action, command);
      await this.publishAck(ackTopic, commandId, 'done');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorCode = (err as { code?: string }).code ?? 'MQTT_COMMAND_EXECUTION_FAILED';
      logger.error(`[LaneTier1CommandHandler] Command failed: ${action}`, 'mqtt', {
        error: errorMessage,
        commandId,
      });
      await this.publishAck(ackTopic, commandId, 'error', errorCode, errorMessage);
    }
  }

  /**
   * Executes an action
   */
  private async executeAction(action: Tier1Action, command: Record<string, unknown>): Promise<void> {
    switch (action) {
      case 'join-competition': {
        const competitionId = command.competitionId as string;

        if (this.currentCompetitionId) {
          throw ErrorCatalog.createError('MQTT_ALREADY_IN_COMPETITION', {
            competitionId: this.currentCompetitionId,
          });
        }

        this.currentCompetitionId = competitionId;

        // Subscribe to the entire competition topic
        await this.mqttClient.subscribe(`saika/competition/${competitionId}/#`, 1);

        // Start subscriptions for each handler
        await this.broadcastHandler.subscribeToCompetition(competitionId);
        await this.perLaneHandler.subscribeToCompetition(competitionId);
        await this.rpcHandler.subscribe(competitionId);
        await this.competitionStateSubscriber.subscribe(competitionId);

        getLogger().info(`[LaneTier1CommandHandler] Joined competition: ${competitionId}`, 'mqtt');
        break;
      }

      case 'leave-competition': {
        const competitionId = command.competitionId as string;

        if (!this.currentCompetitionId) {
          throw ErrorCatalog.createError('MQTT_NOT_IN_COMPETITION');
        }

        // Unsubscribe each handler
        await this.broadcastHandler.unsubscribeFromCompetition();
        await this.perLaneHandler.unsubscribeFromCompetition();
        await this.rpcHandler.unsubscribe();
        await this.competitionStateSubscriber.unsubscribe();

        // Unsubscribe from the entire competition topic
        try {
          await this.mqttClient.unsubscribe(`saika/competition/${competitionId}/#`);
        } catch {
          // Ignore if already disconnected
        }

        this.currentCompetitionId = null;

        getLogger().info(`[LaneTier1CommandHandler] Left competition: ${competitionId}`, 'mqtt');
        break;
      }
    }
  }

  /**
   * Publishes an ACK
   */
  private async publishAck(
    topic: string,
    commandId: string,
    status: CommandAckPayload['status'],
    errorCode?: string,
    errorMessage?: string,
  ): Promise<void> {
    const ack: CommandAckPayload = {
      commandId,
      laneId: this.getLaneId(),
      status,
      acknowledgedAt: new Date().toISOString(),
      ...(errorCode && errorMessage ? { error: { code: errorCode, message: errorMessage } } : {}),
    };

    try {
      await this.mqttClient.publish(topic, JSON.stringify(ack), { qos: 1, retain: false });
    } catch (err) {
      getLogger().error('[LaneTier1CommandHandler] Failed to publish ACK', 'mqtt', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
