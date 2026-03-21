// SPDX-License-Identifier: MIT
/**
 * BroadcastCommandHandler
 *
 * @description
 * Handler that processes competition-wide broadcast commands.
 * Subscribes to `saika/competition/{competitionId}/command/+` and
 * calls CommandBus / LaneTimerService according to the action.
 * Implements the 2-phase ACK (executing → done/error) pattern.
 */

import type { z } from 'zod';

import {
  AdvanceStageToken,
  EndStageToken,
  FinishCompetitionToken,
  StartNextSeriesToken,
  StartStageToken,
} from '@/main/composition/tokens';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import type { CommandAckPayload } from '@/main/modules/mqtt/domain/MqttCommandSchemas';
import {
  AdvanceSeriesCmdSchema,
  EndSightingCmdSchema,
  FinishCompetitionCmdSchema,
  StartMatchCmdSchema,
  StartSightingCmdSchema,
  TimerExpiredCmdSchema,
  TimerStartedCmdSchema,
} from '@/main/modules/mqtt/domain/MqttCommandSchemas';
import type { CommandIdempotencyGuard } from '@/main/modules/mqtt/infra/CommandIdempotencyGuard';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

type BroadcastAction =
  | 'start-sighting'
  | 'end-sighting'
  | 'start-match'
  | 'advance-series'
  | 'finish-competition'
  | 'timer-started'
  | 'timer-expired';

const CLOCK_DRIFT_WARNING_THRESHOLD_MS = 5_000;
const CLOCK_DRIFT_REJECT_THRESHOLD_MS = 30_000;

const TIMER_ACTIONS: ReadonlySet<BroadcastAction> = new Set(['start-sighting', 'start-match', 'timer-started']);

const ACTION_SCHEMAS: Record<BroadcastAction, z.ZodType> = {
  'start-sighting': StartSightingCmdSchema,
  'end-sighting': EndSightingCmdSchema,
  'start-match': StartMatchCmdSchema,
  'advance-series': AdvanceSeriesCmdSchema,
  'finish-competition': FinishCompetitionCmdSchema,
  'timer-started': TimerStartedCmdSchema,
  'timer-expired': TimerExpiredCmdSchema,
};

/** Parsed parts of the topic */
interface ParsedBroadcastTopic {
  competitionId: string;
  action: string;
}

export class BroadcastCommandHandler {
  private subscribedTopic: string | null = null;
  private messageUnsubscribe: (() => void) | null = null;

  constructor(
    private readonly mqttClient: IMqttClientService,
    private readonly commandBus: CommandBus,
    private readonly timerService: LaneTimerService,
    private readonly idempotencyGuard: CommandIdempotencyGuard,
    private readonly getLaneId: () => string,
    _competitionId: string,
  ) {}

  /**
   * Subscribes to competition broadcast commands
   */
  async subscribeToCompetition(competitionId: string): Promise<void> {
    await this.unsubscribeFromCompetition();

    const topic = `saika/competition/${competitionId}/command/+`;
    this.subscribedTopic = topic;

    await this.mqttClient.subscribe(topic, 1);

    this.messageUnsubscribe = this.mqttClient.onMessage((msgTopic: string, payload: Buffer) => {
      const parsed = this.parseTopic(msgTopic);
      if (!parsed) return;

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
   * saika/competition/{competitionId}/command/{action}
   */
  private parseTopic(topic: string): ParsedBroadcastTopic | null {
    const segments = topic.split('/');
    if (segments.length !== 5) return null;
    if (segments[0] !== 'saika' || segments[1] !== 'competition') return null;
    if (segments[3] !== 'command') return null;

    return {
      competitionId: segments[2]!,
      action: segments[4]!,
    };
  }

  /**
   * Processes a command
   */
  private async handleCommand(parsed: ParsedBroadcastTopic, payload: Buffer): Promise<void> {
    const logger = getLogger();
    const { action, competitionId } = parsed;
    const ackTopic = `saika/competition/${competitionId}/command/${action}/acknowledgement/${this.getLaneId()}`;

    // JSON parse
    let rawData: unknown;
    try {
      rawData = JSON.parse(payload.toString());
    } catch {
      logger.error('[BroadcastCommandHandler] Failed to parse JSON', 'mqtt', { action });
      return;
    }

    // Action schema validation
    const schema = ACTION_SCHEMAS[action as BroadcastAction];
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
      logger.info(`[BroadcastCommandHandler] Duplicate command skipped: ${commandId}`, 'mqtt');
      return;
    }

    // start-sighting: targetLaneIds filtering
    if (action === 'start-sighting') {
      const targetLaneIds = command.targetLaneIds as string[] | undefined;
      if (targetLaneIds && !targetLaneIds.includes(this.getLaneId())) {
        logger.info(`[BroadcastCommandHandler] Lane ${this.getLaneId()} not in targetLaneIds, skipping`, 'mqtt');
        return;
      }
    }

    // Clock drift check (timer-related actions only)
    let doneWarning: string | undefined;
    if (TIMER_ACTIONS.has(action as BroadcastAction)) {
      const timerStartAt = command.timerStartAt as string | undefined;
      if (timerStartAt) {
        const drift = Math.abs(Date.now() - new Date(timerStartAt).getTime());
        if (drift > CLOCK_DRIFT_REJECT_THRESHOLD_MS) {
          const error = ErrorCatalog.createError('MQTT_CLOCK_OUT_OF_SYNC', { driftMs: drift });
          logger.error(`[BroadcastCommandHandler] Clock out of sync: driftMs=${drift}`, 'mqtt', { commandId, action });
          await this.publishAck(ackTopic, commandId, 'error', error.code, error.message);
          return;
        } else if (drift > CLOCK_DRIFT_WARNING_THRESHOLD_MS) {
          doneWarning = 'clock_drift_detected';
          logger.warn(`[BroadcastCommandHandler] Clock drift detected: driftMs=${drift}`, 'mqtt', {
            commandId,
            action,
          });
        }
      }
    }

    // executing ACK
    await this.publishAck(ackTopic, commandId, 'executing');

    try {
      await this.executeAction(action as BroadcastAction, command, competitionId);
      await this.publishAck(ackTopic, commandId, 'done', undefined, undefined, doneWarning);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorCode = (err as { code?: string }).code ?? 'MQTT_COMMAND_EXECUTION_FAILED';
      logger.error(`[BroadcastCommandHandler] Command failed: ${action}`, 'mqtt', {
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
    action: BroadcastAction,
    command: Record<string, unknown>,
    competitionId: string,
  ): Promise<void> {
    switch (action) {
      case 'start-sighting':
        await this.commandBus.execute(StartStageToken, { competitionId });
        await this.timerService.startAt(
          competitionId,
          command.timerStartAt as string,
          command.timerDurationSeconds as number,
        );
        break;

      case 'end-sighting':
        await this.commandBus.execute(EndStageToken, { competitionId });
        break;

      case 'start-match':
        await this.commandBus.execute(StartNextSeriesToken, { competitionId });
        await this.timerService.startAt(
          competitionId,
          command.timerStartAt as string,
          command.timerDurationSeconds as number,
        );
        break;

      case 'advance-series':
        await this.commandBus.execute(AdvanceStageToken, { competitionId });
        break;

      case 'finish-competition':
        await this.commandBus.execute(FinishCompetitionToken, { competitionId });
        break;

      case 'timer-started':
        await this.timerService.startAt(
          competitionId,
          command.timerStartAt as string,
          command.timerDurationSeconds as number,
        );
        break;

      case 'timer-expired':
        this.timerService.stop();
        break;
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
    warning?: string,
  ): Promise<void> {
    const ack: CommandAckPayload = {
      commandId,
      laneId: this.getLaneId(),
      status,
      acknowledgedAt: new Date().toISOString(),
      ...(errorCode && errorMessage ? { error: { code: errorCode, message: errorMessage } } : {}),
      ...(warning ? { warning } : {}),
    };

    try {
      await this.mqttClient.publish(topic, JSON.stringify(ack), { qos: 1, retain: false });
    } catch (err) {
      getLogger().error('[BroadcastCommandHandler] Failed to publish ACK', 'mqtt', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
