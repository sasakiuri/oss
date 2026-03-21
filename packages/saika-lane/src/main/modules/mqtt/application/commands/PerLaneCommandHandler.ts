// SPDX-License-Identifier: MIT
/**
 * PerLaneCommandHandler
 *
 * @description
 * Handler that processes lane-specific commands.
 * Subscribes to `saika/competition/{competitionId}/lane/{laneId}/command/+` and
 * executes assign-athlete / reset-session via CommandBus.
 */

import type { z } from 'zod';

import { AssignAthleteToken, ResetSessionToken } from '@/main/composition/tokens';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { CommandAckPayload } from '@/main/modules/mqtt/domain/MqttCommandSchemas';
import { AssignAthleteCmdSchema, ResetSessionCmdSchema } from '@/main/modules/mqtt/domain/MqttCommandSchemas';
import type { CommandIdempotencyGuard } from '@/main/modules/mqtt/infra/CommandIdempotencyGuard';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

type PerLaneAction = 'assign-athlete' | 'reset-session';

const ACTION_SCHEMAS: Record<PerLaneAction, z.ZodType> = {
  'assign-athlete': AssignAthleteCmdSchema,
  'reset-session': ResetSessionCmdSchema,
};

/** Parsed parts of the topic */
interface ParsedPerLaneTopic {
  competitionId: string;
  laneId: string;
  action: string;
}

export class PerLaneCommandHandler {
  private subscribedTopic: string | null = null;
  private messageUnsubscribe: (() => void) | null = null;

  constructor(
    private readonly mqttClient: IMqttClientService,
    private readonly commandBus: CommandBus,
    private readonly idempotencyGuard: CommandIdempotencyGuard,
    private readonly competitionRepository: ICompetitionRepository,
    private readonly getLaneId: () => string,
    _competitionId: string,
  ) {}

  /**
   * Subscribes to lane-specific commands
   */
  async subscribeToCompetition(competitionId: string): Promise<void> {
    await this.unsubscribeFromCompetition();

    const topic = `saika/competition/${competitionId}/lane/${this.getLaneId()}/command/+`;
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
   * Unsubscribes from the competition
   */
  async unsubscribeFromCompetition(): Promise<void> {
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
   * Parses the topic
   * saika/competition/{competitionId}/lane/{laneId}/command/{action}
   */
  private parseTopic(topic: string): ParsedPerLaneTopic | null {
    const segments = topic.split('/');
    if (segments.length !== 7) return null;
    if (segments[0] !== 'saika' || segments[1] !== 'competition') return null;
    if (segments[3] !== 'lane') return null;
    if (segments[5] !== 'command') return null;

    return {
      competitionId: segments[2]!,
      laneId: segments[4]!,
      action: segments[6]!,
    };
  }

  /**
   * Processes a command
   */
  private async handleCommand(parsed: ParsedPerLaneTopic, payload: Buffer): Promise<void> {
    const logger = getLogger();
    const { action, competitionId } = parsed;
    const ackTopic = `saika/competition/${competitionId}/lane/${this.getLaneId()}/command/${action}/acknowledgement`;

    // JSON parse
    let rawData: unknown;
    try {
      rawData = JSON.parse(payload.toString());
    } catch {
      logger.error('[PerLaneCommandHandler] Failed to parse JSON', 'mqtt', { action });
      return;
    }

    // Action schema validation
    const schema = ACTION_SCHEMAS[action as PerLaneAction];
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
      logger.info(`[PerLaneCommandHandler] Duplicate command skipped: ${commandId}`, 'mqtt');
      return;
    }

    // executing ACK
    await this.publishAck(ackTopic, commandId, 'executing');

    try {
      await this.executeAction(action as PerLaneAction, command, competitionId);
      await this.publishAck(ackTopic, commandId, 'done');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorCode = (err as { code?: string }).code ?? 'MQTT_COMMAND_EXECUTION_FAILED';
      logger.error(`[PerLaneCommandHandler] Command failed: ${action}`, 'mqtt', {
        error: errorMessage,
        commandId,
      });
      await this.publishAck(ackTopic, commandId, 'error', errorCode, errorMessage);
    }
  }

  /**
   * Executes an action
   */
  private async executeAction(
    action: PerLaneAction,
    command: Record<string, unknown>,
    competitionId: string,
  ): Promise<void> {
    switch (action) {
      case 'assign-athlete': {
        const athlete = command.athlete as { name: string } | null;
        await this.commandBus.execute(AssignAthleteToken, {
          competitionId,
          athleteName: athlete?.name ?? null,
        });
        break;
      }

      case 'reset-session': {
        // ResetSession requires a sessionId. Retrieve CompetitionState from competitionId to resolve sessionId.
        const competition = await this.competitionRepository.findById(competitionId);
        if (!competition) {
          throw ErrorCatalog.createError('COMPETITION_NOT_FOUND', { competitionId });
        }
        await this.commandBus.execute(ResetSessionToken, {
          sessionId: competition.sessionId,
        });
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
      getLogger().error('[PerLaneCommandHandler] Failed to publish ACK', 'mqtt', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
